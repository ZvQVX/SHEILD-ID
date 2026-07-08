from __future__ import annotations

import os
import smtplib
import threading
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote

from flask import Flask, jsonify, request, send_from_directory

from auth_provider import ADProvider
from ml_engine import MLEngine
from security_vault import SecurityVault


# In-memory queue for lab demos: reset tokens are shown only to supervisors (admin JWT).
_RESET_QUEUE: list[dict[str, str]] = []
_RESET_LOCK = threading.Lock()
_MAX_RESET_QUEUE = 100


def _enqueue_password_reset(sam: str, token: str, reset_url: str) -> str:
    rid = str(uuid.uuid4())
    rec = {
        "id": rid,
        "sam": sam,
        "token": token,
        "reset_url": reset_url,
        "requested_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    }
    global _RESET_QUEUE
    with _RESET_LOCK:
        _RESET_QUEUE.insert(0, rec)
        if len(_RESET_QUEUE) > _MAX_RESET_QUEUE:
            _RESET_QUEUE = _RESET_QUEUE[:_MAX_RESET_QUEUE]
    return rid


def _list_password_resets() -> list[dict[str, str]]:
    with _RESET_LOCK:
        return [dict(x) for x in _RESET_QUEUE]


def _remove_password_resets_for_sam(sam: str) -> None:
    key = sam.lower()
    global _RESET_QUEUE
    with _RESET_LOCK:
        _RESET_QUEUE = [x for x in _RESET_QUEUE if str(x.get("sam", "")).lower() != key]


def _remove_password_reset_by_id(rid: str) -> bool:
    global _RESET_QUEUE
    with _RESET_LOCK:
        before = len(_RESET_QUEUE)
        _RESET_QUEUE = [x for x in _RESET_QUEUE if str(x.get("id", "")) != rid]
        return len(_RESET_QUEUE) < before


def _send_reset_notify_admin(to_addr: str, sam: str, token: str, reset_url: str) -> None:
    """Email the supervisor mailbox with the reset token (optional; requires SMTP_*)."""
    host = (os.environ.get("SMTP_HOST") or "").strip()
    if not host:
        raise RuntimeError("SMTP_HOST not set")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = os.environ.get("SMTP_PASSWORD") or ""
    from_addr = (os.environ.get("SMTP_FROM") or user or "noreply@localhost").strip()
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

    msg = EmailMessage()
    msg["Subject"] = f"SHIELD-ID password reset request ({sam})"
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(
        f"A password reset was requested for AD account: {sam}\n\n"
        f"Give this one-time token to the user (expires in 30 minutes):\n\n{token}\n\n"
        f"Reset page URL (optional):\n{reset_url}\n\n"
        "If this was not expected, ignore this message.\n"
    )

    with smtplib.SMTP(host, port, timeout=25) as smtp:
        if use_tls:
            smtp.starttls()
        if user:
            smtp.login(user, password)
        smtp.send_message(msg)


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)

    dist_dir = Path(__file__).parent / "she" / "dist"
    vault = SecurityVault()
    # Demo-friendly default: standard LDAP (389). Switch to LDAPS (636) after DC cert setup.
    ad = ADProvider(
        server_ip=os.environ.get("AD_SERVER_IP", "192.168.56.10"),
        domain=os.environ.get("AD_DOMAIN_NETBIOS", "SERVER"),
        upn_suffix=os.environ.get("AD_UPN_SUFFIX", "SERVER.ZAID"),
        port=int(os.environ.get("AD_PORT", "389")),
        use_ssl=os.environ.get("AD_USE_SSL", "false").lower() in ("1", "true", "yes"),
        insecure_skip_verify=os.environ.get("AD_INSECURE_SKIP_VERIFY", "true").lower() in ("1", "true", "yes"),
    )
    ml = MLEngine(model_path="biometric_rf_model.pkl")
    audit_path = Path(__file__).resolve().parent / "security_audit.enc"

    def _append_audit_plain(plain: str) -> None:
        token = vault.encrypt_data(plain)
        with open(audit_path, "a", encoding="utf-8") as f:
            f.write(token + "\n")

    def _decode_bearer_token() -> dict | None:
        auth = request.headers.get("Authorization") or ""
        if not auth.lower().startswith("bearer "):
            return None
        token = auth.split(" ", 1)[1].strip()
        return ad.decode_jwt(token)

    def _lab_password_reset_enabled() -> bool:
        return os.environ.get("SHIELD_LAB_PASSWORD_RESET", "true").lower() in ("1", "true", "yes")

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    # --- Static UI (built React) ---
    @app.get("/")
    def index():
        if dist_dir.exists():
            return send_from_directory(dist_dir, "index.html")
        return (
            "UI build not found. Build the React app in ./she first (dist/ missing).",
            500,
        )

    @app.get("/<path:path>")
    def static_proxy(path: str):
        if dist_dir.exists() and (dist_dir / path).exists():
            return send_from_directory(dist_dir, path)
        if dist_dir.exists():
            return send_from_directory(dist_dir, "index.html")
        return ("Not found", 404)

    def _do_login(username: str, password: str):
        if not username or not password:
            return jsonify({"ok": False, "error": "Missing username/password"}), 400

        success, role = ad.verify_credentials(username, password)
        if not success:
            return jsonify({"ok": False, "error": "Invalid credentials"}), 401

        r = role or "user"
        try:
            iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            _append_audit_plain(f"{iso} | user={username} | role={r} | event=LOGIN | source=server")
        except Exception:
            pass

        token = ad.generate_jwt(username, role=r)
        return jsonify({"ok": True, "token": token, "role": r})

    # --- Step 1: AD DS bind -> JWT ---
    @app.post("/api/auth/login")
    def login():
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        return _do_login(username, password)

    # Backwards-compatible route name (matches the snippet)
    @app.post("/auth")
    def auth_alias():
        data = request.get_json(silent=True) or {}
        username = (data.get("u") or data.get("username") or "").strip()
        password = data.get("p") or data.get("password") or ""
        resp = _do_login(username, password)
        # snippet returns {"token": "..."} without ok flag; keep both
        if isinstance(resp, tuple) and len(resp) == 2:
            body, code = resp
            if code == 200:
                token = body.json.get("token")  # type: ignore[attr-defined]
                role = body.json.get("role")  # type: ignore[attr-defined]
                return jsonify({"token": token, "ok": True, "role": role}), 200
        return resp

    @app.post("/api/auth/forgot-password")
    def forgot_password():
        if not _lab_password_reset_enabled():
            return jsonify({"ok": False, "error": "Lab password reset is disabled (SHIELD_LAB_PASSWORD_RESET)."}), 403

        bind_user = os.environ.get("AD_BIND_USER", "")
        bind_password = os.environ.get("AD_BIND_PASSWORD", "")
        if not bind_user or not bind_password:
            return jsonify({"ok": False, "error": "Server missing AD_BIND_USER / AD_BIND_PASSWORD."}), 500

        data = request.get_json(silent=True) or {}
        username = (data.get("username") or "").strip()
        if not username:
            return jsonify({"ok": False, "error": "Missing username"}), 400

        dn, _, err = ad.service_account_find_user(bind_user, bind_password, username)
        if err:
            return jsonify({"ok": False, "error": err}), 500

        generic_msg = (
            "If an account exists for that name, contact your supervisor. "
            "They will retrieve a one-time reset token from the supervisor dashboard and give it to you."
        )
        generic = {"ok": True, "message": generic_msg}
        if not dn:
            return jsonify(generic)

        token = ad.issue_password_reset_token(username)
        sam = ad.decode_password_reset_token(token)
        if not sam:
            return jsonify({"ok": False, "error": "Could not issue reset token."}), 500
        base = (os.environ.get("SHIELD_PUBLIC_ORIGIN") or "").strip().rstrip("/") or request.url_root.rstrip("/")
        reset_url = f"{base}/reset-password?token={quote(token, safe='')}"

        _enqueue_password_reset(sam, token, reset_url)

        try:
            iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            _append_audit_plain(f"{iso} | user={sam} | role=system | event=PWD_RESET_REQUEST | source=server")
        except Exception:
            pass

        admin_inbox = (os.environ.get("SHIELD_ADMIN_RESET_INBOX") or "").strip()
        smtp_host = (os.environ.get("SMTP_HOST") or "").strip()
        extra = ""
        if smtp_host and admin_inbox:
            try:
                _send_reset_notify_admin(admin_inbox, sam, token, reset_url)
                extra = " A notification email was sent to the administrator mailbox."
            except Exception:
                extra = " (Administrator email notification failed; use the supervisor dashboard.)"

        return jsonify({"ok": True, "message": generic_msg + extra, "delivered": "supervisor"})

    @app.post("/api/auth/reset-password")
    def reset_password():
        if not _lab_password_reset_enabled():
            return jsonify({"ok": False, "error": "Lab password reset is disabled (SHIELD_LAB_PASSWORD_RESET)."}), 403

        bind_user = os.environ.get("AD_BIND_USER", "")
        bind_password = os.environ.get("AD_BIND_PASSWORD", "")
        if not bind_user or not bind_password:
            return jsonify({"ok": False, "error": "Server missing AD_BIND_USER / AD_BIND_PASSWORD."}), 500

        data = request.get_json(silent=True) or {}
        token = (data.get("token") or "").strip()
        new_password = data.get("new_password") or ""
        confirm = data.get("confirm_password") or ""

        if not token or not new_password:
            return jsonify({"ok": False, "error": "Missing token or password"}), 400
        if new_password != confirm:
            return jsonify({"ok": False, "error": "Passwords do not match"}), 400

        sam = ad.decode_password_reset_token(token)
        if not sam:
            return jsonify({"ok": False, "error": "Invalid or expired reset link."}), 400

        ok, msg = ad.reset_user_password_for_sam(
            bind_user, bind_password, sam_account_name=sam, new_password=new_password
        )
        if not ok:
            return jsonify({"ok": False, "error": msg}), 400

        _remove_password_resets_for_sam(sam)

        try:
            iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            _append_audit_plain(f"{iso} | user={sam} | role=system | event=PWD_RESET_COMPLETED | source=server")
        except Exception:
            pass

        return jsonify({"ok": True, "message": "Password updated. Sign in with your new password."})

    def _require_admin() -> tuple[bool, str | None]:
        payload = _decode_bearer_token()
        if not payload:
            return False, None
        role = payload.get("role")
        return role == "admin", role if isinstance(role, str) else None

    def _signup_supervisor_group_dns(bind_u: str, bind_pw: str) -> list[str]:
        """DNs of AD groups new employees should join to receive JWT role admin (memberOf match)."""
        raw = (os.environ.get("SHIELD_SIGNUP_ADMIN_GROUP_DNS") or "").strip()
        if raw:
            return [x.strip() for x in raw.split(",") if x.strip()]
        for tok in ad.admin_group_tokens:
            gdn = ad.find_security_group_dn(bind_u, bind_pw, tok)
            if gdn:
                return [gdn]
        return []

    @app.post("/api/auth/signup")
    def signup():
        is_admin, _role = _require_admin()
        if not is_admin:
            return jsonify({"ok": False, "error": "Access Denied: Supervisors only"}), 403

        bind_user = os.environ.get("AD_BIND_USER", "")
        bind_password = os.environ.get("AD_BIND_PASSWORD", "")
        users_ou_dn = os.environ.get("AD_USERS_OU_DN", "")
        if not bind_user or not bind_password or not users_ou_dn:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Server not configured for signup (missing AD_BIND_USER / AD_BIND_PASSWORD / AD_USERS_OU_DN).",
                    }
                ),
                500,
            )

        data = request.get_json(silent=True) or {}
        new_username = (data.get("username") or "").strip()
        new_password = data.get("password") or ""
        if not new_username or not new_password:
            return jsonify({"ok": False, "error": "Missing username/password"}), 400

        given_name = (data.get("givenName") or data.get("given_name") or "").strip() or None
        surname = (data.get("sn") or data.get("surname") or "").strip() or None
        display_name = (data.get("displayName") or data.get("display_name") or "").strip() or None
        mail = (data.get("mail") or data.get("email") or "").strip() or None

        grant_raw = data.get("grantAdmin", data.get("grant_admin", True))
        if isinstance(grant_raw, str):
            grant_supervisor = grant_raw.strip().lower() in ("1", "true", "yes")
        else:
            grant_supervisor = bool(grant_raw)

        add_groups = _signup_supervisor_group_dns(bind_user, bind_password) if grant_supervisor else []

        ok, msg = ad.create_user(
            bind_user,
            bind_password,
            ou_dn=users_ou_dn,
            username=new_username,
            password=new_password,
            given_name=given_name,
            surname=surname,
            display_name=display_name,
            mail=mail,
            add_to_group_dns=add_groups or None,
            must_change_password=False,
        )
        if not ok:
            return jsonify({"ok": False, "error": msg}), 400
        body: dict = {"ok": True, "user_dn": msg}
        if grant_supervisor and not add_groups:
            body["warning"] = (
                "Account created but no SHIELD supervisor group was found. "
                "Create a group whose name matches SHIELD_ADMIN_GROUP_TOKENS (default SHIELD_ADMINS), "
                "or set SHIELD_SIGNUP_ADMIN_GROUP_DNS to its LDAP DN so new users get admin in SHIELD-ID."
            )
        return jsonify(body)

    @app.post("/api/auth/self-signup")
    def self_signup():
        # Self-signup is risky in real orgs; keep it behind an env flag for demos.
        if os.environ.get("AD_ALLOW_SELF_SIGNUP", "false").lower() not in ("1", "true", "yes"):
            return jsonify({"ok": False, "error": "Self-signup disabled"}), 403

        bind_user = os.environ.get("AD_BIND_USER", "")
        bind_password = os.environ.get("AD_BIND_PASSWORD", "")
        users_ou_dn = os.environ.get("AD_USERS_OU_DN", "")
        if not bind_user or not bind_password or not users_ou_dn:
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": "Server not configured for signup (missing AD_BIND_USER / AD_BIND_PASSWORD / AD_USERS_OU_DN).",
                    }
                ),
                500,
            )

        data = request.get_json(silent=True) or {}
        new_username = (data.get("username") or "").strip()
        new_password = data.get("password") or ""
        if not new_username or not new_password:
            return jsonify({"ok": False, "error": "Missing username/password"}), 400

        given_name = (data.get("givenName") or data.get("given_name") or "").strip() or None
        surname = (data.get("sn") or data.get("surname") or "").strip() or None
        display_name = (data.get("displayName") or data.get("display_name") or "").strip() or None
        mail = (data.get("mail") or data.get("email") or "").strip() or None

        ok, msg = ad.create_user(
            bind_user,
            bind_password,
            ou_dn=users_ou_dn,
            username=new_username,
            password=new_password,
            given_name=given_name,
            surname=surname,
            display_name=display_name,
            mail=mail,
            must_change_password=False,
        )
        if not ok:
            return jsonify({"ok": False, "error": msg}), 400
        return jsonify({"ok": True, "user_dn": msg})

    # --- Step 2: encrypted audit log append (requires JWT so rows are attributable) ---
    @app.post("/api/audit/append")
    def audit_append():
        payload = _decode_bearer_token()
        if not payload:
            return jsonify({"ok": False, "error": "Missing or invalid Authorization bearer token"}), 401

        data = request.get_json(silent=True) or {}
        entry = data.get("entry")
        if not isinstance(entry, str) or not entry.strip():
            return jsonify({"ok": False, "error": "Missing entry"}), 400

        user = payload.get("user")
        if not isinstance(user, str) or not user.strip():
            return jsonify({"ok": False, "error": "Invalid token subject"}), 401
        role = payload.get("role") if isinstance(payload.get("role"), str) else "user"

        iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        line = f"{iso} | user={user.strip()} | role={role} | {entry.strip()}"
        _append_audit_plain(line)
        return jsonify({"ok": True})

    @app.get("/api/admin/audit-log")
    def admin_audit_log():
        is_admin, _role = _require_admin()
        if not is_admin:
            return jsonify({"ok": False, "error": "Supervisors only"}), 403

        try:
            limit = int(request.args.get("limit", "500"))
        except ValueError:
            limit = 500
        limit = max(1, min(limit, 5000))

        if not audit_path.exists():
            return jsonify({"ok": True, "entries": []})

        lines = audit_path.read_text(encoding="utf-8").splitlines()
        tail = lines[-limit:] if len(lines) > limit else lines
        entries: list[dict[str, str]] = []
        for raw in tail:
            s = raw.strip()
            if not s:
                continue
            try:
                plain = vault.decrypt_data(s)
            except Exception:
                entries.append({"plain": "", "error": "decrypt_failed"})
                continue
            entries.append({"plain": plain, "error": ""})

        entries.reverse()
        return jsonify({"ok": True, "entries": entries})

    @app.get("/api/admin/password-reset-queue")
    def admin_password_reset_queue():
        is_admin, _role = _require_admin()
        if not is_admin:
            return jsonify({"ok": False, "error": "Supervisors only"}), 403
        return jsonify({"ok": True, "items": _list_password_resets()})

    @app.delete("/api/admin/password-reset-queue/<rid>")
    def admin_password_reset_dismiss(rid: str):
        is_admin, _role = _require_admin()
        if not is_admin:
            return jsonify({"ok": False, "error": "Supervisors only"}), 403
        if _remove_password_reset_by_id(rid):
            return jsonify({"ok": True})
        return jsonify({"ok": False, "error": "Not found"}), 404

    # --- Step 4: ML anomaly scoring ---
    @app.post("/api/ml/anomaly")
    def ml_anomaly():
        data = request.get_json(silent=True) or {}
        try:
            dwell = float(data.get("dwell"))
            velocity = float(data.get("velocity"))
        except Exception:
            return jsonify({"ok": False, "error": "dwell/velocity must be numbers"}), 400

        score = ml.predict_anomaly(dwell, velocity)
        return jsonify({"ok": True, "anomaly_score": score})

    return app


def run_https(port: int = 8443):
    # imported here so backend can be imported without crypto work
    from tls_utils import ensure_self_signed_cert

    app = create_app()
    cert_path, key_path = ensure_self_signed_cert()

    # Werkzeug dev server; good enough for demos
    app.run(host="server.zaid", port=port, ssl_context=(cert_path, key_path), threaded=True)


# Name used in some examples/snippets
def run_server():
    return run_https(port=8443)

import datetime
import os

import jwt
import ldap3
import ssl
from ldap3 import SUBTREE
from ldap3.utils.conv import escape_filter_chars


class ADProvider:
    def __init__(
        self,
        server_ip: str = "192.168.56.10",
        domain: str = "SERVER",
        upn_suffix: str | None = None,
        secret: str = "SHIELD_LOCAL_2026",
        port: int = 389,
        use_ssl: bool = False,
        insecure_skip_verify: bool = True,
    ):
        self.server_ip = server_ip
        self.domain = domain
        self.upn_suffix = upn_suffix or f"{domain}.local"
        self.secret = secret
        self.port = port
        self.use_ssl = use_ssl
        self.insecure_skip_verify = insecure_skip_verify
        self.last_error: str | None = None
        self.last_tried_user: str | None = None
        self.ca_cert_file = os.environ.get("AD_CA_CERT_FILE") or None
        # Admin role mapping can vary per domain/lab; allow override without code edits.
        self.admin_group_tokens = [
            t.strip()
            for t in os.environ.get("SHIELD_ADMIN_GROUP_TOKENS", "SHIELD_ADMINS").split(",")
            if t.strip()
        ]
        self.admin_user_tokens = [
            t.strip().lower()
            for t in os.environ.get("SHIELD_ADMIN_USER_TOKENS", "administrator").split(",")
            if t.strip()
        ]

    def _base_dn(self) -> str:
        # Derive base DN from the UPN suffix (e.g. SERVER.local -> dc=SERVER,dc=local)
        parts = [p for p in (self.upn_suffix or "").split(".") if p]
        if not parts:
            # fallback to the common lab default
            return f"dc={self.domain},dc=local"
        return ",".join([f"dc={p}" for p in parts])

    def _sam_from_username(self, username: str) -> str:
        """
        Convert login input to sAMAccountName.
        Accepts:
        - DOMAIN\\user  -> user
        - user@UPN      -> user
        - user          -> user
        """
        u = (username or "").strip()
        if "\\" in u:
            u = u.split("\\")[-1]
        if "@" in u:
            u = u.split("@")[0]
        return u.strip()

    def _candidate_identities(self, username: str) -> list[str]:
        u = (username or "").strip()
        if not u:
            return []

        # If caller already provided a specific format, try it first.
        if "\\" in u or "@" in u:
            return [u]

        candidates = [
            u,
            f"{self.domain}\\{u}",
            f"{u}@{self.upn_suffix}",
        ]

        # de-dup while preserving order
        seen: set[str] = set()
        out: list[str] = []
        for c in candidates:
            if c not in seen:
                seen.add(c)
                out.append(c)
        return out

    def verify_credentials(self, username: str, password: str) -> tuple[bool, str | None]:
        self.last_error = None
        self.last_tried_user = None

        tls = None
        if self.use_ssl and self.insecure_skip_verify:
            # For lab/demo environments. For production, validate the DC cert.
            tls = ldap3.Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLS_CLIENT)

        server = ldap3.Server(
            self.server_ip,
            port=self.port,
            use_ssl=self.use_ssl,
            tls=tls,
            get_info=ldap3.ALL,
        )

        last_exc: Exception | None = None
        for identity in self._candidate_identities(username):
            self.last_tried_user = identity
            try:
                conn = ldap3.Connection(
                    server, user=identity, password=password, auto_bind=True
                )
                if conn.bind():
                    # Once bind succeeds, derive role.
                    try:
                        base_dn = self._base_dn()
                        sam = self._sam_from_username(username)
                        u_lower = sam.lower()

                        # If the username itself is explicitly configured as admin,
                        # treat it as admin even if AD search/group lookup fails.
                        if any(tok == u_lower for tok in self.admin_user_tokens):
                            return True, "admin"

                        conn.search(
                            base_dn,
                            f"(&(objectClass=user)(sAMAccountName={sam}))",
                            attributes=["memberOf"],
                        )
                        if not conn.entries:
                            return True, "user"
                        groups = str(conn.entries[0].memberOf or "")
                        is_admin = any(tok in groups for tok in self.admin_group_tokens) or any(
                            tok == u_lower for tok in self.admin_user_tokens
                        )
                        return True, ("admin" if is_admin else "user")
                    except Exception:
                        # If group lookup fails, still allow login as a normal user.
                        return True, ("admin" if self._sam_from_username(username).lower() in self.admin_user_tokens else "user")
            except ldap3.core.exceptions.LDAPInvalidCredentialsResult as e:
                last_exc = e
                continue
            except ldap3.core.exceptions.LDAPSocketOpenError as e:
                self.last_error = f"LDAPSocketOpenError: {e}"
                return False, None
            except Exception as e:
                last_exc = e
                continue

        if isinstance(last_exc, ldap3.core.exceptions.LDAPInvalidCredentialsResult):
            self.last_error = "LDAPInvalidCredentialsResult"
        elif last_exc is not None:
            self.last_error = f"LDAPException: {type(last_exc).__name__}"
        else:
            self.last_error = "LDAPException"

        return False, None

    def generate_jwt(self, username: str, role: str = "user") -> str:
        payload = {
            "user": username,
            "role": role,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8),
        }
        token = jwt.encode(payload, self.secret, algorithm="HS256")
        return token if isinstance(token, str) else token.decode("utf-8")

    def decode_jwt(self, token: str) -> dict | None:
        try:
            return jwt.decode(token, self.secret, algorithms=["HS256"])
        except Exception:
            return None

    def _password_reset_jwt_secret(self) -> str:
        # Separate from session JWT so login tokens cannot be reused as reset tokens.
        return os.environ.get("SHIELD_RESET_JWT_SECRET", f"{self.secret}_PWD_RESET_LAB")

    def issue_password_reset_token(self, sam_account_name: str) -> str:
        sam = self._sam_from_username(sam_account_name)
        payload = {
            "pwd_reset": True,
            "sam": sam,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=30),
        }
        raw = jwt.encode(payload, self._password_reset_jwt_secret(), algorithm="HS256")
        return raw if isinstance(raw, str) else raw.decode("utf-8")

    def decode_password_reset_token(self, token: str) -> str | None:
        """Returns sAMAccountName if token is a valid password-reset JWT."""
        try:
            p = jwt.decode(token, self._password_reset_jwt_secret(), algorithms=["HS256"])
        except Exception:
            return None
        if not p.get("pwd_reset"):
            return None
        sam = p.get("sam")
        if not isinstance(sam, str) or not sam.strip():
            return None
        return self._sam_from_username(sam)

    def _server(self) -> ldap3.Server:
        tls = None
        # For production, validate the DC cert. For labs, you can:
        # - set insecure_skip_verify=True to ignore validation, OR
        # - set AD_CA_CERT_FILE to validate using your internal CA.
        if self.ca_cert_file:
            tls = ldap3.Tls(
                validate=ssl.CERT_REQUIRED,
                version=ssl.PROTOCOL_TLS,
                ca_certs_file=self.ca_cert_file,
            )
        elif self.insecure_skip_verify:
            tls = ldap3.Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLS)
        return ldap3.Server(
            self.server_ip,
            port=self.port,
            use_ssl=self.use_ssl,
            tls=tls,
            get_info=ldap3.ALL,
        )

    def find_security_group_dn(
        self,
        bind_user: str,
        bind_password: str,
        token: str,
    ) -> str | None:
        """
        Locate a security group DN by CN or sAMAccountName (case-sensitive match in filter).
        Used to add new accounts to the SHIELD supervisor group so JWT role becomes admin.
        """
        tok = (token or "").strip()
        if not tok:
            return None

        server = self._server()
        try:
            conn = ldap3.Connection(server, user=bind_user, password=bind_password, auto_bind=True)
        except Exception:
            return None

        if not self.use_ssl:
            try:
                if not conn.start_tls():
                    return None
            except Exception:
                return None

        esc = escape_filter_chars(tok)
        flt = f"(&(objectCategory=group)(|(cn={esc})(sAMAccountName={esc})))"
        conn.search(self._base_dn(), flt, search_scope=SUBTREE, attributes=[], size_limit=1)
        if not conn.entries:
            return None
        return str(conn.entries[0].entry_dn)

    def create_user(
        self,
        bind_user: str,
        bind_password: str,
        *,
        ou_dn: str,
        username: str,
        password: str,
        given_name: str | None = None,
        surname: str | None = None,
        display_name: str | None = None,
        mail: str | None = None,
        add_to_group_dns: list[str] | None = None,
        must_change_password: bool = False,
    ) -> tuple[bool, str]:
        """
        Create an AD user in the given OU.

        Notes:
        - Requires a privileged bind account with rights in the OU.
        - For production, prefer LDAPS and do not skip cert validation.
        """
        u = (username or "").strip()
        pw = password or ""
        if not u or not pw:
            return False, "Missing username/password"
        if not ou_dn:
            return False, "Missing OU DN"

        server = self._server()
        try:
            conn = ldap3.Connection(server, user=bind_user, password=bind_password, auto_bind=True)
        except Exception as e:
            return False, f"Bind failed: {type(e).__name__} ({e})"

        # AD often requires a secure channel for password set (LDAPS or StartTLS).
        if not self.use_ssl:
            try:
                if not conn.start_tls():
                    return (
                        False,
                        "StartTLS failed. Configure LDAPS (AD_USE_SSL=true, AD_PORT=636) or enable StartTLS on the DC.",
                    )
            except Exception:
                return (
                    False,
                    "StartTLS failed. Configure LDAPS (AD_USE_SSL=true, AD_PORT=636) or enable StartTLS on the DC.",
                )

        # Minimal attributes. sAMAccountName required; userAccountControl enables the account.
        cn = display_name or u
        user_dn = f"CN={cn},{ou_dn}"

        attrs: dict = {
            "objectClass": ["top", "person", "organizationalPerson", "user"],
            "sAMAccountName": u,
            "userPrincipalName": f"{u}@{self.upn_suffix}",
        }
        if given_name:
            attrs["givenName"] = given_name
        if surname:
            attrs["sn"] = surname
        if display_name:
            attrs["displayName"] = display_name
        if mail:
            attrs["mail"] = mail

        # Create disabled first; enable after password set.
        # 514 = NORMAL_ACCOUNT + ACCOUNTDISABLE
        attrs["userAccountControl"] = 514

        if not conn.add(user_dn, attributes=attrs):
            desc = conn.result.get("description")
            msg = conn.result.get("message")
            return False, f"Add failed: {desc or 'unknown'}{f' ({msg})' if msg else ''}"

        # Set password (requires special UTF-16LE quoted format)
        try:
            quoted = f'"{pw}"'.encode("utf-16-le")
            conn.modify(user_dn, {"unicodePwd": [(ldap3.MODIFY_REPLACE, [quoted])]})
            if conn.result.get("result") not in (0,):
                desc = conn.result.get("description")
                msg = conn.result.get("message")
                return False, f"Password set failed: {desc or 'unknown'}{f' ({msg})' if msg else ''}"
        except Exception as e:
            return False, f"Password set failed: {type(e).__name__}"

        # Enable the account after password is set.
        conn.modify(user_dn, {"userAccountControl": [(ldap3.MODIFY_REPLACE, ["512"])]})

        if must_change_password:
            # pwdLastSet = 0 forces change at next logon
            conn.modify(user_dn, {"pwdLastSet": [(ldap3.MODIFY_REPLACE, ["0"])]})

        if add_to_group_dns:
            for gdn in add_to_group_dns:
                g = (gdn or "").strip()
                if not g:
                    continue
                if not conn.modify(g, {"member": [(ldap3.MODIFY_ADD, [user_dn])]}):
                    # User exists; group add can fail (permissions / group missing). Caller may warn.
                    pass

        return True, user_dn

    def service_account_find_user(
        self,
        bind_user: str,
        bind_password: str,
        username_input: str,
    ) -> tuple[str | None, str | None, str | None]:
        """
        Privileged LDAP search for one user by sAMAccountName (after normalization).
        Returns (user_dn, mail, error_message). error_message is set only on hard failures.
        If user is not found, returns (None, None, None).
        """
        sam = self._sam_from_username(username_input)
        if not sam:
            return None, None, "Empty username"

        server = self._server()
        try:
            conn = ldap3.Connection(server, user=bind_user, password=bind_password, auto_bind=True)
        except Exception as e:
            return None, None, f"Bind failed: {type(e).__name__} ({e})"

        if not self.use_ssl:
            try:
                if not conn.start_tls():
                    return None, None, "StartTLS failed. Use LDAPS (AD_USE_SSL=true, AD_PORT=636)."
            except Exception:
                return None, None, "StartTLS failed. Use LDAPS (AD_USE_SSL=true, AD_PORT=636)."

        flt = f"(&(objectClass=user)(sAMAccountName={escape_filter_chars(sam)}))"
        base = self._base_dn()
        conn.search(base, flt, search_scope=SUBTREE, attributes=["mail"])
        if not conn.entries:
            return None, None, None

        ent = conn.entries[0]
        dn = str(ent.entry_dn)
        mail_val: str | None = None
        try:
            if getattr(ent, "mail", None) is not None and ent.mail.value:
                mail_val = str(ent.mail.value)
        except Exception:
            mail_val = None
        return dn, mail_val, None

    def reset_user_password_for_sam(
        self,
        bind_user: str,
        bind_password: str,
        *,
        sam_account_name: str,
        new_password: str,
    ) -> tuple[bool, str]:
        """
        Set AD password over a secure LDAP channel (LDAPS or StartTLS), same rules as create_user.
        """
        if len((new_password or "").encode("utf-8")) < 8:
            return False, "Password must be at least 8 characters."

        sam = self._sam_from_username(sam_account_name)
        if not sam:
            return False, "Invalid account."

        server = self._server()
        try:
            conn = ldap3.Connection(server, user=bind_user, password=bind_password, auto_bind=True)
        except Exception as e:
            return False, f"Bind failed: {type(e).__name__} ({e})"

        if not self.use_ssl:
            try:
                if not conn.start_tls():
                    return (
                        False,
                        "StartTLS failed. Configure LDAPS (AD_USE_SSL=true, AD_PORT=636) or enable StartTLS on the DC.",
                    )
            except Exception:
                return (
                    False,
                    "StartTLS failed. Configure LDAPS (AD_USE_SSL=true, AD_PORT=636) or enable StartTLS on the DC.",
                )

        flt = f"(&(objectClass=user)(sAMAccountName={escape_filter_chars(sam)}))"
        conn.search(self._base_dn(), flt, search_scope=SUBTREE, attributes=["distinguishedName"])
        if not conn.entries:
            return False, "Account could not be located."

        user_dn = str(conn.entries[0].entry_dn)
        try:
            quoted = f'"{new_password}"'.encode("utf-16-le")
            conn.modify(user_dn, {"unicodePwd": [(ldap3.MODIFY_REPLACE, [quoted])]})
            if conn.result.get("result") not in (0,):
                desc = conn.result.get("description")
                msg = conn.result.get("message")
                return False, f"Password set failed: {desc or 'unknown'}{f' ({msg})' if msg else ''}"
        except Exception as e:
            return False, f"Password set failed: {type(e).__name__}"

        return True, user_dn

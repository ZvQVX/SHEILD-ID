# SHIELD-ID

Continuous behavioral biometrics and identity monitoring for enterprise-style environments. Combines **Active Directory** authentication, **keystroke/mouse telemetry**, **Random Forest anomaly scoring**, and **Fernet-encrypted audit logging**.

## Features

- **Identity:** LDAP/LDAPS bind to Active Directory, JWT sessions, admin vs operator RBAC
- **Biometrics:** Real-time dwell time and mouse velocity (browser + optional desktop monitor via `pynput`)
- **ML:** scikit-learn Random Forest anomaly score (0–100) via `/api/ml/anomaly`
- **Audit vault:** Append-only `security_audit.enc` (Fernet); decrypt with `decrypt_audit.py`
- **Supervisor UI:** React dashboard — live metrics, employee provisioning, operator audit, CSV export
- **Transport:** HTTPS backend (port 8443) for UI and API

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Backend | Python, Flask, ldap3, PyJWT, cryptography, scikit-learn, pynput, pywebview |
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |

## Quick start

### 1. Python backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Frontend build

```powershell
cd she
npm install
npm run build
cd ..
```

### 3. Local configuration

```powershell
Copy-Item run-local.example.ps1 run-local.ps1
# Edit run-local.ps1 with your AD lab settings (never commit this file)
.\run-local.ps1
```

Open `https://server.zaid:8443` (or your configured host). Add hosts entry if using a lab hostname.

### Desktop biometric monitor

`main.py` starts the HTTPS server and optionally a pywebview shell with keyboard/mouse listeners.

## Active Directory notes

- Create a security group named **`SHIELD_ADMINS`** (or set `SHIELD_ADMIN_GROUP_TOKENS`) so members receive the **admin** JWT role.
- Bind account needs rights to create users in `AD_USERS_OU_DN` and add members to the supervisor group.

## Security

Do **not** commit `shield.key`, `security_audit.enc`, or `run-local.ps1`. They are listed in `.gitignore`.

## Project structure

```
├── backend.py          # Flask API, AD auth, audit, ML endpoint
├── auth_provider.py    # LDAP/LDAPS + JWT
├── ml_engine.py        # Random Forest anomaly scoring
├── security_vault.py   # Fernet encrypt/decrypt
├── main.py             # pywebview + pynput desktop path
├── decrypt_audit.py    # Supervisor audit decryption
└── she/                # React UI (build → she/dist)
```

## License

Academic / portfolio use — add a license if you publish publicly.

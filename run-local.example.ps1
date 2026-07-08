$ErrorActionPreference = "Stop"

# Copy this file to run-local.ps1 and fill in your lab values (run-local.ps1 is gitignored).
# Then run:  .\run-local.ps1

$env:AD_SERVER_IP       = "192.168.56.10"
$env:AD_DOMAIN_NETBIOS  = "SERVER"
$env:AD_UPN_SUFFIX      = "SERVER.ZAID"
$env:AD_PORT            = "636"
$env:AD_USE_SSL         = "true"

$env:AD_USERS_OU_DN     = "OU=YourUnit,DC=SERVER,DC=ZAID"

$env:AD_BIND_USER       = "SERVER\Administrator"
$env:AD_BIND_PASSWORD   = "YOUR_BIND_PASSWORD_HERE"

$env:AD_ALLOW_SELF_SIGNUP = "true"
$env:SHIELD_LAB_PASSWORD_RESET = "true"
$env:SHIELD_PUBLIC_ORIGIN    = "https://server.zaid:8443"

# Optional: LDAP DN of SHIELD supervisor group (comma-separated)
# $env:SHIELD_SIGNUP_ADMIN_GROUP_DNS = "CN=SHIELD_ADMINS,OU=YourUnit,DC=SERVER,DC=ZAID"

python .\main.py

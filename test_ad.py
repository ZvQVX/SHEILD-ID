import getpass

import ldap3


def main():
    server_ip = input("AD server IP (default 192.168.56.10): ").strip() or "192.168.56.10"
    domain = input("Domain (NetBIOS, default SERVER): ").strip() or "SERVER"
    upn_suffix = input("UPN suffix (default SERVER.local): ").strip() or f"{domain}.local"
    username = input("Username (e.g. Administrator): ").strip()
    password = getpass.getpass("Password: ")

    server = ldap3.Server(server_ip, port=389, use_ssl=False, get_info=ldap3.ALL)

    # Try a few common identity formats
    identities = []
    if "\\" in username or "@" in username:
        identities = [username]
    else:
        identities = [username, f"{domain}\\{username}", f"{username}@{upn_suffix}"]

    for ident in identities:
        print(f"\nTrying bind as: {ident}")
        conn = ldap3.Connection(server, user=ident, password=password)
        if conn.bind():
            print("✅ SUCCESS: Active Directory bind succeeded.")
            return
        print("❌ FAILED")
        print(f"Result: {conn.result}")

    raise SystemExit("All identity formats failed. See results above.")


if __name__ == "__main__":
    main()


from cryptography.fernet import Fernet
import os

# The key and the encrypted file MUST be in the same folder as this script
KEY_FILE = "shield.key"
LOG_FILE = "security_audit.enc"


def decrypt():
    if not os.path.exists(KEY_FILE) or not os.path.exists(LOG_FILE):
        print(f"Error: Missing {KEY_FILE} or {LOG_FILE} in this folder!")
        return

    with open(KEY_FILE, "rb") as f:
        cipher = Fernet(f.read())

    print(f"{'--- DECRYPTED SHIELD-ID AUDIT LOG ---':^60}\n")
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            try:
                # Decrypts the line and prints it
                print(cipher.decrypt(line.encode()).decode())
            except Exception:
                print("[!] Could not decrypt line (possible key mismatch)")


if __name__ == "__main__":
    decrypt()


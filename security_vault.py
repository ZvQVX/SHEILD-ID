from __future__ import annotations

import os
from typing import Union

from argon2 import PasswordHasher
from cryptography.fernet import Fernet


class SecurityVault:
    def __init__(self, key_path: str = "shield.key"):
        self.ph = PasswordHasher()
        self.key_path = key_path

        if not os.path.exists(self.key_path):
            key = Fernet.generate_key()
            with open(self.key_path, "wb") as f:
                f.write(key)
        else:
            with open(self.key_path, "rb") as f:
                key = f.read()

        self.cipher = Fernet(key)

    def hash_password(self, password: str) -> str:
        return self.ph.hash(password)

    def verify_password(self, password_hash: str, password: str) -> bool:
        try:
            return self.ph.verify(password_hash, password)
        except Exception:
            return False

    def encrypt_data(self, plain_text: str) -> str:
        token = self.cipher.encrypt(plain_text.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt_data(self, token: Union[str, bytes]) -> str:
        if isinstance(token, str):
            token_bytes = token.encode("utf-8")
        else:
            token_bytes = token
        return self.cipher.decrypt(token_bytes).decode("utf-8")

from __future__ import annotations

import os
from dataclasses import dataclass

ROLES = ("root", "link")
PASSWORD_ENV = {"root": "ROOT_ADMIN_PASSWORD", "link": "LINK_ADMIN_PASSWORD"}


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_path: str
    root_password: str
    link_password: str
    public_url: str
    cookie_secure: bool
    session_hours: int
    enable_docs: bool

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            database_path=os.environ.get("DATABASE_PATH", "/data/wedding.db"),
            root_password=os.environ.get(PASSWORD_ENV["root"], ""),
            link_password=os.environ.get(PASSWORD_ENV["link"], ""),
            public_url=os.environ.get("PUBLIC_URL", "").strip().rstrip("/"),
            cookie_secure=_flag("COOKIE_SECURE", True),
            session_hours=int(os.environ.get("SESSION_HOURS", "") or 72),
            enable_docs=_flag("ENABLE_DOCS", False),
        )

    def password_for(self, role: str) -> str:
        return self.root_password if role == "root" else self.link_password

"""Admin passwords and sessions."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import ROLES, Settings
from .db import get_db
from .models import AdminCredential, AdminSession, utcnow
from .security import hash_password, token_digest, verify_password

COOKIE_NAME = "wedding_admin"


def set_password(db: Session, role: str, password: str) -> None:
    """Stores a new password for a role and signs out everyone using the old one."""
    cred = db.get(AdminCredential, role)
    if cred is None:
        db.add(AdminCredential(role=role, password_hash=hash_password(password)))
    else:
        cred.password_hash = hash_password(password)
    db.execute(delete(AdminSession).where(AdminSession.role == role))


def sync_passwords_from_env(db: Session, settings: Settings) -> None:
    """Passwords set in .env win; a blank one leaves whatever is already stored."""
    if settings.root_password and settings.root_password == settings.link_password:
        raise RuntimeError("ROOT_ADMIN_PASSWORD and LINK_ADMIN_PASSWORD must be different.")
    for role in ROLES:
        password = settings.password_for(role)
        if not password:
            continue
        cred = db.get(AdminCredential, role)
        if cred is None or not verify_password(password, cred.password_hash):
            set_password(db, role, password)
    db.commit()


def match_role(db: Session, password: str) -> str | None:
    """The password alone decides the role. Both are always checked, so timing gives nothing away."""
    stored = {c.role: c.password_hash for c in db.scalars(select(AdminCredential))}
    matches = [role for role in ROLES if role in stored and verify_password(password, stored[role])]
    return matches[0] if matches else None


def current_role(request: Request, db: Session = Depends(get_db)) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        session = db.get(AdminSession, token_digest(token))
        if session is not None and session.expires_at > utcnow():
            return session.role
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in")


def require_root(role: str = Depends(current_role)) -> str:
    if role != "root":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the root admin can do that")
    return role

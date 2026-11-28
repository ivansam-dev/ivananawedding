"""Signing in and out of admin mode."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..auth import COOKIE_NAME, current_role, match_role
from ..db import get_db
from ..models import AdminSession, utcnow
from ..schemas import LoginIn, MeOut
from ..security import client_ip, new_token, token_digest

router = APIRouter()


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> MeOut:
    settings = request.app.state.settings
    limiter = request.app.state.limiter
    ip = client_ip(request)
    if not limiter.begin(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again later.")

    role = None
    try:
        role = match_role(db, body.password)
    finally:
        limiter.end(ip, failed=role is None, forget=role == "root")
    if role is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")

    now = utcnow()
    token = new_token()
    db.execute(delete(AdminSession).where(AdminSession.expires_at <= now))
    db.add(
        AdminSession(
            token_hash=token_digest(token),
            role=role,
            expires_at=now + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_hours * 3600,
        path="/api",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )
    return MeOut(role=role, base_url=settings.public_url)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.execute(delete(AdminSession).where(AdminSession.token_hash == token_digest(token)))
        db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE_NAME, path="/api")
    return response


@router.get("/me", response_model=MeOut)
def me(request: Request, role: str = Depends(current_role)) -> MeOut:
    return MeOut(role=role, base_url=request.app.state.settings.public_url)

"""FastAPI app. Run with: uvicorn app.main:create_app --factory"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.orm import sessionmaker

from .auth import sync_passwords_from_env
from .config import PASSWORD_ENV, ROLES, Settings
from .db import make_engine, upgrade
from .models import AdminCredential
from .routes import admin, public, session
from .security import LoginLimiter

log = logging.getLogger("uvicorn.error")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_path)
    Session = sessionmaker(engine)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        upgrade(engine)
        with Session() as db:
            sync_passwords_from_env(db, settings)
            missing = [role for role in ROLES if db.get(AdminCredential, role) is None]
        for role in missing:
            log.warning(
                "No %s admin password is set: add %s to .env, or run `make set-password ROLE=%s`.",
                role, PASSWORD_ENV[role], role,
            )
        yield
        engine.dispose()

    docs = settings.enable_docs
    app = FastAPI(
        title="Wedding guest list",
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        openapi_url="/api/openapi.json" if docs else None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.sessionmaker = Session
    app.state.limiter = LoginLimiter()

    @app.exception_handler(RequestValidationError)
    async def _invalid(_request: Request, exc: RequestValidationError) -> JSONResponse:
        """FastAPI's own handler echoes each bad input back, and one that can't be written as UTF-8 (a lone
        surrogate, from a raw \\ud800 in the JSON) would turn the 422 into a 500. The message says enough."""
        errors = [{k: v for k, v in error.items() if k != "input"} for error in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})

    app.include_router(public.router, prefix="/api")
    app.include_router(session.router, prefix="/api/auth")
    app.include_router(admin.router, prefix="/api/admin")
    return app

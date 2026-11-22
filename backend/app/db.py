from __future__ import annotations

import os
from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.orm import Session


def make_engine(path: str) -> Engine:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

    return engine


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.sessionmaker() as db:
        yield db


# Columns added after the first release. create_all() makes new tables but never changes old ones,
# so these are added in place; each is (table, column, SQL type and default).
ADDED_COLUMNS = [
    ("guests", "category", "VARCHAR(60) NOT NULL DEFAULT ''"),
    ("guests", "location", "VARCHAR(60) NOT NULL DEFAULT ''"),
]


def upgrade(engine: Engine) -> None:
    """Creates missing tables and adds any missing columns. Safe to run on every start."""
    from .models import Base

    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        insp = inspect(conn)
        for table, column, ddl in ADDED_COLUMNS:
            if column not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))

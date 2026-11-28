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


# create_all() makes new tables but never changes old ones, so columns renamed or added after the
# first release are changed in place.

# (table, old name, new name)
RENAMED_COLUMNS = [
    ("guests", "rsvp", "reception_rsvp"),  # when the tea ceremony got an answer of its own
]

# (table, column, SQL type and default)
ADDED_COLUMNS = [
    ("guests", "category", "VARCHAR(60) NOT NULL DEFAULT ''"),
    ("guests", "location", "VARCHAR(60) NOT NULL DEFAULT ''"),
    ("guests", "dietary", "VARCHAR(300) NOT NULL DEFAULT ''"),
    ("letters", "opens_first", "BOOLEAN NOT NULL DEFAULT 0"),
    ("guests", "tea_rsvp", "VARCHAR(16) NOT NULL DEFAULT 'no_response'"),
]

# Added columns that start as a copy of another. Before the tea ceremony had an answer of its own, a
# guest's one answer was to an invitation listing both events, so it holds for both.
COPIED_COLUMNS = {
    ("guests", "tea_rsvp"): "reception_rsvp",
}


def upgrade(engine: Engine) -> None:
    """Creates missing tables, renames and adds any missing columns, gives each of the card's letters a
    row and makes sure one version of the card's layout, and one of the envelope's look, is live. Safe to run on every start."""
    from .layouts import seed_versions
    from .letter_style import seed_style_versions
    from .letters import seed_letters
    from .models import Base

    Base.metadata.create_all(engine)
    with engine.begin() as conn:

        def columns(table: str) -> set[str]:
            return {c["name"] for c in inspect(conn).get_columns(table)}  # a fresh look: inspectors cache

        for table, old, new in RENAMED_COLUMNS:
            have = columns(table)
            if old in have and new not in have:
                conn.execute(text(f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}"))
        for table, column, ddl in ADDED_COLUMNS:
            if column not in columns(table):
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                source = COPIED_COLUMNS.get((table, column))
                if source:
                    conn.execute(text(f"UPDATE {table} SET {column} = {source} WHERE {source} IS NOT NULL"))
    with Session(engine) as db:
        seed_letters(db)
        seed_versions(db)
        seed_style_versions(db)
        db.commit()

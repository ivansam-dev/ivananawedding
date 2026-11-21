"""Chores run inside the api container (the Makefile wraps these):

    python -m app.cli set-password root|link
    python -m app.cli backup /data/export.db
    python -m app.cli restore /data/restore.db
"""

from __future__ import annotations

import argparse
import getpass
import sqlite3
import sys

from sqlalchemy.orm import Session

from .auth import set_password, sync_passwords_from_env
from .config import PASSWORD_ENV, ROLES, Settings
from .db import make_engine
from .models import AdminCredential, Base
from .security import verify_password


def _die(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(1)


def cmd_set_password(settings: Settings, role: str) -> None:
    if sys.stdin.isatty():
        password = getpass.getpass(f"New {role} password: ")
        if getpass.getpass("Type it again: ") != password:
            _die("Those didn't match; nothing changed.")
    else:
        password = sys.stdin.readline().rstrip("\n")
    if not password:
        _die("The password can't be blank.")

    engine = make_engine(settings.database_path)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        other = "link" if role == "root" else "root"
        other_cred = db.get(AdminCredential, other)
        if other_cred and verify_password(password, other_cred.password_hash):
            _die(f"That's the {other} password; the two must be different.")
        set_password(db, role, password)
        db.commit()
    engine.dispose()

    print(f"The {role} password is changed, and anyone signed in as {role} has been signed out.")
    if settings.password_for(role):
        print(
            f"Note: {PASSWORD_ENV[role]} is also set in .env and will replace this password the next "
            "time the site restarts. Clear it there to keep this one."
        )


def cmd_backup(settings: Settings, dest: str) -> None:
    """A consistent copy, even while the site is running, as a single self-contained file."""
    src = sqlite3.connect(settings.database_path)
    out = sqlite3.connect(dest)
    try:
        src.backup(out)
        out.execute("PRAGMA journal_mode=DELETE")
    finally:
        out.close()
        src.close()


def cmd_restore(settings: Settings, source: str) -> None:
    try:
        src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
        tables = {row[0] for row in src.execute("select name from sqlite_master where type='table'")}
    except sqlite3.DatabaseError as exc:
        _die(f"{source} isn't a SQLite database ({exc}).")
    if not {"groups", "guests"} <= tables:
        _die(f"{source} doesn't look like an export of this site's database.")
    live = sqlite3.connect(settings.database_path)
    try:
        src.backup(live)
    finally:
        live.close()
        src.close()

    # The copy brings its own admin passwords; the ones in .env still win, as they do at startup.
    engine = make_engine(settings.database_path)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        sync_passwords_from_env(db, settings)
    engine.dispose()
    print("Database restored.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("set-password", help="change an admin password")
    p.add_argument("role", choices=ROLES)
    p = sub.add_parser("backup", help="copy the database to a file")
    p.add_argument("dest")
    p = sub.add_parser("restore", help="replace the database with a backup")
    p.add_argument("source")
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    if args.command == "set-password":
        cmd_set_password(settings, args.role)
    elif args.command == "backup":
        cmd_backup(settings, args.dest)
    elif args.command == "restore":
        cmd_restore(settings, args.source)


if __name__ == "__main__":
    main()

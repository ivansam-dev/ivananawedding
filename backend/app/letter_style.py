"""Versions of the envelope's look (colour, pattern, crease trim and seal). Root admins keep as many versions
as they like in the Letter style view and pick one to be live; every guest's card is drawn with the live one.
Where the card's text sits is in layouts.py."""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Setting, StyleVersion
from .schemas import LetterStyle, StyleVersionOut

MAX_VERSIONS = 50
# Before there were versions, the one style was kept in settings under this name
OLD_KEY = "letter_style"


def read(version: StyleVersion) -> LetterStyle:
    """The version's style, or the original if what's stored is no longer one the card can draw."""
    try:
        return LetterStyle.model_validate_json(version.style)
    except ValidationError:
        return LetterStyle()


def out(version: StyleVersion) -> StyleVersionOut:
    return StyleVersionOut(id=version.id, name=version.name, live=version.live, style=read(version),
                           created_at=version.created_at, updated_at=version.updated_at)


def all_versions(db: Session) -> list[StyleVersion]:
    """Every version, oldest first."""
    return list(db.scalars(select(StyleVersion).order_by(StyleVersion.id)))


def get_version(db: Session, version_id: int) -> StyleVersion:
    version = db.get(StyleVersion, version_id)
    if version is None:
        raise HTTPException(404, "Version not found")
    return version


def live_version(db: Session) -> StyleVersion | None:
    return db.scalar(select(StyleVersion).where(StyleVersion.live.is_(True)).order_by(StyleVersion.id).limit(1))


def current_style(db: Session) -> LetterStyle:
    """What guests see."""
    version = live_version(db)
    return read(version) if version else LetterStyle()


def save_style(db: Session, style: LetterStyle) -> LetterStyle:
    """Saves the style to the live version."""
    version = live_version(db)
    if version is None:
        db.add(StyleVersion(name="Original", style=style.model_dump_json(), live=True))
    else:
        version.style = style.model_dump_json()
    return style


def seed_style_versions(db: Session) -> None:
    """Makes sure there is a version and exactly one of them is live.

    On a new database that's the original style. On one from before versions, it's the style that was
    saved then, so guests see no change.
    """
    versions = all_versions(db)
    if not versions:
        old = db.get(Setting, OLD_KEY)
        style, name = LetterStyle(), "Original"
        if old is not None:
            try:
                style, name = LetterStyle.model_validate_json(old.value), "Version 1"
            except ValidationError:
                pass
            db.delete(old)
        db.add(StyleVersion(name=name, style=style.model_dump_json(), live=True))
        return
    live = [v for v in versions if v.live]
    keep = live[0] if live else versions[0]
    for version in versions:
        version.live = version is keep


def create_version(db: Session, name: str, style: LetterStyle) -> StyleVersion:
    if db.scalar(select(func.count()).select_from(StyleVersion)) >= MAX_VERSIONS:
        raise HTTPException(422, f"There can be at most {MAX_VERSIONS} versions: delete one you no longer need first")
    version = StyleVersion(name=name, style=style.model_dump_json(), live=False)
    db.add(version)
    db.flush()
    return version


def change_version(db: Session, version_id: int, *, name: str | None, style: LetterStyle | None, live: bool) -> None:
    """Renames a version, saves a new style to it, or makes it the live one (the one live before stops being)."""
    version = get_version(db, version_id)
    if name is not None:
        version.name = name
    if style is not None:
        version.style = style.model_dump_json()
    if live:
        for other in all_versions(db):
            other.live = other is version


def delete_version(db: Session, version_id: int) -> None:
    version = get_version(db, version_id)
    if version.live:
        raise HTTPException(422, "Guests see this version: make another one live before deleting it")
    db.delete(version)

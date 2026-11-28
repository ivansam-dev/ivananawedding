"""Versions of the card's layout: where the text on its cover ("Dear …") and on the save the date sits, how big
it is and what it says. Root admins keep as many versions as they like in the Card layout view and pick one
to be live; every guest's card is drawn with the live one."""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import LayoutVersion, Setting
from .schemas import CardLayout, StdLayout, VersionOut

MAX_VERSIONS = 50
# Before there were versions, the one layout (the save the date's only) was kept in settings under this name
OLD_KEY = "std_layout"


def read(version: LayoutVersion) -> CardLayout:
    """The version's layout, or the original if what's stored is no longer one the card can draw."""
    try:
        return CardLayout.model_validate_json(version.layout)
    except ValidationError:
        return CardLayout()


def out(version: LayoutVersion) -> VersionOut:
    return VersionOut(id=version.id, name=version.name, live=version.live, layout=read(version),
                      created_at=version.created_at, updated_at=version.updated_at)


def all_versions(db: Session) -> list[LayoutVersion]:
    """Every version, oldest first."""
    return list(db.scalars(select(LayoutVersion).order_by(LayoutVersion.id)))


def get_version(db: Session, version_id: int) -> LayoutVersion:
    version = db.get(LayoutVersion, version_id)
    if version is None:
        raise HTTPException(404, "Version not found")
    return version


def live_layout(db: Session) -> CardLayout:
    """What guests see."""
    version = db.scalar(select(LayoutVersion).where(LayoutVersion.live.is_(True)).order_by(LayoutVersion.id).limit(1))
    return read(version) if version else CardLayout()


def seed_versions(db: Session) -> None:
    """Makes sure there is a version and exactly one of them is live.

    On a new database that's the original layout. On one from before versions, it's the layout that was
    saved then, so guests see no change.
    """
    versions = all_versions(db)
    if not versions:
        old = db.get(Setting, OLD_KEY)
        layout, name = CardLayout(), "Original"
        if old is not None:
            try:
                layout, name = CardLayout(save_the_date=StdLayout.model_validate_json(old.value)), "Version 1"
            except ValidationError:
                pass
            db.delete(old)
        db.add(LayoutVersion(name=name, layout=layout.model_dump_json(), live=True))
        return
    live = [v for v in versions if v.live]
    keep = live[0] if live else versions[0]
    for version in versions:
        version.live = version is keep


def create_version(db: Session, name: str, layout: CardLayout) -> LayoutVersion:
    if db.scalar(select(func.count()).select_from(LayoutVersion)) >= MAX_VERSIONS:
        raise HTTPException(422, f"There can be at most {MAX_VERSIONS} versions: delete one you no longer need first")
    version = LayoutVersion(name=name, layout=layout.model_dump_json(), live=False)
    db.add(version)
    db.flush()
    return version


def change_version(db: Session, version_id: int, *, name: str | None, layout: CardLayout | None, live: bool) -> None:
    """Renames a version, saves a new layout to it, or makes it the live one (the one live before stops being)."""
    version = get_version(db, version_id)
    if name is not None:
        version.name = name
    if layout is not None:
        version.layout = layout.model_dump_json()
    if live:
        for other in all_versions(db):
            other.live = other is version


def delete_version(db: Session, version_id: int) -> None:
    version = get_version(db, version_id)
    if version.live:
        raise HTTPException(422, "Guests see this version: make another one live before deleting it")
    db.delete(version)

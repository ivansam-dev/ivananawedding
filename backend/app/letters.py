"""The card's letters (the save the date, the invitation, the RSVP card, the details): which ones guests see,
in what order, and which one their card opens on."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import LETTERS, Letter


def _by_rank(letter: Letter) -> tuple[int, int]:
    return letter.rank, LETTERS.index(letter.kind)


def all_letters(db: Session) -> list[Letter]:
    """Every letter the card has, earliest (rank 1) first."""
    letters = db.scalars(select(Letter).where(Letter.kind.in_(LETTERS))).all()
    return sorted(letters, key=_by_rank)


def shown_letters(db: Session) -> list[str]:
    """What guests see: the active letters, earliest first (left to right in the row beneath the card)."""
    return [letter.kind for letter in all_letters(db) if letter.active]


def opening_letter(db: Session) -> str:
    """The letter guests' cards open on."""
    letters = [letter for letter in all_letters(db) if letter.active]
    return next((letter.kind for letter in letters if letter.opens_first), letters[-1].kind if letters else LETTERS[0])


def _settle_opening(letters: list[Letter]) -> None:
    """Exactly one active letter opens first: the one marked, or else the newest active one."""
    active = [letter for letter in letters if letter.active]
    marked = [letter for letter in active if letter.opens_first]
    keep = marked[0] if marked else (active[-1] if active else None)
    for letter in letters:
        letter.opens_first = letter is keep


def seed_letters(db: Session) -> None:
    """Gives every letter the card has a row, with ranks running 1, 2, 3…

    On a new database only the save the date is active. A letter added to the card later starts
    switched off, ranked above the others as the newest. If no active letter opens first (as on a
    database from before that choice), the newest active one does, as it did then.
    """
    rows = {letter.kind: letter for letter in db.scalars(select(Letter).where(Letter.kind.in_(LETTERS)))}
    fresh = not rows
    for kind in LETTERS:
        if kind not in rows:
            rank = max((letter.rank for letter in rows.values()), default=0) + 1
            rows[kind] = Letter(kind=kind, active=fresh and kind == LETTERS[0], rank=rank, opens_first=False)
            db.add(rows[kind])
    ordered = sorted(rows.values(), key=_by_rank)
    for rank, letter in enumerate(ordered, start=1):
        letter.rank = rank
    _settle_opening(ordered)


def change_letter(
    db: Session, kind: str, *, active: bool | None, rank: int | None, opens_first: bool = False
) -> None:
    """Switches a letter on or off, gives it another rank (the letter that had that rank takes its old one),
    or makes it the one guests' cards open on (which switches it on)."""
    letters = all_letters(db)
    letter = next((x for x in letters if x.kind == kind), None)
    if letter is None:
        raise HTTPException(404, "Letter not found")
    if rank is not None and not 1 <= rank <= len(letters):
        raise HTTPException(422, f"Rank must be from 1 to {len(letters)}")
    if opens_first and active is False:
        raise HTTPException(422, "The letter guests' cards open on has to be active")
    if active is False and not any(x.active for x in letters if x is not letter):
        raise HTTPException(422, "At least one letter must stay active, or guests would have nothing to open")
    if active is False and letter.opens_first and not opens_first:
        raise HTTPException(422, "Guests' cards open on this letter: pick another one to open on before switching it off")

    if rank is not None and rank != letter.rank:
        for other in letters:
            if other.rank == rank:
                other.rank = letter.rank
        letter.rank = rank
    if active is not None:
        letter.active = active
    if opens_first:
        letter.active = True
        for other in letters:
            other.opens_first = other is letter

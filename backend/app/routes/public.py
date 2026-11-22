"""What guests' browsers call: nothing here needs a password."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..letters import opening_letter, shown_letters
from ..models import Group
from ..schemas import InviteGuestOut, InviteOut, LettersOut, RsvpIn, RsvpOut

router = APIRouter()

_PUBLIC_ID = re.compile(r"[a-z0-9]{4,32}")


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(text("select 1"))
    return {"ok": True}


def _group(db: Session, public_id: str) -> Group:
    public_id = public_id.lower()
    group = (
        db.scalar(select(Group).where(Group.public_id == public_id))
        if _PUBLIC_ID.fullmatch(public_id)
        else None
    )
    if group is None:
        raise HTTPException(404, "No invitation with that link")
    return group


def _guests(group: Group) -> list[InviteGuestOut]:
    return [InviteGuestOut.model_validate(guest) for guest in group.guests]


@router.get("/invite/{public_id}", response_model=InviteOut)
def invite(public_id: str, db: Session = Depends(get_db)) -> InviteOut:
    """The names for the card's "Dear …" line, in the order the admin ranked them, the same guests
    with their answers so far for the reply card, and which letters to show."""
    group = _group(db, public_id)
    return InviteOut(
        names=[guest.name for guest in group.guests], guests=_guests(group),
        letters=shown_letters(db), opens=opening_letter(db),
    )


@router.post("/invite/{public_id}/rsvp", response_model=RsvpOut)
def rsvp(public_id: str, body: RsvpIn, db: Session = Depends(get_db)) -> RsvpOut:
    """The reply card: attending the tea ceremony and the reception or not, and dietary requirements,
    for any of the link's guests. Guests and events left out keep their answer."""
    group = _group(db, public_id)
    guests = {guest.id: guest for guest in group.guests}
    if any(reply.guest_id not in guests for reply in body.replies):
        raise HTTPException(422, "Every reply must be for a guest on this invitation")
    for reply in body.replies:
        guest = guests[reply.guest_id]
        if reply.tea_rsvp:
            guest.tea_rsvp = reply.tea_rsvp
        if reply.reception_rsvp:
            guest.reception_rsvp = reply.reception_rsvp
        coming = "attending" in (guest.tea_rsvp, guest.reception_rsvp)
        guest.dietary = reply.dietary if coming else ""
    db.commit()
    db.refresh(group)
    return RsvpOut(guests=_guests(group))


@router.get("/letters", response_model=LettersOut)
def letters(db: Session = Depends(get_db)) -> LettersOut:
    """Which letters to show, for links that carry the names themselves (?to=Name)."""
    return LettersOut(letters=shown_letters(db), opens=opening_letter(db))

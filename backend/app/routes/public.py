"""What guests' browsers call: nothing here needs a password."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Group
from ..schemas import InviteOut

router = APIRouter()

_PUBLIC_ID = re.compile(r"[a-z0-9]{4,32}")


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, bool]:
    db.execute(text("select 1"))
    return {"ok": True}


@router.get("/invite/{public_id}", response_model=InviteOut)
def invite(public_id: str, db: Session = Depends(get_db)) -> InviteOut:
    """The names for the card's "Dear …" line, in the order the admin ranked them."""
    public_id = public_id.lower()
    group = (
        db.scalar(select(Group).where(Group.public_id == public_id))
        if _PUBLIC_ID.fullmatch(public_id)
        else None
    )
    if group is None:
        raise HTTPException(404, "No invitation with that link")
    return InviteOut(names=[guest.name for guest in group.guests])

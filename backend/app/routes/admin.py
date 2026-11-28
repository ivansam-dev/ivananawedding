"""The guest list. Root admins can change everything; link admins can only list groups."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..auth import current_role, require_root
from ..db import get_db
from ..guests import (
    ImportProblem,
    all_groups,
    create_group,
    get_group,
    get_guest,
    import_guests,
    next_rank,
    renumber,
)
from ..layouts import all_versions, change_version, create_version, delete_version, out
from .. import letter_style
from ..letter_style import current_style, save_style
from ..letters import all_letters, change_letter
from ..models import Group, Guest, utcnow
from ..schemas import (
    ClearIn,
    ClearOut,
    GroupCreate,
    GroupOut,
    GroupUpdate,
    GuestCreate,
    GuestUpdate,
    ImportIn,
    ImportOut,
    LetterKind,
    LetterOut,
    LetterStyle,
    LetterUpdate,
    LinkGroupOut,
    OrderIn,
    SentIn,
    StyleVersionCreate,
    StyleVersionOut,
    StyleVersionUpdate,
    VersionCreate,
    VersionOut,
    VersionUpdate,
)

router = APIRouter(dependencies=[Depends(current_role)])
root = [Depends(require_root)]


def _out(db: Session, group_id: int) -> GroupOut:
    db.expire_all()  # ranks and memberships may have changed underneath loaded objects
    return GroupOut.model_validate(get_group(db, group_id))


# ---- both admin levels ----

@router.get("/links", response_model=list[LinkGroupOut])
def list_links(db: Session = Depends(get_db)) -> list[LinkGroupOut]:
    return [
        LinkGroupOut(id=g.id, public_id=g.public_id, name=g.name, guests=[x.name for x in g.guests])
        for g in all_groups(db)
    ]


# ---- root only ----

@router.get("/groups", response_model=list[GroupOut], dependencies=root)
def list_groups(db: Session = Depends(get_db)) -> list[GroupOut]:
    return [GroupOut.model_validate(g) for g in all_groups(db)]


@router.post("/groups", response_model=GroupOut, status_code=201, dependencies=root)
def add_group(body: GroupCreate, db: Session = Depends(get_db)) -> GroupOut:
    group = create_group(db, body.name)
    for rank, name in enumerate(body.guests):
        db.add(Guest(group_id=group.id, name=name, rank=rank))
    db.commit()
    return _out(db, group.id)


@router.patch("/groups/{group_id}", response_model=GroupOut, dependencies=root)
def rename_group(group_id: int, body: GroupUpdate, db: Session = Depends(get_db)) -> GroupOut:
    get_group(db, group_id).name = body.name
    db.commit()
    return _out(db, group_id)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=root)
def delete_group(group_id: int, db: Session = Depends(get_db)) -> None:
    db.delete(get_group(db, group_id))
    db.commit()


@router.post("/groups/{group_id}/sent", response_model=GroupOut, dependencies=root)
def mark_group_sent(group_id: int, body: SentIn, db: Session = Depends(get_db)) -> GroupOut:
    """Marks the save the date or the invitation as sent (or not) for everyone in the group."""
    attr = f"{body.kind}_sent_at"
    now = utcnow()
    for guest in get_group(db, group_id).guests:
        if not body.sent:
            setattr(guest, attr, None)
        elif getattr(guest, attr) is None:
            setattr(guest, attr, now)
    db.commit()
    return _out(db, group_id)


@router.put("/groups/{group_id}/order", response_model=GroupOut, dependencies=root)
def reorder_group(group_id: int, body: OrderIn, db: Session = Depends(get_db)) -> GroupOut:
    """Sets who is greeted first: guest_ids lists everyone in the group, first to last."""
    guests = get_group(db, group_id).guests
    if sorted(body.guest_ids) != sorted(g.id for g in guests):
        raise HTTPException(422, "guest_ids must list every guest in the group exactly once")
    position = {guest_id: i for i, guest_id in enumerate(body.guest_ids)}
    for guest in guests:
        guest.rank = position[guest.id]
    db.commit()
    return _out(db, group_id)


@router.post("/groups/{group_id}/guests", response_model=GroupOut, status_code=201, dependencies=root)
def add_guest(group_id: int, body: GuestCreate, db: Session = Depends(get_db)) -> GroupOut:
    get_group(db, group_id)
    db.add(Guest(group_id=group_id, name=body.name, rank=next_rank(db, group_id)))
    db.commit()
    return _out(db, group_id)


@router.patch("/guests/{guest_id}", response_model=GroupOut, dependencies=root)
def update_guest(guest_id: int, body: GuestUpdate, db: Session = Depends(get_db)) -> GroupOut:
    """Returns the guest's group as it is afterwards (the new one, if they moved)."""
    guest = get_guest(db, guest_id)
    if body.name is not None:
        guest.name = body.name
    if body.tea_rsvp is not None:
        guest.tea_rsvp = body.tea_rsvp
    if body.reception_rsvp is not None:
        guest.reception_rsvp = body.reception_rsvp
    if body.category is not None:
        guest.category = body.category
    if body.location is not None:
        guest.location = body.location
    if body.dietary is not None:
        guest.dietary = body.dietary
    for kind in ("save_the_date", "invitation"):
        sent = getattr(body, f"{kind}_sent")
        if sent is not None:
            attr = f"{kind}_sent_at"
            setattr(guest, attr, (getattr(guest, attr) or utcnow()) if sent else None)
    if body.group_id is not None and body.group_id != guest.group_id:
        get_group(db, body.group_id)
        old_group_id = guest.group_id
        guest.rank = next_rank(db, body.group_id)  # joins at the end of the new group
        guest.group_id = body.group_id
        db.flush()
        renumber(db, old_group_id)
    db.commit()
    return _out(db, guest.group_id)


@router.delete("/guests/{guest_id}", response_model=GroupOut, dependencies=root)
def delete_guest(guest_id: int, db: Session = Depends(get_db)) -> GroupOut:
    guest = get_guest(db, guest_id)
    group_id = guest.group_id
    db.delete(guest)
    db.flush()
    renumber(db, group_id)
    db.commit()
    return _out(db, group_id)


@router.post("/clear", response_model=ClearOut, dependencies=root)
def clear_list(_body: ClearIn, db: Session = Depends(get_db)) -> ClearOut:
    """Deletes every group and guest, ready for a fresh import. Admin passwords are kept.

    Links already sent stop working: a re-imported group gets a new link.
    """
    guests = db.execute(delete(Guest)).rowcount
    groups = db.execute(delete(Group)).rowcount
    db.commit()
    return ClearOut(groups_deleted=groups, guests_deleted=guests)


@router.get("/letters", response_model=list[LetterOut], dependencies=root)
def list_letters(db: Session = Depends(get_db)) -> list[LetterOut]:
    """Every letter the card has, earliest (rank 1) first."""
    return [LetterOut.model_validate(letter) for letter in all_letters(db)]


@router.patch("/letters/{kind}", response_model=list[LetterOut], dependencies=root)
def update_letter(kind: LetterKind, body: LetterUpdate, db: Session = Depends(get_db)) -> list[LetterOut]:
    """Switches a letter on or off, gives it another rank (the letter that had it takes this one's old rank),
    or makes it the one guests' cards open on. Returns every letter, as GET /letters does."""
    change_letter(db, kind, active=body.active, rank=body.rank, opens_first=bool(body.opens_first))
    db.commit()
    return list_letters(db)


@router.get("/style", response_model=LetterStyle, dependencies=root)
def get_style(db: Session = Depends(get_db)) -> LetterStyle:
    """The envelope's look guests see."""
    return current_style(db)


@router.put("/style", response_model=LetterStyle, dependencies=root)
def put_style(body: LetterStyle, db: Session = Depends(get_db)) -> LetterStyle:
    """Saves to the live version of the envelope's look, so every guest sees it from their next visit."""
    save_style(db, body)
    db.commit()
    return current_style(db)


@router.get("/style-versions", response_model=list[StyleVersionOut], dependencies=root)
def list_style_versions(db: Session = Depends(get_db)) -> list[StyleVersionOut]:
    """Every version of the envelope's look, oldest first; guests see the one that's live."""
    return [letter_style.out(version) for version in letter_style.all_versions(db)]


@router.post("/style-versions", response_model=StyleVersionOut, status_code=201, dependencies=root)
def add_style_version(body: StyleVersionCreate, db: Session = Depends(get_db)) -> StyleVersionOut:
    """A new version (the original look, unless one is given). Guests don't see it until it's made live."""
    version = letter_style.create_version(db, body.name, body.style)
    db.commit()
    return letter_style.out(version)


@router.patch("/style-versions/{version_id}", response_model=list[StyleVersionOut], dependencies=root)
def update_style_version(version_id: int, body: StyleVersionUpdate, db: Session = Depends(get_db)) -> list[StyleVersionOut]:
    """Renames a version, saves a look to it, or makes it live (guests see it from their next visit).
    Returns every version, as GET /style-versions does, since making one live changes another."""
    letter_style.change_version(db, version_id, name=body.name, style=body.style, live=bool(body.live))
    db.commit()
    db.expire_all()
    return list_style_versions(db)


@router.delete("/style-versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=root)
def remove_style_version(version_id: int, db: Session = Depends(get_db)) -> None:
    """Deletes a version, unless it's the live one."""
    letter_style.delete_version(db, version_id)
    db.commit()


@router.get("/versions", response_model=list[VersionOut], dependencies=root)
def list_versions(db: Session = Depends(get_db)) -> list[VersionOut]:
    """Every version of the card's layout, oldest first; guests see the one that's live."""
    return [out(version) for version in all_versions(db)]


@router.post("/versions", response_model=VersionOut, status_code=201, dependencies=root)
def add_version(body: VersionCreate, db: Session = Depends(get_db)) -> VersionOut:
    """A new version (the original layout, unless one is given). Guests don't see it until it's made live."""
    version = create_version(db, body.name, body.layout)
    db.commit()
    return out(version)


@router.patch("/versions/{version_id}", response_model=list[VersionOut], dependencies=root)
def update_version(version_id: int, body: VersionUpdate, db: Session = Depends(get_db)) -> list[VersionOut]:
    """Renames a version, saves a layout to it, or makes it live (guests see it from their next visit).
    Returns every version, as GET /versions does, since making one live changes another."""
    change_version(db, version_id, name=body.name, layout=body.layout, live=bool(body.live))
    db.commit()
    db.expire_all()
    return list_versions(db)


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=root)
def remove_version(version_id: int, db: Session = Depends(get_db)) -> None:
    """Deletes a version, unless it's the live one."""
    delete_version(db, version_id)
    db.commit()


@router.post("/import", response_model=ImportOut, dependencies=root)
def import_csv(body: ImportIn, db: Session = Depends(get_db)) -> ImportOut:
    try:
        return import_guests(db, body.csv)
    except ImportProblem as exc:
        db.rollback()
        raise HTTPException(422, str(exc)) from exc

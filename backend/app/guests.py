"""Groups, guests and the CSV guest-list import."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .models import Group, Guest
from .schemas import GROUP_NAME_MAX, GUEST_NAME_MAX, ImportOut, clean_text
from .security import new_public_id


def get_group(db: Session, group_id: int) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(404, "Group not found")
    return group


def get_guest(db: Session, guest_id: int) -> Guest:
    guest = db.get(Guest, guest_id)
    if guest is None:
        raise HTTPException(404, "Guest not found")
    return guest


def all_groups(db: Session) -> list[Group]:
    groups = db.scalars(select(Group).options(selectinload(Group.guests))).all()
    return sorted(groups, key=lambda g: (g.name.casefold(), g.id))


def create_group(db: Session, name: str) -> Group:
    for _ in range(20):
        public_id = new_public_id()
        if db.scalar(select(Group.id).where(Group.public_id == public_id)) is None:
            group = Group(public_id=public_id, name=name)
            db.add(group)
            db.flush()
            return group
    raise RuntimeError("could not find an unused link id")


def next_rank(db: Session, group_id: int) -> int:
    highest = db.scalar(select(func.max(Guest.rank)).where(Guest.group_id == group_id))
    return 0 if highest is None else highest + 1


def renumber(db: Session, group_id: int) -> None:
    """Close gaps so ranks run 0, 1, 2… in their current order."""
    guests = db.scalars(
        select(Guest).where(Guest.group_id == group_id).order_by(Guest.rank, Guest.id)
    ).all()
    for i, guest in enumerate(guests):
        guest.rank = i


# ---------------------------------------------------------------- CSV import

HEADER_ALIASES = {
    "group": {"group", "group name", "household", "party", "family", "invite", "invitation"},
    "name": {"name", "guest", "guest name", "full name", "display name"},
    "rank": {"rank", "order", "position", "#", "no", "no.", "number"},
    "rsvp": {"rsvp", "status", "response"},
}
RSVP_WORDS = {
    "attending": {"attending", "yes", "y", "accepted", "accept", "coming", "going"},
    "not_attending": {"not attending", "no", "n", "declined", "decline", "not coming", "regrets"},
    "no_response": {"no response", "pending", "unknown", "awaiting", ""},
}
MAX_ROWS = 5000


class ImportProblem(ValueError):
    pass


@dataclass
class Row:
    line: int
    group: str
    name: str
    rank: float | None
    rsvp: str | None


def _header(cell: str) -> str:
    return cell.strip().lstrip("﻿").lower().replace("_", " ")


def _rank(cell: str) -> float | None:
    try:
        return float(cell)
    except ValueError:
        return None


def _rsvp(cell: str) -> str | None:
    word = cell.strip().lower().replace("_", " ")
    for value, words in RSVP_WORDS.items():
        if word in words:
            return value
    return None


def parse_guest_csv(text: str) -> tuple[list[Row], int]:
    """Returns the rows that have a name, and how many rows were ignored for having none."""
    text = text.lstrip("﻿")
    first = next((line for line in text.splitlines() if line.strip()), "")
    if not first:
        raise ImportProblem("The file is empty.")
    delimiter = max(",;\t", key=first.count) if any(d in first for d in ",;\t") else ","

    cols: dict[str, int] = {}
    rows: list[Row] = []
    ignored = 0
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        for record in reader:
            if not any(cell.strip() for cell in record):
                continue
            if not cols:  # the first non-blank row is the header
                headers = [_header(cell) for cell in record]
                for key, aliases in HEADER_ALIASES.items():
                    found = next((i for i, h in enumerate(headers) if h in aliases), None)
                    if found is not None:
                        cols[key] = found
                if "name" not in cols:
                    raise ImportProblem(
                        "The first row should be column headings with at least a 'name' column "
                        "(and optionally 'group' and 'rank')."
                    )
                continue

            def cell(key: str) -> str:
                i = cols.get(key)
                return record[i] if i is not None and i < len(record) else ""

            name = clean_text(cell("name"))[:GUEST_NAME_MAX]
            if not name:
                ignored += 1
                continue
            if len(rows) >= MAX_ROWS:
                raise ImportProblem(f"That's more than {MAX_ROWS} guests; split the file up.")
            rows.append(
                Row(
                    line=reader.line_num,
                    group=clean_text(cell("group"))[:GROUP_NAME_MAX],
                    name=name,
                    rank=_rank(cell("rank")),
                    rsvp=_rsvp(cell("rsvp")) if "rsvp" in cols else None,
                )
            )
    except csv.Error as exc:
        raise ImportProblem(f"Couldn't read the CSV (line {reader.line_num}): {exc}") from exc
    return rows, ignored


def import_guests(db: Session, text: str) -> ImportOut:
    """Adds guests to groups matched by name (case-insensitive), creating groups as needed.

    A guest with no group gets a group of their own. A guest already in that group is skipped,
    so importing the same file twice changes nothing.
    """
    rows, ignored = parse_guest_csv(text)

    existing: dict[str, Group] = {}
    for group in db.scalars(select(Group).options(selectinload(Group.guests)).order_by(Group.id)):
        existing.setdefault(group.name.casefold(), group)

    buckets: dict[str, list[Row]] = {}
    labels: dict[str, str] = {}
    for row in rows:
        label = row.group or row.name
        key = label.casefold()
        buckets.setdefault(key, []).append(row)
        labels.setdefault(key, label)

    created = added = skipped = 0
    for key, items in buckets.items():
        group = existing.get(key)
        if group is None:
            group = create_group(db, labels[key])
            existing[key] = group
            created += 1
            have: set[str] = set()
            rank = 0
        else:
            have = {g.name.casefold() for g in group.guests}
            rank = max((g.rank for g in group.guests), default=-1) + 1

        # ranked rows first, in rank order; then the rest in file order
        items.sort(key=lambda r: (r.rank is None, r.rank or 0, r.line))
        for row in items:
            if row.name.casefold() in have:
                skipped += 1
                continue
            have.add(row.name.casefold())
            db.add(Guest(group_id=group.id, name=row.name, rank=rank, rsvp=row.rsvp or "no_response"))
            rank += 1
            added += 1

    db.commit()
    return ImportOut(
        groups_created=created, guests_added=added, guests_skipped=skipped, rows_ignored=ignored
    )

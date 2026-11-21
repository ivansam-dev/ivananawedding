from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_serializer

Role = Literal["root", "link"]
Rsvp = Literal["no_response", "attending", "not_attending"]
SentKind = Literal["save_the_date", "invitation"]

GUEST_NAME_MAX = 60  # the card trims longer names (see cleanNames in index.html)
GROUP_NAME_MAX = 120


def clean_text(value: str) -> str:
    return " ".join(value.split())


def _name(max_len: int):
    def check(value: str) -> str:
        value = clean_text(value)
        if not value:
            raise ValueError("must not be blank")
        if len(value) > max_len:
            raise ValueError(f"must be at most {max_len} characters")
        return value

    return AfterValidator(check)


GuestName = Annotated[str, _name(GUEST_NAME_MAX)]
GroupName = Annotated[str, _name(GROUP_NAME_MAX)]


# ---- auth ----

class LoginIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class MeOut(BaseModel):
    role: Role
    base_url: str  # PUBLIC_URL; empty means "use the address the admin is browsing on"


# ---- public ----

class InviteOut(BaseModel):
    names: list[str]


# ---- admin ----

class GuestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    rank: int
    rsvp: Rsvp
    save_the_date_sent_at: datetime | None
    invitation_sent_at: datetime | None

    @field_serializer("save_the_date_sent_at", "invitation_sent_at")
    def _as_utc(self, value: datetime | None) -> str | None:
        return value.replace(tzinfo=timezone.utc).isoformat() if value else None


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    public_id: str
    name: str
    guests: list[GuestOut]


class LinkGroupOut(BaseModel):
    """What the link-only admin sees: enough to know who a link is for."""

    id: int
    public_id: str
    name: str
    guests: list[str]


class GroupCreate(BaseModel):
    name: GroupName
    guests: list[GuestName] = Field(default_factory=list, max_length=50)


class GroupUpdate(BaseModel):
    name: GroupName


class GuestCreate(BaseModel):
    name: GuestName


class GuestUpdate(BaseModel):
    name: GuestName | None = None
    rsvp: Rsvp | None = None
    group_id: int | None = None
    save_the_date_sent: bool | None = None
    invitation_sent: bool | None = None


class SentIn(BaseModel):
    kind: SentKind
    sent: bool


class OrderIn(BaseModel):
    guest_ids: list[int]


class ImportIn(BaseModel):
    csv: str = Field(max_length=1_000_000)


class ClearIn(BaseModel):
    confirm: Literal["delete"]


class ClearOut(BaseModel):
    groups_deleted: int
    guests_deleted: int


class ImportOut(BaseModel):
    groups_created: int
    guests_added: int
    guests_skipped: int  # already in that group
    rows_ignored: int  # no name

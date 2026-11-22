from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_serializer, model_validator

Role = Literal["root", "link"]
Rsvp = Literal["no_response", "attending", "not_attending"]
Answer = Literal["attending", "not_attending"]  # what a guest can send from the reply card
SentKind = Literal["save_the_date", "invitation"]
LetterKind = Literal["save_the_date", "invitation", "rsvp", "details"]  # models.LETTERS

GUEST_NAME_MAX = 60  # the card trims longer names (see cleanNames in index.html)
CATEGORY_MAX = 60
LOCATION_MAX = 60
DIETARY_MAX = 300
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


def _optional(max_len: int):
    def check(value: str) -> str:
        value = clean_text(value)
        if len(value) > max_len:
            raise ValueError(f"must be at most {max_len} characters")
        return value

    return AfterValidator(check)


GuestName = Annotated[str, _name(GUEST_NAME_MAX)]
Category = Annotated[str, _optional(CATEGORY_MAX)]  # blank clears it
Location = Annotated[str, _optional(LOCATION_MAX)]  # blank clears it
Dietary = Annotated[str, _optional(DIETARY_MAX)]  # blank clears it
GroupName = Annotated[str, _name(GROUP_NAME_MAX)]


# ---- auth ----

class LoginIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class MeOut(BaseModel):
    role: Role
    base_url: str  # PUBLIC_URL; empty means "use the address the admin is browsing on"


# ---- public ----

class InviteGuestOut(BaseModel):
    """A guest as the reply card shows them, with their answers so far."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    tea_rsvp: Rsvp
    reception_rsvp: Rsvp
    dietary: str


class InviteOut(BaseModel):
    names: list[str]
    guests: list[InviteGuestOut]  # the same people, in the same order, for the reply card
    letters: list[LetterKind]  # the active letters, earliest first
    opens: LetterKind  # the one the card opens on; the rest sit beneath it in the order above


class ReplyIn(BaseModel):
    """One guest's reply. An event left out keeps its answer."""

    guest_id: int
    tea_rsvp: Answer | None = None
    reception_rsvp: Answer | None = None
    dietary: Dietary = ""  # only kept for guests attending at least one event

    @model_validator(mode="after")
    def _answers_something(self) -> ReplyIn:
        if self.tea_rsvp is None and self.reception_rsvp is None:
            raise ValueError("a reply needs an answer for the tea ceremony, the reception or both")
        return self


class RsvpIn(BaseModel):
    replies: list[ReplyIn] = Field(min_length=1, max_length=50)


class RsvpOut(BaseModel):
    guests: list[InviteGuestOut]


class LettersOut(BaseModel):
    letters: list[LetterKind]  # as InviteOut
    opens: LetterKind


class LetterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: LetterKind
    active: bool
    rank: int  # 1 is the earliest
    opens_first: bool  # guests' cards open on this one


class LetterUpdate(BaseModel):
    active: bool | None = None
    rank: int | None = Field(default=None, ge=1)
    opens_first: Literal[True] | None = None  # to stop one opening first, pick another


# ---- admin ----

class GuestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    rank: int
    tea_rsvp: Rsvp
    reception_rsvp: Rsvp
    category: str
    location: str
    dietary: str
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
    tea_rsvp: Rsvp | None = None
    reception_rsvp: Rsvp | None = None
    category: Category | None = None
    location: Location | None = None
    dietary: Dietary | None = None
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
    guests_updated: int  # already in that group, but given a new category or location
    rows_ignored: int  # no name

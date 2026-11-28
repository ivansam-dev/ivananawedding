from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_serializer, model_validator

Role = Literal["root", "link"]
Rsvp = Literal["no_response", "attending", "not_attending"]
Answer = Literal["attending", "not_attending"]  # what a guest can send from the reply card
SentKind = Literal["save_the_date", "invitation"]
LetterKind = Literal["save_the_date", "invitation", "rsvp", "details"]  # models.LETTERS
Lang = Literal["en", "vi", "zh-Hant"]  # the card's languages (TEXT in index.html)

GUEST_NAME_MAX = 60  # the card trims longer names (see cleanNames in index.html)
CATEGORY_MAX = 60
LOCATION_MAX = 60
DIETARY_MAX = 300
GROUP_NAME_MAX = 120
VERSION_NAME_MAX = 60
PIECE_TEXT_MAX = 160  # a piece of the card's text, reworded (TEXT_MAX in index.html)
PIECE_LINES_MAX = 4


def clean_text(value: str) -> str:
    return " ".join(value.split())


def _storable(value: str) -> str:
    """clean_text, refusing what SQLite can't store: a lone surrogate, as a raw \\ud800 in the JSON gives."""
    try:
        value.encode()
    except UnicodeEncodeError:
        raise ValueError("must be valid text") from None
    return clean_text(value)


def _name(max_len: int):
    def check(value: str) -> str:
        value = _storable(value)
        if not value:
            raise ValueError("must not be blank")
        if len(value) > max_len:
            raise ValueError(f"must be at most {max_len} characters")
        return value

    return AfterValidator(check)


def _optional(max_len: int):
    def check(value: str) -> str:
        value = _storable(value)
        if len(value) > max_len:
            raise ValueError(f"must be at most {max_len} characters")
        return value

    return AfterValidator(check)


GuestName = Annotated[str, _name(GUEST_NAME_MAX)]
Category = Annotated[str, _optional(CATEGORY_MAX)]  # blank clears it
Location = Annotated[str, _optional(LOCATION_MAX)]  # blank clears it
Dietary = Annotated[str, _optional(DIETARY_MAX)]  # blank clears it
GroupName = Annotated[str, _name(GROUP_NAME_MAX)]
VersionName = Annotated[str, _name(VERSION_NAME_MAX)]


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


class LetterStyle(BaseModel):
    """The envelope's look, chosen in the admin's Letter style view. Each name is one the card draws
    (applyStyle in index.html); the defaults are the original cinnabar lacquer."""

    colour: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] = "#83171c"  # the flap's lacquer; the rest follows
    pattern: Literal["foil", "none", "corner", "corners", "blossoms", "lattice", "clouds", "waves"] = "foil"
    finish: Literal["tone", "gold"] = "tone"  # the pattern in a lighter shade of the lacquer, or in gold
    strength: float = Field(default=1.0, ge=0.2, le=1.0)  # how strongly the pattern shows
    crease: Literal["none", "gold", "double", "stitch", "pearls", "laurel"] = "none"  # trim along the flap's edges
    seal: Literal["red", "gold", "tone"] = "red"  # tone: in the envelope's own colour
    seal_size: float = Field(default=1.0, ge=0.6, le=1.5)  # the 囍 seal's size, against the original's

    @field_serializer("colour")
    def _lower(self, colour: str) -> str:
        return colour.lower()


class Placement(BaseModel):
    """Where one piece of the card's text sits, against where the card puts it by default."""

    x: float = Field(default=0, ge=-60, le=60)  # across, in card units (the card is 122 wide); right is +
    y: float = Field(default=0, ge=-40, le=40)  # down, in the same units (the card is about 75 tall)
    size: float = Field(default=1.0, ge=0.4, le=2.5)  # its font size, against its default one
    bold: bool = False
    italic: bool = False


def _words(value: str) -> str:
    """A piece's own words: each line tidied as clean_text does, blank lines dropped. Blank altogether leaves
    the piece off the card."""
    try:
        value.encode()
    except UnicodeEncodeError:
        raise ValueError("must be valid text") from None
    lines = [line for line in (clean_text(x) for x in value.splitlines()) if line]
    if len(lines) > PIECE_LINES_MAX:
        raise ValueError(f"must be at most {PIECE_LINES_MAX} lines")
    text = "\n".join(lines)
    if len(text) > PIECE_TEXT_MAX:
        raise ValueError(f"must be at most {PIECE_TEXT_MAX} characters")
    return text


Words = Annotated[str, AfterValidator(_words)]


class TextPlacement(Placement):
    """A piece whose words the admin can also change: text has them for each language changed (a language left
    out keeps the card's own words, in index.html)."""

    text: dict[Lang, Words] = Field(default_factory=dict)


class StdLayout(BaseModel):
    """The save the date's text, each piece moved, sized and reworded in the admin's Card layout view
    (applyLayout in index.html). The defaults leave everything where the stylesheet puts it."""

    title: TextPlacement = Field(default_factory=TextPlacement)  # "Save the date"
    lead: TextPlacement = Field(default_factory=TextPlacement)  # "for the wedding of"
    names: TextPlacement = Field(default_factory=TextPlacement)  # the couple's; the same words in every language
    day: TextPlacement = Field(default_factory=TextPlacement)
    place: TextPlacement = Field(default_factory=TextPlacement)
    note: TextPlacement = Field(default_factory=TextPlacement)  # "Invitation to follow"


class CoverLayout(BaseModel):
    """The card's cover, which greets the guests ("Dear …"), laid out in the same view."""

    xi: Placement = Field(default_factory=Placement)  # the 囍 emblem
    dear: TextPlacement = Field(default_factory=TextPlacement)  # "Dear"
    names: Placement = Field(default_factory=Placement)  # the guests' names, from their link, so not reworded here


class CardLayout(BaseModel):
    """One version of the card's layout: its cover and its save the date."""

    cover: CoverLayout = Field(default_factory=CoverLayout)
    save_the_date: StdLayout = Field(default_factory=StdLayout)
    # the save the date card's height (and so its cover's), against the original's: taller only, its width stays
    std_height: float = Field(default=1.0, ge=1.0, le=1.6)


class InviteOut(BaseModel):
    names: list[str]
    guests: list[InviteGuestOut]  # the same people, in the same order, for the reply card
    letters: list[LetterKind]  # the active letters, earliest first
    opens: LetterKind  # the one the card opens on; the rest sit beneath it in the order above
    style: LetterStyle
    layout: CardLayout  # the live version's


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
    style: LetterStyle
    layout: CardLayout


class VersionOut(BaseModel):
    """A saved version of the card's layout. Guests see the live one."""

    id: int
    name: str
    live: bool
    layout: CardLayout
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _as_utc(self, value: datetime) -> str:
        return value.replace(tzinfo=timezone.utc).isoformat()


class VersionCreate(BaseModel):
    name: VersionName
    layout: CardLayout = Field(default_factory=CardLayout)  # the original, unless given


class VersionUpdate(BaseModel):
    name: VersionName | None = None
    layout: CardLayout | None = None
    live: Literal[True] | None = None  # to stop one being live, make another live


class StyleVersionOut(BaseModel):
    """A saved version of the envelope's look. Guests see the live one."""

    id: int
    name: str
    live: bool
    style: LetterStyle
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _as_utc(self, value: datetime) -> str:
        return value.replace(tzinfo=timezone.utc).isoformat()


class StyleVersionCreate(BaseModel):
    name: VersionName
    style: LetterStyle = Field(default_factory=LetterStyle)  # the original, unless given


class StyleVersionUpdate(BaseModel):
    name: VersionName | None = None
    style: LetterStyle | None = None
    live: Literal[True] | None = None  # to stop one being live, make another live


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

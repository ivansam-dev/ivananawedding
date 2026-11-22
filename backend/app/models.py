from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

RSVP_VALUES = ("no_response", "attending", "not_attending")
SENT_KINDS = ("save_the_date", "invitation")


def utcnow() -> datetime:
    """Naive UTC; SQLite has no time zones, so everything stored is UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Group(Base):
    """A set of guests who share one link and are greeted together on the card."""

    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    guests: Mapped[list[Guest]] = relationship(
        back_populates="group",
        order_by=lambda: (Guest.rank, Guest.id),
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    rank: Mapped[int] = mapped_column(default=0)  # 0 is greeted first
    rsvp: Mapped[str] = mapped_column(String(16), default="no_response")
    category: Mapped[str] = mapped_column(String(60), default="", server_default="")  # e.g. "Bride's family"
    location: Mapped[str] = mapped_column(String(60), default="", server_default="")  # e.g. "Singapore"
    save_the_date_sent_at: Mapped[datetime | None]
    invitation_sent_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    group: Mapped[Group] = relationship(back_populates="guests")


class AdminCredential(Base):
    __tablename__ = "admin_credentials"

    role: Mapped[str] = mapped_column(String(16), primary_key=True)  # "root" | "link"
    password_hash: Mapped[str] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]

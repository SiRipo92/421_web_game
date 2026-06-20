"""SQLAlchemy ORM models mapping to all database tables."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> uuid.UUID:
    """Generate a new random UUID (used as column default)."""
    return uuid.uuid4()


class User(Base):
    """Registered player account with auth fields and GDPR metadata."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    birthdate: Mapped[date | None] = mapped_column(Date, nullable=True)
    avatar_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    avatar_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lang_pref: Mapped[str] = mapped_column(String(2), nullable=False, server_default="fr")
    # G46: per-account theme preference (light/dark). Synced with the
    # in-game presentation popover toggle when the user is logged in.
    theme_pref: Mapped[str] = mapped_column(String(8), nullable=False, server_default="light")
    email_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # G96: True when admin auto-sanitized this user's handle. The user
    # sees an in-app banner prompting them to choose a new one. Cleared
    # by PATCH /auth/me on successful rename.
    username_pending_change: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    # Moderation foundation (G38). Role is a plain string column rather than a
    # Postgres ENUM so promoting/demoting in tests + migrations stays a single
    # UPDATE instead of an ALTER TYPE dance.
    role: Mapped[str] = mapped_column(String(16), nullable=False, server_default="player")
    strike_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    chat_banned_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    banned_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ban_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deletion_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # G90: refreshed by `get_current_user` on every authenticated request
    # (5-min throttle). Powers the admin "online" filter as a proxy for
    # real WS presence until [[G88]] ships.
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    stats: Mapped["PlayerStats"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    game_players: Mapped[list["GamePlayer"]] = relationship(back_populates="user")
    reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Game(Base):
    """Completed game record written when a session finishes."""

    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    # G91: not unique anymore — a single room hosts multiple sequential
    # parties. (game_code, partie_number) is the unique pair.
    game_code: Mapped[str] = mapped_column(String(8), nullable=False)
    partie_number: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1", default=1
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    total_rounds: Mapped[int] = mapped_column(Integer, default=0)

    players: Mapped[list["GamePlayer"]] = relationship(
        back_populates="game", cascade="all, delete-orphan"
    )


class GamePlayer(Base):
    """Per-player outcome row for a completed game."""

    __tablename__ = "game_players"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    display_name: Mapped[str] = mapped_column(String(32), nullable=False)
    final_tokens: Mapped[int] = mapped_column(Integer, default=0)
    round_points: Mapped[int] = mapped_column(Integer, default=0)
    placement: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    game: Mapped["Game"] = relationship(back_populates="players")
    user: Mapped["User | None"] = relationship(back_populates="game_players")


class PlayerStats(Base):
    """Aggregated stats + ELO for a user. One row per user.

    G91: column names use 421 vocabulary. The objective isn't to "win" but
    to NOT lose — `parties_lost` is the rare-and-bad outcome,
    `parties_survived` is everyone else's outcome. Per-cycle (manche)
    counters surface "how often this player took fiches" independent of
    final-game outcomes.
    """

    __tablename__ = "player_stats"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    elo: Mapped[int] = mapped_column(Integer, default=1200)
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    parties_survived: Mapped[int] = mapped_column(Integer, default=0)
    parties_lost: Mapped[int] = mapped_column(Integer, default=0)
    manches_played: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    manches_lost: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    current_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    longest_streak: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="stats")


class GdprAuditLog(Base):
    """Immutable log of GDPR-relevant events (registrations, deletions, data requests)."""

    __tablename__ = "gdpr_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class PasswordResetToken(Base):
    """Single-use time-limited token for password reset flows."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="reset_tokens")

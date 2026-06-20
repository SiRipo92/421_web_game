"""G93: AFK eviction logic.

Today the AFK bot ([[G9]]) takes over a player's turn indefinitely.
Result: an AFK human keeps their seat forever, blocking joiners.

This module owns the "is this AFK session past the threshold? if so,
evict" logic. Called from `_afk_timer` in ws.py before the bot plays —
if the human has been AFK longer than `BOT_TAKEOVER_MAX_MINUTES`, we
skip the bot turn and remove the player from the game instead.

Why a separate module:
  - The eviction does several things (DB writes, broadcasts, audit log,
    anti-grief chat-ban, optional email) and inlining all of that in
    ws.py would make the bot-turn function unreadable.
  - The anti-grief check needs DB access; keeping it here means ws.py
    doesn't need to know about the audit-log query shape.
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

import sentry_sdk
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.db.models import GdprAuditLog, User
from app.game.logic import Game, GamePhase, Player

logger = logging.getLogger(__name__)

# Anti-grief threshold: this many evictions in 24h → chat-ban for 24h.
# Three is the floor where the pattern stops looking like "user had a
# bad day" and starts looking like "user is gaming the bot for grief".
EVICTION_24H_THRESHOLD = 3
# Clamp the env var at runtime so a misconfig can't lock out legitimate
# slow players (lower bound) or hold zombie seats forever (upper bound).
MIN_TIMEOUT_MINUTES = 5
MAX_TIMEOUT_MINUTES = 30


def _resolve_timeout_minutes() -> int:
    """Clamp the env-configured timeout to a sane range."""
    return max(MIN_TIMEOUT_MINUTES, min(MAX_TIMEOUT_MINUTES, settings.bot_takeover_max_minutes))


def is_eviction_due(player: Player) -> bool:
    """True if this player's AFK session exceeds the timeout.

    Returns False when `afk_started_at` is None (the player isn't AFK yet,
    or just resumed) — eviction only happens for players who are actively
    being bot-played.
    """
    if player.afk_started_at is None:
        return False
    elapsed = datetime.now(UTC) - player.afk_started_at
    return elapsed >= timedelta(minutes=_resolve_timeout_minutes())


def should_send_warning(player: Player) -> bool:
    """True when the AFK player should receive a warning toast NOW.

    Warning fires once when elapsed time enters the "last N seconds"
    window. `afk_warnings_sent` is incremented by the caller so we don't
    re-fire on subsequent bot turns within the same minute.
    """
    if player.afk_started_at is None:
        return False
    if player.afk_warnings_sent > 0:
        return False
    elapsed = datetime.now(UTC) - player.afk_started_at
    threshold = timedelta(minutes=_resolve_timeout_minutes()) - timedelta(
        seconds=settings.bot_takeover_warning_seconds
    )
    return elapsed >= threshold


def warning_payload(player: Player) -> dict:
    """WS message body for the T-2min warning toast."""
    if player.afk_started_at is None:
        return {"type": "eviction_warning", "seconds_remaining": 0}
    elapsed = datetime.now(UTC) - player.afk_started_at
    total = timedelta(minutes=_resolve_timeout_minutes())
    remaining = max(0, int((total - elapsed).total_seconds()))
    return {
        "type": "eviction_warning",
        "seconds_remaining": remaining,
        "player_id": player.id,
    }


async def mark_afk_started(player: Player) -> None:
    """Stamp `afk_started_at` on first bot-takeover of this episode.

    Idempotent — called every time the bot is about to play; only sets
    the timestamp if it's None. Resets `afk_warnings_sent` to 0 too
    (defensive — `clear_afk_state` should already have done this).
    """
    if player.afk_started_at is None:
        player.afk_started_at = datetime.now(UTC)
        player.afk_warnings_sent = 0


def clear_afk_state(player: Player) -> None:
    """Clear AFK tracking. Called when the player returns (bot-handback
    or post-grace) so the eviction clock starts fresh next time."""
    player.afk_started_at = None
    player.afk_warnings_sent = 0


async def _recent_evictions_for(user_id: uuid.UUID, db: AsyncSession) -> int:
    """Count this user's AFK-eviction events in the last 24h."""
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    result = await db.execute(
        select(func.count(GdprAuditLog.id)).where(
            GdprAuditLog.user_id == user_id,
            GdprAuditLog.event_type == "afk_eviction",
            GdprAuditLog.occurred_at >= cutoff,
        )
    )
    return result.scalar() or 0


async def _apply_anti_grief(user: User, db: AsyncSession) -> Optional[str]:
    """If this user has hit EVICTION_24H_THRESHOLD evictions in 24h,
    apply a 24h chat-ban with reason=repeated_afk.

    Returns the ISO timestamp of the new chat_banned_until if applied,
    None otherwise. Idempotent — extends an existing chat-ban if there
    is one (so the user can't dodge by being AFK while chat-banned).
    """
    count = await _recent_evictions_for(user.id, db)
    if count + 1 < EVICTION_24H_THRESHOLD:
        return None  # this eviction doesn't trigger the threshold
    now = datetime.now(UTC)
    new_until = now + timedelta(hours=24)
    if user.chat_banned_until is None or user.chat_banned_until < new_until:
        user.chat_banned_until = new_until
    return new_until.isoformat()


async def _send_eviction_email(user: User, game_code: str, elapsed_minutes: int) -> None:
    """Best-effort session_ended_afk email. Failure never raises —
    eviction must proceed regardless of email delivery."""
    if not user.email_opt_in:
        return
    try:
        from app.services.email import _send_via_brevo, render_email

        subject, html, text = render_email(
            "session_ended_afk",
            user.lang_pref,
            username=user.username,
            game_code=game_code,
            timeout_minutes=elapsed_minutes,
        )
        _send_via_brevo(
            to_email=user.email,
            to_name=user.username,
            subject=subject,
            html=html,
            text=text,
        )
    except Exception:
        logger.exception("Failed to send session_ended_afk email to %s", user.email)


async def evict_player(
    game: Game,
    player: Player,
    *,
    broadcaster=None,
) -> dict:
    """Remove the player from the game. Returns an audit-shaped dict.

    Steps:
      1. Persist mid-partie stats (same shape as voluntary leave + kick).
      2. Snapshot user_id BEFORE removing the player from game state.
      3. Remove the player from in-memory game (mirrors kick cleanup).
      4. Apply anti-grief chat-ban if threshold hit.
      5. Audit log `afk_eviction`.
      6. Fire eviction email (best-effort).
      7. Optionally broadcast `player_evicted_afk` via `broadcaster` if
         provided (ws.py passes `manager.broadcast` here).

    Synchronous-await so the caller can guarantee state is settled
    before the next bot-turn schedule. Email send is awaited too but
    swallows its own errors.
    """
    user_id_str = game.user_ids.get(player.id)
    elapsed_min = 0
    if player.afk_started_at:
        elapsed_min = int((datetime.now(UTC) - player.afk_started_at).total_seconds() // 60)

    # Step 1: persist mid-partie stats if registered + actively playing.
    if game.phase in (GamePhase.CHARGE, GamePhase.DECHARGE, GamePhase.TIEBREAK) and user_id_str:
        from app.services.game_persistence import persist_player_session

        await persist_player_session(
            user_id_str,
            game.id,
            game.round_points.get(player.id, 0),
            manches_played=game.manches_played.get(player.id, 0),
            manches_lost=game.manches_lost.get(player.id, 0),
        )

    # Step 2: snapshot for audit log + email.
    snapshot = {
        "player_id": player.id,
        "user_id": user_id_str,
        "name": player.name,
        "elapsed_minutes": elapsed_min,
    }

    # Step 3: clean up in-memory game state.
    game.players = [p for p in game.players if p.id != player.id]
    game.user_ids.pop(player.id, None)
    game.match_losses.pop(player.id, None)
    game.round_points.pop(player.id, None)
    game.has_avatars.pop(player.id, None)
    game.manches_played.pop(player.id, None)
    game.manches_lost.pop(player.id, None)
    game.out_of_match.discard(player.id)
    game.afk_session.discard(player.id)

    # If the evicted player was the host, migrate to longest-tenured remaining.
    if player.id == game.host_player_id and game.players:
        next_host = min(game.players, key=lambda p: p.joined_at)
        game.host_player_id = next_host.id

    # Steps 4 + 5 + 6 happen in a single DB session.
    chat_until_iso: Optional[str] = None
    try:
        async with AsyncSessionLocal() as db:
            user: Optional[User] = None
            if user_id_str:
                try:
                    user = await db.get(User, uuid.UUID(user_id_str))
                except (TypeError, ValueError):
                    user = None
            # Anti-grief BEFORE audit-log insert so the audit-log row
            # we're about to add doesn't tip the count over.
            if user is not None:
                chat_until_iso = await _apply_anti_grief(user, db)
            db.add(
                GdprAuditLog(
                    user_id=user.id if user else None,
                    event_type="afk_eviction",
                    metadata_={
                        "game_id": game.id,
                        "player_id": snapshot["player_id"],
                        "player_name": snapshot["name"],
                        "elapsed_minutes": elapsed_min,
                        "chat_ban_applied_until": chat_until_iso,
                    },
                )
            )
            await db.commit()
            # Email AFTER commit so we don't email someone whose anti-grief
            # ban failed to persist for some reason. Email failures don't
            # roll back.
            if user is not None:
                await _send_eviction_email(user, game.id, elapsed_min)
    except Exception:
        logger.exception("afk_eviction audit/persist failed for player %s", player.id)
        sentry_sdk.capture_exception()

    # Step 7: broadcast if the caller passed a broadcaster.
    if broadcaster is not None:
        try:
            await broadcaster(
                game.id,
                {
                    "type": "player_evicted_afk",
                    "player_id": snapshot["player_id"],
                    "player_name": snapshot["name"],
                    "elapsed_minutes": elapsed_min,
                },
            )
        except Exception:  # noqa: BLE001
            logger.exception("eviction broadcast failed for game %s", game.id)

    return {
        "evicted": True,
        "player_id": snapshot["player_id"],
        "elapsed_minutes": elapsed_min,
        "chat_ban_applied_until": chat_until_iso,
    }


# Convenience for tests + ad-hoc invocation; the ws.py caller awaits this
# directly inside `_afk_timer`.
__all__ = [
    "EVICTION_24H_THRESHOLD",
    "clear_afk_state",
    "evict_player",
    "is_eviction_due",
    "mark_afk_started",
    "should_send_warning",
    "warning_payload",
]


# Silence unused-import warning if asyncio isn't directly used yet
# (kept for callers that may want to schedule background tasks).
_ = asyncio

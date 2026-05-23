"""Persist completed game results and update ELO rankings in the DB."""

import logging
import uuid
from datetime import UTC, datetime

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import AsyncSessionLocal
from app.db.models import Game as GameRecord
from app.db.models import GamePlayer, PlayerStats
from app.game.logic import Game
from app.game.state import games
from app.services.elo import updated_elo

logger = logging.getLogger(__name__)


async def persist_completed_game(game: Game) -> None:
    """Write game outcome to DB then remove from in-memory registry."""
    try:
        async with AsyncSessionLocal() as db:
            await _write(game, db)
        logger.info("Persisted game %s (%d players)", game.id, len(game.players))
    except Exception:
        logger.exception("Failed to persist game %s", game.id)
        sentry_sdk.capture_exception()
    finally:
        games.pop(game.id, None)


async def persist_player_session(user_id_str: str, game_code: str, round_points: int) -> None:
    """Bump a single registered player's lifetime stats when they leave an active game.

    Called from the WS leave handler whenever a logged-in user steps out of a
    game past WAITING (i.e. they were actually playing). Increments
    `games_played`, attributes their session `round_points` to `losses`, and
    counts a `win` only if they left with zero round points.

    Snapshotted values are passed by argument — we don't keep a reference to
    the live `Game` because the caller may have already mutated it (popping the
    leaver from `user_ids` / `round_points`) by the time this coroutine runs.

    ELO recalculation is deliberately skipped here. Without a canonical game-end
    we don't know who the "opponents" are in the rating sense; the next
    iteration (or a periodic batch job) can revisit when game-record writes
    have a clear trigger.
    """
    if not user_id_str:
        return
    try:
        user_uuid = uuid.UUID(user_id_str)
    except (TypeError, ValueError):
        return
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(PlayerStats).where(PlayerStats.user_id == user_uuid))
            stats = result.scalar_one_or_none()
            if stats is None:
                # Shouldn't happen — PlayerStats is created at registration time.
                logger.warning(
                    "persist_player_session: no PlayerStats row for user %s", user_id_str
                )
                return
            stats.games_played += 1
            if round_points > 0:
                stats.losses += round_points
            else:
                stats.wins += 1
            await db.commit()
        logger.info(
            "Persisted session: user=%s game=%s round_points=%d",
            user_id_str,
            game_code,
            round_points,
        )
    except Exception:
        logger.exception(
            "Failed to persist player session game=%s user=%s",
            game_code,
            user_id_str,
        )
        sentry_sdk.capture_exception()


async def _write(game: Game, db: AsyncSession) -> None:
    """Create game/player rows and recalculate ELO for all registered players."""
    players = game.players
    sorted_players = sorted(players, key=lambda p: p.tokens)
    winner = sorted_players[0]
    winner_user_id = game.user_ids.get(winner.id)

    # Collect registered players for ELO
    registered = [p for p in players if game.user_ids.get(p.id) is not None]
    registered_user_ids = [uuid.UUID(game.user_ids[p.id]) for p in registered]

    # Load all PlayerStats rows in one query
    stats_rows: dict[uuid.UUID, PlayerStats] = {}
    if registered_user_ids:
        result = await db.execute(
            select(PlayerStats).where(PlayerStats.user_id.in_(registered_user_ids))
        )
        for row in result.scalars():
            stats_rows[row.user_id] = row

    # Create game record
    game_record = GameRecord(
        game_code=game.id,
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
        winner_id=uuid.UUID(winner_user_id) if winner_user_id else None,
        total_rounds=game.round_num,
    )
    db.add(game_record)
    await db.flush()

    # Write game_players rows
    for placement, p in enumerate(sorted_players, start=1):
        user_id_str = game.user_ids.get(p.id)
        db.add(
            GamePlayer(
                game_id=game_record.id,
                user_id=uuid.UUID(user_id_str) if user_id_str else None,
                display_name=p.name,
                final_tokens=p.tokens,
                round_points=game.round_points.get(p.id, 0),
                placement=placement,
            )
        )

    # Update ELO for registered players
    for p in registered:
        uid = uuid.UUID(game.user_ids[p.id])
        stats = stats_rows.get(uid)
        if stats is None:
            continue
        opponent_elos = [
            stats_rows[uuid.UUID(game.user_ids[op.id])].elo
            for op in registered
            if op.id != p.id and game.user_ids.get(op.id) in {str(k) for k in stats_rows}
        ]
        won = p.id == winner.id
        stats.elo = updated_elo(stats.elo, opponent_elos, won)
        stats.games_played += 1
        if won:
            stats.wins += 1
        else:
            stats.losses += 1

    await db.commit()

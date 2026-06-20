"""Persist 421 partie results and update lifetime PlayerStats / ELO.

G91 model: one DB write per **partie** (not per room). A room hosts multiple
parties; each partie ends when a player accumulates `round_points_to_lose`
round points (default 5). On partie end:
  - One `Game` row is written with `(game_code, partie_number)` identifying it.
  - One `GamePlayer` row per player (loser at the end placement).
  - Each registered player's `PlayerStats` is updated: counters, manche
    counters, streak, and ELO via `compute_partie_elo()`.

The room continues — the in-memory `Game` object resets state for the next
partie. Only the lone-survivor edge case (everyone else left mid-partie) does
NOT persist stats: that's attrition, not a real partie outcome.
"""

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
from app.services.elo import compute_partie_elo, updated_elo

logger = logging.getLogger(__name__)


async def persist_completed_partie(game: Game) -> None:
    """Write a completed-partie outcome to DB. Does NOT modify game state.

    Caller (typically `_persist_partie_and_reset` in logic.py) is responsible
    for resetting in-memory game state for the next partie. We just write.
    """
    if not game.partie_loser_id:
        logger.warning(
            "persist_completed_partie called without partie_loser_id for game %s; skipping",
            game.id,
        )
        return
    try:
        async with AsyncSessionLocal() as db:
            await _write(game, db)
        logger.info(
            "Persisted partie game=%s partie_number=%d (%d players, loser=%s)",
            game.id,
            game.partie_number,
            len(game.players),
            game.partie_loser_id,
        )
    except Exception:
        logger.exception("Failed to persist partie game=%s", game.id)
        sentry_sdk.capture_exception()


async def dissolve_room_without_stats(game: Game) -> None:
    """Remove a room from the registry without writing stats.

    Used for the lone-survivor edge case: when every other player has left
    mid-partie, the remaining player didn't earn a survival — they got it by
    attrition. No partie outcome to record. Just clean up the memory.
    """
    logger.info("Dissolving room %s (lone-survivor or empty)", game.id)
    games.pop(game.id, None)


async def persist_player_session(
    user_id_str: str,
    game_code: str,
    round_points: int,
    manches_played: int = 0,
    manches_lost: int = 0,
) -> None:
    """Account for a registered player who left mid-partie.

    G91 semantics: a mid-partie leave counts as a parties_lost (you conceded).
    `current_streak` resets. ELO penalty is small (no opponent context — the
    partie hadn't resolved). The remaining players continue the partie and
    will be persisted normally on natural end.

    G98 follow-up: manche counters ARE updated here. Before G98 they were
    skipped on leave (only natural partie-end captured them), which made
    leave-mid-game leave a confusing profile state — games_played went up
    but manche columns stayed at 0. Now we pass the in-memory counters
    from the Game object through so the profile reflects real progress.
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
                logger.warning(
                    "persist_player_session: no PlayerStats row for user %s", user_id_str
                )
                return
            stats.games_played += 1
            stats.parties_lost += 1
            stats.current_streak = 0
            stats.manches_played += manches_played
            stats.manches_lost += manches_lost
            # Small ELO penalty for early departure. Without knowing opponents,
            # treat as a loss against an average-1200 field.
            stats.elo = updated_elo(stats.elo, [1200], won=False)
            await db.commit()
        logger.info(
            "Persisted leave: user=%s game=%s round_points=%d",
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
    """Write the partie's Game row, GamePlayer rows, and update PlayerStats.

    Stat update logic:
      - Loser: parties_played++, parties_lost++, current_streak = 0
      - Survivor: parties_played++, parties_survived++, current_streak++,
        longest_streak = max(longest_streak, current_streak)
      - Everyone: manches_played += game.manches_played[pid],
        manches_lost += game.manches_lost[pid]
      - ELO: pairwise survivor-vs-loser via compute_partie_elo().
    """
    loser_id_str = game.partie_loser_id
    if not loser_id_str:
        return  # defensive — caller already guards this

    loser_player = next((p for p in game.players if p.id == loser_id_str), None)
    if loser_player is None:
        logger.warning(
            "Partie %s #%d: loser pid %s not in players; skipping",
            game.id,
            game.partie_number,
            loser_id_str,
        )
        return

    survivors = [p for p in game.players if p.id != loser_id_str]
    registered_uuids: list[uuid.UUID] = []
    for p in game.players:
        uid_str = game.user_ids.get(p.id)
        if uid_str:
            try:
                registered_uuids.append(uuid.UUID(uid_str))
            except ValueError:
                pass

    stats_rows: dict[uuid.UUID, PlayerStats] = {}
    if registered_uuids:
        result = await db.execute(
            select(PlayerStats).where(PlayerStats.user_id.in_(registered_uuids))
        )
        for row in result.scalars():
            stats_rows[row.user_id] = row

    # Game record. winner_id is None for 421 — there's a loser, not a single
    # winner. Placement on GamePlayer (1..N, loser last) carries the ordering.
    game_record = GameRecord(
        game_code=game.id,
        partie_number=game.partie_number,
        started_at=game.partie_started_at or datetime.now(UTC),
        finished_at=datetime.now(UTC),
        winner_id=None,
        total_rounds=game.round_num,
    )
    db.add(game_record)
    await db.flush()

    # Placements: survivors ordered by final_tokens ASC (fewer tokens = stronger
    # finish), then loser at the end with placement = len(players).
    placement_order = sorted(survivors, key=lambda p: p.tokens) + [loser_player]
    for placement, p in enumerate(placement_order, start=1):
        uid_str = game.user_ids.get(p.id)
        db.add(
            GamePlayer(
                game_id=game_record.id,
                user_id=uuid.UUID(uid_str) if uid_str else None,
                display_name=p.name,
                final_tokens=p.tokens,
                round_points=game.round_points.get(p.id, 0),
                placement=placement,
            )
        )

    # ELO update via pairwise survivor-vs-loser. Need loser's stats row to
    # compute K-factor; skip if loser is unregistered.
    loser_uid = uuid.UUID(game.user_ids[loser_id_str]) if game.user_ids.get(loser_id_str) else None
    loser_stats = stats_rows.get(loser_uid) if loser_uid else None

    survivor_inputs: list[tuple[int, int]] = []
    survivor_uuids_in_order: list[uuid.UUID] = []
    for s in survivors:
        uid_str = game.user_ids.get(s.id)
        if not uid_str:
            continue
        try:
            uid = uuid.UUID(uid_str)
        except ValueError:
            continue
        st = stats_rows.get(uid)
        if st is None:
            continue
        survivor_inputs.append((st.elo, st.games_played))
        survivor_uuids_in_order.append(uid)

    if loser_stats and survivor_inputs:
        new_survivor_elos, new_loser_elo = compute_partie_elo(
            survivor_inputs, loser_stats.elo, loser_stats.games_played
        )
        for uid, new_elo in zip(survivor_uuids_in_order, new_survivor_elos, strict=False):
            stats_rows[uid].elo = new_elo
        loser_stats.elo = new_loser_elo

    # Counter + streak updates apply to ALL registered players regardless of
    # whether the ELO computation ran (unregistered opponents shouldn't deny a
    # registered player their counter increment).
    for p in game.players:
        uid_str = game.user_ids.get(p.id)
        if not uid_str:
            continue
        try:
            uid = uuid.UUID(uid_str)
        except ValueError:
            continue
        stats = stats_rows.get(uid)
        if stats is None:
            continue
        stats.games_played += 1
        stats.manches_played += game.manches_played.get(p.id, 0)
        stats.manches_lost += game.manches_lost.get(p.id, 0)
        if p.id == loser_id_str:
            stats.parties_lost += 1
            stats.current_streak = 0
        else:
            stats.parties_survived += 1
            stats.current_streak += 1
            if stats.current_streak > stats.longest_streak:
                stats.longest_streak = stats.current_streak

    await db.commit()

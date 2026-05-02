import asyncio
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import AsyncSessionLocal
from app.db.models import Game as GameRecord
from app.db.models import GamePlayer, PlayerStats
from app.game.logic import Game, GamePhase
from app.game.state import games
from app.services.elo import updated_elo


async def persist_completed_game(game: Game) -> None:
    """Fire-and-forget: called when game phase == FINISHED."""
    try:
        async with AsyncSessionLocal() as db:
            await _write(game, db)
    except Exception as exc:
        print(f"[persistence] error saving game {game.id}: {exc}")
    finally:
        games.pop(game.id, None)


async def _write(game: Game, db: AsyncSession) -> None:
    players = game.players
    sorted_players = sorted(players, key=lambda p: p.tokens)
    winner = sorted_players[0]
    winner_user_id = game.user_ids.get(winner.id)

    # Collect registered players for ELO
    registered = [
        p for p in players if game.user_ids.get(p.id) is not None
    ]
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
        db.add(GamePlayer(
            game_id=game_record.id,
            user_id=uuid.UUID(user_id_str) if user_id_str else None,
            display_name=p.name,
            final_tokens=p.tokens,
            sets_lost=game.sets_lost.get(p.id, 0),
            placement=placement,
        ))

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
        won = (p.id == winner.id)
        stats.elo = updated_elo(stats.elo, opponent_elos, won)
        stats.games_played += 1
        if won:
            stats.wins += 1
        else:
            stats.losses += 1

    await db.commit()

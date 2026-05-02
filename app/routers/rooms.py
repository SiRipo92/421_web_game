"""Public room browser endpoint."""

from fastapi import APIRouter

from app.game.logic import GamePhase
from app.game.state import games

router = APIRouter(prefix="/api", tags=["rooms"])


@router.get("/rooms")
async def list_rooms():
    """Return open public rooms available to join."""
    open_phases = {GamePhase.WAITING, GamePhase.INITIAL_ROLL}
    rooms = []
    for game in games.values():
        if not game.is_public or game.phase not in open_phases:
            continue
        host_name = next(
            (p.name for p in game.players if p.id == game.host_player_id),
            None,
        )
        rooms.append(
            {
                "game_id": game.id,
                "player_count": len(game.players),
                "max_players": game.max_players,
                "bank_rule": game.bank_rule,
                "host_name": host_name,
            }
        )
    return {"rooms": rooms}

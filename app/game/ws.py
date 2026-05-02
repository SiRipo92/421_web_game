import json
import random
import uuid
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.db.models import User
from app.game.logic import (
    Game, GamePhase, Player,
    _finalize_order, _resolve_round, _start_initial_roll,
    classify, game_state, new_turn,
)
from app.game.state import games

router = APIRouter()

ALGORITHM = "HS256"


async def _resolve_user_from_token(token: Optional[str]) -> Optional[str]:
    """Return user UUID string from JWT, or None for guests."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, list[tuple]] = {}

    async def connect(self, game_id: str, ws: WebSocket, player_id: str):
        await ws.accept()
        self.connections.setdefault(game_id, []).append((ws, player_id))

    def disconnect(self, game_id: str, ws: WebSocket):
        if game_id in self.connections:
            self.connections[game_id] = [
                (w, p) for w, p in self.connections[game_id] if w != ws
            ]

    async def broadcast(self, game_id: str, data: dict):
        for ws, _ in self.connections.get(game_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


@router.get("/api/create")
async def create_game(token: Optional[str] = Query(default=None)):
    gid = str(uuid.uuid4())[:8]
    games[gid] = Game(id=gid)
    return {"game_id": gid}


@router.get("/api/join/{game_id}")
async def join_game(
    game_id: str,
    name: str,
    token: Optional[str] = Query(default=None),
):
    game = games.get(game_id.lower())
    if not game:
        return {"error": "Game not found"}

    user_id = await _resolve_user_from_token(token)
    pid = str(uuid.uuid4())[:8]
    player = Player(id=pid, name=name)

    if game.phase in (GamePhase.WAITING, GamePhase.INITIAL_ROLL):
        game.players.append(player)
        game.user_ids[pid] = user_id  # None for guests
        if game.phase == GamePhase.INITIAL_ROLL:
            game.initial_rolls[pid] = None
        return {"player_id": pid, "game_id": game.id, "status": "joined"}

    game.waiting_players.append(player)
    game.user_ids[pid] = user_id
    return {"player_id": pid, "game_id": game.id, "status": "waiting"}


@router.get("/")
def index():
    with open("static/index.html") as f:
        return HTMLResponse(f.read())


@router.get("/login.html")
def login_page():
    with open("static/login.html") as f:
        return HTMLResponse(f.read())


@router.get("/privacy.html")
def privacy_page():
    with open("static/privacy.html") as f:
        return HTMLResponse(f.read())


@router.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(
    ws: WebSocket,
    game_id: str,
    player_id: str,
    token: Optional[str] = Query(default=None),
):
    game = games.get(game_id.lower())
    if not game:
        await ws.close()
        return

    player = (
        next((p for p in game.players if p.id == player_id), None) or
        next((p for p in game.waiting_players if p.id == player_id), None)
    )
    if not player:
        await ws.close()
        return

    # Update user_id from WS token if not already set from join
    if token and game.user_ids.get(player_id) is None:
        game.user_ids[player_id] = await _resolve_user_from_token(token)

    await manager.connect(game_id, ws, player_id)
    player.connected = True

    if game.phase == GamePhase.WAITING and len(game.players) >= 2:
        _start_initial_roll(game)

    await manager.broadcast(game_id, game_state(game))

    try:
        async for raw in ws.iter_text():
            msg = json.loads(raw)
            action = msg.get("action")

            if action == "initial_roll":
                if game.phase != GamePhase.INITIAL_ROLL:
                    continue
                if player_id not in game.initial_rolls or game.initial_rolls[player_id] is not None:
                    continue
                game.initial_rolls[player_id] = random.randint(1, 6)
                if all(v is not None for v in game.initial_rolls.values()):
                    _finalize_order(game)
                await manager.broadcast(game_id, game_state(game))

            elif action == "roll":
                if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
                    continue
                if game.current_player().id != player_id:
                    continue
                t = player.turn
                if t.done or t.rolls_left <= 0:
                    continue
                is_starter = player_id == game.round_starter_id
                rolls_used = 3 - t.rolls_left
                if not is_starter and rolls_used >= game.max_throws_this_round:
                    continue
                for i in range(3):
                    if t.rolls_left == 3 or t.reroll[i]:
                        t.dice[i] = random.randint(1, 6)
                t.reroll = [False, False, False]
                t.rolls_left -= 1
                t.combo, t.rank, t.fiches = classify(t.dice)
                await manager.broadcast(game_id, game_state(game))

            elif action == "keep":
                if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
                    continue
                if game.current_player().id != player_id:
                    continue
                t = player.turn
                if t.rolls_left == 3 or t.done:
                    continue
                is_starter = player_id == game.round_starter_id
                rolls_used = 3 - t.rolls_left
                if not is_starter and rolls_used >= game.max_throws_this_round:
                    continue
                idx = msg.get("index")
                if idx is not None and 0 <= idx < 3:
                    t.reroll[idx] = not t.reroll[idx]
                await manager.broadcast(game_id, game_state(game))

            elif action == "done":
                if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
                    continue
                if game.current_player().id != player_id:
                    continue
                t = player.turn
                if t.rolls_left == 3:
                    continue
                t.done = True
                if player_id == game.round_starter_id:
                    game.max_throws_this_round = max(3 - t.rolls_left, 1)
                game.log.append(
                    f"{player.name}: {sorted(t.dice, reverse=True)} → {t.combo} ({t.fiches}f)"
                )
                game.advance()
                if game.all_done():
                    await _resolve_round(game)
                await manager.broadcast(game_id, game_state(game))

    except WebSocketDisconnect:
        player.connected = False
        manager.disconnect(game_id, ws)
        await manager.broadcast(game_id, game_state(game))

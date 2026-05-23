"""WebSocket game endpoints, connection manager, and AFK bot logic."""

import asyncio
import json
import logging
import random
import time
import uuid
from pathlib import Path
from typing import Optional

import sentry_sdk
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.db.models import User
from app.game.logic import (
    Game,
    GamePhase,
    Player,
    _finalize_order,
    _log,
    _resolve_round,
    _resolve_tiebreak,
    _start_initial_roll,
    classify,
    game_state,
)
from app.game.state import games

router = APIRouter()

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
_STATIC = Path(__file__).parent.parent.parent / "static"


async def _resolve_user_from_token(token: Optional[str]) -> Optional[str]:
    """Decode JWT from WS query param; returns user UUID string or None for guests."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


class ConnectionManager:
    """Tracks WebSocket connections for both players and spectators per game."""

    def __init__(self):
        self.connections: dict[str, list[tuple]] = {}
        self.spectators: dict[str, list[WebSocket]] = {}

    async def connect(self, game_id: str, ws: WebSocket, player_id: str):
        """Accept and register a player WebSocket; kick any prior socket for the same player_id."""
        await ws.accept()
        existing = self.connections.get(game_id, [])
        # C2: only one live WS per player_id — last connect wins (reconnect / dup-tab semantics)
        for old_ws, pid in existing:
            if pid == player_id:
                try:
                    await old_ws.close(code=4001)
                except Exception:
                    pass
        self.connections[game_id] = [(w, pid) for w, pid in existing if pid != player_id]
        self.connections[game_id].append((ws, player_id))

    async def connect_spectator(self, game_id: str, ws: WebSocket):
        """Accept and register a spectator WebSocket."""
        await ws.accept()
        self.spectators.setdefault(game_id, []).append(ws)

    def disconnect(self, game_id: str, ws: WebSocket):
        """Remove a player WebSocket from the connection list."""
        if game_id in self.connections:
            self.connections[game_id] = [(w, p) for w, p in self.connections[game_id] if w != ws]

    def disconnect_spectator(self, game_id: str, ws: WebSocket):
        """Remove a spectator WebSocket from the connection list."""
        if game_id in self.spectators:
            self.spectators[game_id] = [w for w in self.spectators[game_id] if w != ws]

    def spectator_count(self, game_id: str) -> int:
        """Return the number of active spectators for a game."""
        return len(self.spectators.get(game_id, []))

    async def broadcast(self, game_id: str, data: dict):
        """Send a JSON payload to all players and spectators in a game."""
        targets = list(self.connections.get(game_id, []))
        for ws, _ in targets:
            try:
                await ws.send_json(data)
            except Exception:
                pass
        for ws in list(self.spectators.get(game_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()

# E3: serialize concurrent joins per game so the max_players check + append is atomic
_join_locks: dict[str, asyncio.Lock] = {}


def _join_lock(game_id: str) -> asyncio.Lock:
    """Return (creating if needed) the per-game lock used to serialize joins."""
    lock = _join_locks.get(game_id)
    if lock is None:
        lock = asyncio.Lock()
        _join_locks[game_id] = lock
    return lock


# WebSocket message limits (H1)
_MAX_WS_MSG_BYTES = 1024


def _bot_take_turn(player: Player):
    """Roll all dice once and mark the turn done."""
    for i in range(3):
        player.turn.dice[i] = random.randint(1, 6)
    player.turn.combo, player.turn.rank, player.turn.fiches = classify(player.turn.dice)
    player.turn.reroll = [False, False, False]
    player.turn.rolls_left = 0
    player.turn.done = True


async def _afk_timer(game: Game, player_id: str, game_id: str):
    """Wait afk_seconds then auto-play for the player if they still haven't acted."""
    await asyncio.sleep(game.afk_seconds)
    player = next((p for p in game.players if p.id == player_id), None)
    if not player or player.turn is None or player.turn.done:
        return
    if game.current_player() and game.current_player().id != player_id:
        return
    # Surface the AFK takeover separately from the bot's actual play so the table
    # sees who stepped away before the throw appears in the log.
    _log(
        game,
        "log_afk_takeover",
        f"{player.name} est AFK — le bot prend la main.",
        name=player.name,
    )
    _bot_take_turn(player)
    t = player.turn
    dice_sorted = sorted(t.dice, reverse=True)
    _log(
        game,
        "log_afk_turn",
        f"{player.name} (AFK): {dice_sorted} → {t.combo} ({t.fiches}f)",
        name=player.name,
        dice=dice_sorted,
        combo=t.combo,
        fiches=t.fiches,
    )
    game.advance()
    if game.all_done():
        await _resolve_round(game)
    await manager.broadcast(game_id, game_state(game))
    _schedule_afk(game, game_id)


async def _afk_initial_timer(game: Game, player_id: str, game_id: str):
    """Roll an initial die for an AFK player; finalize order if last to roll."""
    await asyncio.sleep(game.afk_seconds)
    if game.phase != GamePhase.INITIAL_ROLL:
        return
    if game.initial_rolls.get(player_id) is not None:
        return
    player = next((p for p in game.players if p.id == player_id), None)
    if not player:
        return
    roll = random.randint(1, 6)
    game.initial_rolls[player_id] = roll
    _log(
        game,
        "log_afk_initial",
        f"{player.name} (AFK) lance {roll}",
        name=player.name,
        roll=roll,
    )
    if all(v is not None for v in game.initial_rolls.values()):
        _finalize_order(game)
    await manager.broadcast(game_id, game_state(game))
    _schedule_afk(game, game_id)


def _cancel_afk(game: Game, player_id: str):
    """Cancel any running AFK timer for the given player."""
    task = game.afk_tasks.pop(player_id, None)
    if task:
        task.cancel()


async def _afk_tiebreak_timer(game: Game, player_id: str, game_id: str):
    """Roll a tiebreak die for an AFK tied player; resolve if last to throw."""
    from app.game.logic import _resolve_tiebreak

    await asyncio.sleep(game.afk_seconds)
    if game.phase != GamePhase.TIEBREAK or not game.tiebreak:
        return
    if player_id != game.tiebreak.get("next_pid"):
        return
    player = next((p for p in game.players if p.id == player_id), None)
    if not player:
        return
    dice = [random.randint(1, 6) for _ in range(3)]
    combo, rank, fiches = classify(dice)
    game.tiebreak["throws"][player_id] = {
        "dice": dice,
        "combo": combo,
        "rank": rank,
        "fiches": fiches,
    }
    sorted_dice = sorted(dice, reverse=True)
    _log(
        game,
        "log_tiebreak_throw",
        f"{player.name} (AFK, départage) : {sorted_dice} → {combo} ({fiches}f)",
        name=player.name,
        dice=sorted_dice,
        combo=combo,
        fiches=fiches,
    )
    tied = game.tiebreak["tied_pids"]
    idx = tied.index(player_id) + 1
    if idx >= len(tied):
        game.tiebreak["next_pid"] = None
        await _resolve_tiebreak(game)
    else:
        game.tiebreak["next_pid"] = tied[idx]
    await manager.broadcast(game_id, game_state(game))
    _schedule_afk(game, game_id)


def _schedule_afk(game: Game, game_id: str):
    """Start AFK timers for the players who need to act in the current phase."""
    if not game.afk_bot:
        game.afk_started_at = None
        return
    if game.phase == GamePhase.INITIAL_ROLL:
        # Each player needs to roll once; one timer per pending player. Skip slots
        # that already have a live task (covers both first-roll and tie re-rolls).
        game.afk_started_at = None
        for p in game.players:
            if game.initial_rolls.get(p.id) is not None:
                continue
            existing = game.afk_tasks.get(p.id)
            if existing and not existing.done():
                continue
            task = asyncio.create_task(_afk_initial_timer(game, p.id, game_id))
            game.afk_tasks[p.id] = task
        return
    if game.phase == GamePhase.TIEBREAK and game.tiebreak:
        next_pid = game.tiebreak.get("next_pid")
        if not next_pid:
            game.afk_started_at = None
            return
        _cancel_afk(game, next_pid)
        task = asyncio.create_task(_afk_tiebreak_timer(game, next_pid, game_id))
        game.afk_tasks[next_pid] = task
        game.afk_started_at = int(time.time() * 1000)
        return
    if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
        game.afk_started_at = None
        return
    current = game.current_player()
    if not current:
        game.afk_started_at = None
        return
    _cancel_afk(game, current.id)
    task = asyncio.create_task(_afk_timer(game, current.id, game_id))
    game.afk_tasks[current.id] = task
    game.afk_started_at = int(time.time() * 1000)


@router.post("/api/create")
async def create_game(
    is_public: bool = False,
    max_players: int = 5,
    bank_rule: str = "free",
    afk_seconds: int = 45,
    afk_bot: bool = True,
    allow_spectators: bool = True,
    token: Optional[str] = Query(default=None),
):
    """Create a new game room and return its short ID."""
    if max_players < 2 or max_players > 5:
        max_players = 5
    if bank_rule not in ("sec", "free"):
        bank_rule = "free"
    if afk_seconds < 10 or afk_seconds > 300:
        afk_seconds = 45

    gid = str(uuid.uuid4())[:8].upper()
    games[gid] = Game(
        id=gid,
        is_public=is_public,
        max_players=max_players,
        bank_rule=bank_rule,
        afk_seconds=afk_seconds,
        afk_bot=afk_bot,
        allow_spectators=allow_spectators,
    )
    return {"game_id": gid}


@router.get("/api/join/{game_id}")
async def join_game(
    game_id: str,
    name: str,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Add a player to a room by name; returns player_id and join status."""
    gid = game_id.upper()
    game = games.get(gid)
    if not game:
        return {"error": "Game not found"}

    user_id = await _resolve_user_from_token(token)
    has_avatar = False
    if user_id:
        row = await db.execute(select(User.avatar_data).where(User.id == user_id))
        has_avatar = row.scalar_one_or_none() is not None

    # E3: serialize the capacity check + mutation so concurrent joins can't overshoot max_players
    async with _join_lock(gid):
        if game.phase in (GamePhase.WAITING, GamePhase.INITIAL_ROLL):
            if len(game.players) >= game.max_players:
                return {"error": "Game is full"}

        pid = str(uuid.uuid4())[:8]
        player = Player(id=pid, name=name)

        if game.phase in (GamePhase.WAITING, GamePhase.INITIAL_ROLL):
            game.players.append(player)
            game.user_ids[pid] = user_id
            game.has_avatars[pid] = has_avatar
            if game.phase == GamePhase.INITIAL_ROLL:
                game.initial_rolls[pid] = None
            if not game.host_player_id:
                game.host_player_id = pid
            return {"player_id": pid, "game_id": game.id, "status": "joined"}

        game.waiting_players.append(player)
        game.user_ids[pid] = user_id
        game.has_avatars[pid] = has_avatar
        return {"player_id": pid, "game_id": game.id, "status": "waiting"}


def _serve(filename: str) -> FileResponse:
    """Return a FileResponse for a static file; raises 500 if missing."""
    path = _STATIC / filename
    if not path.is_file():
        logger.error("Static file not found: %s (STATIC=%s)", path, _STATIC)
        from fastapi import HTTPException

        raise HTTPException(status_code=500, detail=f"Static file missing: {filename}")
    return FileResponse(path)


@router.get("/")
def index():
    """Serve the SPA shell for the root path."""
    return _serve("dist/index.html")


@router.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    """Serve static assets by exact path; fall back to SPA shell for all other routes."""
    candidate = _STATIC / "dist" / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return _serve("dist/index.html")


@router.websocket("/ws/{game_id}/spectate")
async def spectate_endpoint(
    ws: WebSocket,
    game_id: str,
    token: Optional[str] = Query(default=None),
):
    """WebSocket endpoint for read-only spectators; requires allow_spectators=True."""
    game = games.get(game_id.upper())
    if not game or not game.allow_spectators:
        await ws.close()
        return

    await manager.connect_spectator(game_id.upper(), ws)
    try:
        state = game_state(game)
        state["spectator_count"] = manager.spectator_count(game_id.upper())
        await ws.send_json(state)
        # Drain incoming messages (spectators cannot act)
        async for _ in ws.iter_text():
            pass
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Spectator WS error game=%s", game_id)
    finally:
        manager.disconnect_spectator(game_id.upper(), ws)


async def _dispatch(
    game: Game,
    game_id: str,
    ws: WebSocket,
    player: Player,
    player_id: str,
    action: Optional[str],
    msg: dict,
) -> Optional[str]:
    """Dispatch a single WS message to its action handler.

    Returns ``"break"`` to signal the caller to exit its receive loop (used by
    the ``leave`` action when the room dissolves). Any other return value means
    "keep listening". An exception here is caught by ``websocket_endpoint`` and
    logged without dropping the connection.
    """
    if action == "start":
        if game.phase != GamePhase.WAITING:
            return None
        if player_id != game.host_player_id:
            return None
        if len(game.players) < 2:
            return None
        _start_initial_roll(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "leave":
        _cancel_afk(game, player_id)

        # G18: persist this player's session stats if they were actively
        # playing AND they're a registered user. Snapshot the values FIRST
        # because the cleanup below pops them from the game dicts.
        if game.phase in (GamePhase.CHARGE, GamePhase.DECHARGE, GamePhase.TIEBREAK):
            leaver_user_id = game.user_ids.get(player_id)
            if leaver_user_id:
                from app.services.game_persistence import persist_player_session

                asyncio.create_task(
                    persist_player_session(
                        leaver_user_id, game.id, game.round_points.get(player_id, 0)
                    )
                )

        leaver_index = next((i for i, p in enumerate(game.players) if p.id == player_id), -1)
        game.players = [p for p in game.players if p.id != player_id]
        game.user_ids.pop(player_id, None)
        game.match_losses.pop(player_id, None)
        game.round_points.pop(player_id, None)
        game.has_avatars.pop(player_id, None)
        game.initial_rolls.pop(player_id, None)
        game.out_of_match.discard(player_id)

        _log(
            game,
            "log_player_left",
            f"← {player.name} a quitté la salle.",
            name=player.name,
        )

        if not game.players:
            games.pop(game_id.upper(), None)
            _join_locks.pop(game_id.upper(), None)
            await ws.close()
            return "break"
        if game.host_player_id == player_id and game.phase == GamePhase.WAITING:
            games.pop(game_id.upper(), None)
            _join_locks.pop(game_id.upper(), None)
            await manager.broadcast(game_id, game_state(game))
            await ws.close()
            return "break"

        if leaver_index >= 0 and leaver_index < game.current_index:
            game.current_index -= 1
        if game.current_index >= len(game.players):
            game.current_index = 0

        if game.round_starter_id == player_id and game.players:
            game.round_starter_id = game.players[game.current_index].id

        if game.host_player_id == player_id and game.players:
            longest = min(game.players, key=lambda p: p.joined_at)
            game.host_player_id = longest.id

        if game.all_done():
            await _resolve_round(game)
        else:
            _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        await ws.close()
        return "break"

    if action == "initial_roll":
        if game.phase != GamePhase.INITIAL_ROLL:
            return None
        if player_id not in game.initial_rolls or game.initial_rolls[player_id] is not None:
            return None
        _cancel_afk(game, player_id)
        game.initial_rolls[player_id] = random.randint(1, 6)
        if all(v is not None for v in game.initial_rolls.values()):
            _finalize_order(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "roll":
        if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
            return None
        if game.current_player() is None or game.current_player().id != player_id:
            return None
        t = player.turn
        if t is None or t.done or t.rolls_left <= 0:
            return None
        is_starter = player_id == game.round_starter_id
        rolls_used = 3 - t.rolls_left
        if game.phase == GamePhase.CHARGE and game.bank_rule == "sec":
            if rolls_used >= 1:
                return None
        elif not is_starter and rolls_used >= game.max_throws_this_round:
            return None
        _cancel_afk(game, player_id)
        # Click-to-keep semantics (Yahtzee): reroll[i]=True ⇒ die will be re-rolled.
        # Default after each roll is all-True; player clicks to lock individual dice.
        for i in range(3):
            if t.rolls_left == 3 or t.reroll[i]:
                t.dice[i] = random.randint(1, 6)
        t.reroll = [True, True, True]
        t.rolls_left -= 1
        t.combo, t.rank, t.fiches = classify(t.dice)

        # Auto-validate (G3) when the player has no remaining throws.
        is_at_max = (
            t.rolls_left <= 0
            or (game.phase == GamePhase.CHARGE and game.bank_rule == "sec")
            or (not is_starter and (3 - t.rolls_left) >= game.max_throws_this_round)
        )
        if is_at_max:
            t.done = True
            if (
                player_id == game.round_starter_id
                and game.phase == GamePhase.CHARGE
                and game.bank_rule == "sec"
            ):
                game.max_throws_this_round = 1
            sorted_dice = sorted(t.dice, reverse=True)
            _log(
                game,
                "log_turn",
                f"{player.name}: {sorted_dice} → {t.combo} ({t.fiches}f)",
                name=player.name,
                dice=sorted_dice,
                combo=t.combo,
                fiches=t.fiches,
            )
            game.advance()
            if game.all_done():
                await _resolve_round(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "keep":
        if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
            return None
        if game.current_player() is None or game.current_player().id != player_id:
            return None
        t = player.turn
        if t is None or t.rolls_left == 3 or t.done:
            return None
        is_starter = player_id == game.round_starter_id
        rolls_used = 3 - t.rolls_left
        if not is_starter and rolls_used >= game.max_throws_this_round:
            return None
        _cancel_afk(game, player_id)
        idx = msg.get("index")
        if idx is not None and 0 <= idx < 3:
            t.reroll[idx] = not t.reroll[idx]
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "done":
        if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
            return None
        if game.current_player() is None or game.current_player().id != player_id:
            return None
        t = player.turn
        if t is None or t.rolls_left == 3:
            return None
        _cancel_afk(game, player_id)
        t.done = True
        if player_id == game.round_starter_id:
            if game.phase == GamePhase.CHARGE and game.bank_rule == "sec":
                game.max_throws_this_round = 1
            else:
                game.max_throws_this_round = max(3 - t.rolls_left, 1)
        done_dice = sorted(t.dice, reverse=True)
        _log(
            game,
            "log_turn",
            f"{player.name}: {done_dice} → {t.combo} ({t.fiches}f)",
            name=player.name,
            dice=done_dice,
            combo=t.combo,
            fiches=t.fiches,
        )
        game.advance()
        if game.all_done():
            await _resolve_round(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "tiebreak_roll":
        if game.phase != GamePhase.TIEBREAK or not game.tiebreak:
            return None
        if player_id != game.tiebreak.get("next_pid"):
            return None
        _cancel_afk(game, player_id)
        dice = [random.randint(1, 6) for _ in range(3)]
        combo, rank, fiches = classify(dice)
        game.tiebreak["throws"][player_id] = {
            "dice": dice,
            "combo": combo,
            "rank": rank,
            "fiches": fiches,
        }
        sorted_dice = sorted(dice, reverse=True)
        _log(
            game,
            "log_tiebreak_throw",
            f"{player.name} (départage) : {sorted_dice} → {combo} ({fiches}f)",
            name=player.name,
            dice=sorted_dice,
            combo=combo,
            fiches=fiches,
        )
        tied = game.tiebreak["tied_pids"]
        idx = tied.index(player_id) + 1
        if idx >= len(tied):
            game.tiebreak["next_pid"] = None
            await _resolve_tiebreak(game)
        else:
            game.tiebreak["next_pid"] = tied[idx]
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "kick":
        # Host-only: free a seat by ejecting another player. Default reason is
        # "afk" (intended for bot-took-over situations); the host can pass any
        # short string (future use: chat-moderation, manual reasons).
        if player_id != game.host_player_id:
            return None
        target_id = msg.get("target_id")
        reason = msg.get("reason") or "afk"
        if not target_id or target_id == player_id:
            return None
        target = next((p for p in game.players if p.id == target_id), None)
        if not target:
            return None

        # Tell the target's socket what happened BEFORE closing it so the
        # client can render an explanatory modal.
        target_socks = [
            (w, pid)
            for (w, pid) in manager.connections.get(game_id.upper(), [])
            if pid == target_id
        ]
        for tws, _ in target_socks:
            try:
                await tws.send_json({"type": "kicked", "reason": reason})
            except Exception:
                pass

        _log(
            game,
            "log_player_kicked",
            f"{target.name} a été expulsé par l'hôte ({reason}).",
            name=target.name,
            host=player.name,
            reason=reason,
        )

        # Same cleanup as a voluntary leave — including the G18 stats persistence
        # snapshot when the kicked player was actively playing as a registered user.
        if game.phase in (GamePhase.CHARGE, GamePhase.DECHARGE, GamePhase.TIEBREAK):
            target_user_id = game.user_ids.get(target_id)
            if target_user_id:
                from app.services.game_persistence import persist_player_session

                asyncio.create_task(
                    persist_player_session(
                        target_user_id, game.id, game.round_points.get(target_id, 0)
                    )
                )

        _cancel_afk(game, target_id)
        leaver_index = next((i for i, p in enumerate(game.players) if p.id == target_id), -1)
        game.players = [p for p in game.players if p.id != target_id]
        game.user_ids.pop(target_id, None)
        game.match_losses.pop(target_id, None)
        game.round_points.pop(target_id, None)
        game.has_avatars.pop(target_id, None)
        game.initial_rolls.pop(target_id, None)
        game.out_of_match.discard(target_id)

        for tws, _ in target_socks:
            try:
                await tws.close(code=4002)
            except Exception:
                pass

        if not game.players:
            games.pop(game_id.upper(), None)
            _join_locks.pop(game_id.upper(), None)
            return None

        if leaver_index >= 0 and leaver_index < game.current_index:
            game.current_index -= 1
        if game.current_index >= len(game.players):
            game.current_index = 0
        if game.round_starter_id == target_id and game.players:
            game.round_starter_id = game.players[game.current_index].id

        if game.all_done():
            await _resolve_round(game)
        else:
            _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    return None


@router.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(
    ws: WebSocket,
    game_id: str,
    player_id: str,
    token: Optional[str] = Query(default=None),
):
    """Main player WebSocket: handles all game actions and broadcasts state changes."""
    game = games.get(game_id.upper())
    if not game:
        await ws.close()
        return

    player = next((p for p in game.players if p.id == player_id), None) or next(
        (p for p in game.waiting_players if p.id == player_id), None
    )
    if not player:
        await ws.close()
        return

    # C1: if this player_id was claimed by a logged-in user at join time, require
    # a matching JWT on the WS handshake. Guests (no registered user_id) stay open;
    # the WS token may upgrade a guest slot to authenticated on first connect.
    ws_user_id = await _resolve_user_from_token(token) if token else None
    registered_user_id = game.user_ids.get(player_id)
    if registered_user_id and registered_user_id != ws_user_id:
        await ws.close(code=4003)
        return
    if registered_user_id is None and ws_user_id is not None:
        game.user_ids[player_id] = ws_user_id

    await manager.connect(game_id, ws, player_id)
    player.connected = True
    await manager.broadcast(game_id, game_state(game))

    try:
        async for raw in ws.iter_text():
            # H1: cap message size
            if len(raw) > _MAX_WS_MSG_BYTES:
                try:
                    await ws.send_json({"error": "message_too_large"})
                except Exception:
                    pass
                continue
            # H2: handle malformed JSON without falling through to the catch-all
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                try:
                    await ws.send_json({"error": "invalid_json"})
                except Exception:
                    pass
                continue
            if not isinstance(msg, dict):
                continue
            action = msg.get("action")

            # Defensive guard: a bug in any single action handler should NOT
            # kill the WS connection (which would lock the player out of the
            # game until they reconnect). Log, notify the client, re-broadcast,
            # then keep listening. `_dispatch` returns "break" to exit the
            # loop (used by the leave handler when the room dissolves).
            try:
                result = await _dispatch(game, game_id, ws, player, player_id, action, msg)
            except Exception:
                logger.exception(
                    "Action %r failed (game=%s player=%s)",
                    action,
                    game_id,
                    player_id,
                )
                sentry_sdk.capture_exception()
                try:
                    await ws.send_json({"error": "action_failed", "action": action})
                except Exception:
                    pass
                try:
                    await manager.broadcast(game_id, game_state(game))
                except Exception:
                    pass
                continue
            if result == "break":
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error game=%s player=%s", game_id, player_id)
        sentry_sdk.capture_exception()
    finally:
        _cancel_afk(game, player_id)
        player.connected = False
        manager.disconnect(game_id, ws)
        await manager.broadcast(game_id, game_state(game))

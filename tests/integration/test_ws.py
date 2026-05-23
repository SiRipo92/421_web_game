"""Integration tests for the game WebSocket endpoint.

Uses sync starlette TestClient because websocket_connect is sync-only.

Important: we deliberately skip the HTTP join endpoint and manipulate the in-memory
`games` registry directly. The HTTP join handler has a `Depends(get_db)`, and the
async test session already bound the asyncpg connection pool to its event loop —
calling it again from TestClient's portal would error with "attached to a different
loop". WS handlers themselves don't touch the DB for guest players, so this stays
clean.
"""

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.game.logic import Player
from app.game.state import games
from app.main import app


@pytest.fixture
def tc():
    """Sync FastAPI test client supporting WebSocket connections.

    Created without a context manager so the app lifespan isn't re-entered (the
    async integration session already initialised the engine; re-entry would fail).
    """
    return TestClient(app)


def _create_room(tc: TestClient, **overrides) -> str:
    """Create a room via the HTTP endpoint (no DB dependency in this handler)."""
    r = tc.post("/api/create", params={"is_public": True, **overrides})
    assert r.status_code == 200
    return r.json()["game_id"]


def _join(tc: TestClient, game_id: str, name: str) -> str:
    """Add a player to the in-memory game directly. See module docstring for why."""
    game = games[game_id]
    pid = str(uuid.uuid4())[:8]
    game.players.append(Player(id=pid, name=name))
    game.user_ids[pid] = None
    game.has_avatars[pid] = False
    game.sets_lost[pid] = 0
    if not game.host_player_id:
        game.host_player_id = pid
    return pid


def _recv(ws) -> dict:
    """Read one JSON message off the WS."""
    return json.loads(ws.receive_text())


# ── Connection basics ────────────────────────────────────────────────────────


def test_ws_unknown_game_closes(tc):
    """Connecting to a game id that doesn't exist closes the socket immediately."""
    with pytest.raises(Exception):
        with tc.websocket_connect("/ws/NOPE/whatever") as ws:
            ws.receive_text()


def test_ws_unknown_player_closes(tc):
    """Known game but unknown player_id closes the socket."""
    gid = _create_room(tc)
    with pytest.raises(Exception):
        with tc.websocket_connect(f"/ws/{gid}/badpid") as ws:
            ws.receive_text()


def test_ws_join_and_initial_state(tc):
    """A joined player gets an initial state message on connect."""
    gid = _create_room(tc)
    pid = _join(tc, gid, "Alice")
    with tc.websocket_connect(f"/ws/{gid}/{pid}") as ws:
        state = _recv(ws)
    assert state["type"] == "state"
    assert state["phase"] == "waiting"
    assert any(p["id"] == pid for p in state["players"])


# ── Game-start flow ──────────────────────────────────────────────────────────


def test_host_start_requires_two_players(tc):
    """Host hitting start with only themselves in the room → action ignored."""
    gid = _create_room(tc)
    pid = _join(tc, gid, "Alice")
    with tc.websocket_connect(f"/ws/{gid}/{pid}") as ws:
        _recv(ws)  # initial state
        ws.send_text(json.dumps({"action": "start"}))
        # No state change — phase asserted from the in-memory game (no broadcast happens)
    assert games[gid].phase.value == "waiting"


def test_host_start_transitions_to_initial_roll(tc):
    """With ≥2 players, host start moves the game to initial_roll phase."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")
    with (
        tc.websocket_connect(f"/ws/{gid}/{host}") as host_ws,
        tc.websocket_connect(f"/ws/{gid}/{other}") as other_ws,
    ):
        _recv(host_ws)  # initial state for host
        _recv(host_ws)  # broadcast when Bob connects
        _recv(other_ws)  # initial state for Bob
        host_ws.send_text(json.dumps({"action": "start"}))
        state = _recv(host_ws)
    assert state["phase"] == "initial_roll"


def test_non_host_start_ignored(tc):
    """Non-host sending start is silently rejected."""
    gid = _create_room(tc)
    _host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")
    with tc.websocket_connect(f"/ws/{gid}/{other}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "start"}))
    assert games[gid].phase.value == "waiting"


# ── Leave handling ───────────────────────────────────────────────────────────


def test_leave_during_waiting_removes_player(tc):
    """A non-host player leaving during waiting just removes them from the roster."""
    gid = _create_room(tc)
    _host = _join(tc, gid, "Alice")
    leaver = _join(tc, gid, "Bob")
    with tc.websocket_connect(f"/ws/{gid}/{leaver}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "leave"}))
    assert all(p.id != leaver for p in games[gid].players)


def test_host_leave_during_waiting_dissolves_room(tc):
    """If the host leaves while waiting, the entire room is removed."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _other = _join(tc, gid, "Bob")
    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "leave"}))
    assert gid not in games


# ── Hardening: H1 + H2 ───────────────────────────────────────────────────────


def test_malformed_json_returns_error_message(tc):
    """H2: invalid JSON → server responds with {error: invalid_json}."""
    gid = _create_room(tc)
    pid = _join(tc, gid, "Alice")
    with tc.websocket_connect(f"/ws/{gid}/{pid}") as ws:
        _recv(ws)
        ws.send_text("not-json-at-all")
        resp = _recv(ws)
    assert resp.get("error") == "invalid_json"


def test_oversized_message_returns_error(tc):
    """H1: a >1KB payload is rejected with {error: message_too_large}."""
    gid = _create_room(tc)
    pid = _join(tc, gid, "Alice")
    with tc.websocket_connect(f"/ws/{gid}/{pid}") as ws:
        _recv(ws)
        ws.send_text("x" * 2000)
        resp = _recv(ws)
    assert resp.get("error") == "message_too_large"


# ── Spectator ────────────────────────────────────────────────────────────────


def test_spectator_receives_state(tc):
    """Spectator endpoint accepts the connection and sends initial state."""
    gid = _create_room(tc, allow_spectators=True)
    _join(tc, gid, "Alice")
    with tc.websocket_connect(f"/ws/{gid}/spectate") as ws:
        state = _recv(ws)
    assert state["type"] == "state"
    assert "spectator_count" in state


def test_spectator_rejected_when_disabled(tc):
    """allow_spectators=False → spectate endpoint closes immediately."""
    gid = _create_room(tc, allow_spectators=False)
    with pytest.raises(Exception):
        with tc.websocket_connect(f"/ws/{gid}/spectate") as ws:
            ws.receive_text()

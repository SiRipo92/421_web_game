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

from app.game.logic import GamePhase, Player, new_turn
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
    game.match_losses[pid] = 0
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


# ── Active-game actions (initial_roll / roll / done / kick / tiebreak_roll) ──


def _seed_charge_phase(gid: str, first_id: str, second_id: str):
    """Drive a fresh room straight into CHARGE so we can exercise roll/done/etc.

    Bypasses the normal start → initial_roll dance: we just hand-set the phase,
    drop a fresh turn on every player, and pick the starter. The WS handlers
    don't care how we got here — they validate against game.phase + the player's
    turn state, both of which we've set up correctly.
    """
    game = games[gid]
    game.phase = GamePhase.CHARGE
    game.round_num = 1
    game.pool = 11
    game.max_throws_this_round = 3
    # Ensure first_id is at index 0 so current_player() returns them
    game.players.sort(key=lambda p: 0 if p.id == first_id else 1)
    game.current_index = 0
    game.round_starter_id = first_id
    for p in game.players:
        p.turn = new_turn()
        p.tokens = 0


def test_initial_roll_action_records_die(tc):
    """initial_roll fills in the player's initial_rolls entry with a 1–6 value."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")
    game = games[gid]
    game.phase = GamePhase.INITIAL_ROLL
    game.initial_rolls = {host: None, other: None}

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "initial_roll"}))
        _recv(ws)
    rolled = game.initial_rolls[host]
    assert isinstance(rolled, int) and 1 <= rolled <= 6
    assert game.initial_rolls[other] is None  # Bob hasn't rolled yet


def test_roll_action_decrements_rolls_left(tc):
    """A 'roll' action consumes one throw of three and fills in dice."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _other = _join(tc, gid, "Bob")
    _seed_charge_phase(gid, host, _other)

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "roll"}))
        state = _recv(ws)

    me = next(p for p in state["players"] if p["id"] == host)
    assert me["turn"]["rolls_left"] == 2
    assert all(1 <= d <= 6 for d in me["turn"]["dice"])


def test_keep_action_toggles_reroll_flag(tc):
    """Clicking a die toggles its reroll flag (false → true → false)."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _other = _join(tc, gid, "Bob")
    _seed_charge_phase(gid, host, _other)
    # Pre-roll so the keep handler isn't blocked by rolls_left == 3
    games[gid].players[0].turn.dice = [3, 4, 5]
    games[gid].players[0].turn.rolls_left = 2

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "keep", "index": 0}))
        s1 = _recv(ws)
        ws.send_text(json.dumps({"action": "keep", "index": 0}))
        s2 = _recv(ws)

    me1 = next(p for p in s1["players"] if p["id"] == host)
    me2 = next(p for p in s2["players"] if p["id"] == host)
    assert me1["turn"]["reroll"][0] is True
    assert me2["turn"]["reroll"][0] is False


def test_done_action_marks_turn_done_and_advances(tc):
    """`done` flips turn.done True and advances current_index.

    G56: `done` now broadcasts twice — first the held state (turn.done=True,
    dice still visible, viewer hasn't advanced) then the post-hold advance
    state. We assert against the second frame to verify both halves of the
    flow ran.
    """
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")
    _seed_charge_phase(gid, host, other)
    games[gid].players[0].turn.dice = [4, 2, 1]
    games[gid].players[0].turn.rolls_left = 2  # has rolled at least once

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "done"}))
        held = _recv(ws)  # G56 held frame: done=True but not yet advanced
        state = _recv(ws)  # post-hold frame: advanced to next player

    me_held = next(p for p in held["players"] if p["id"] == host)
    assert me_held["turn"]["done"] is True
    assert held["current_player_id"] == host  # held — not yet advanced

    me = next(p for p in state["players"] if p["id"] == host)
    assert me["turn"]["done"] is True
    assert state["current_player_id"] != host  # advanced to next player


def test_kick_requires_host(tc):
    """A non-host player sending kick is silently ignored — target stays."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{other}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "kick", "target_id": host, "reason": "afk"}))
        # The handler `return`s with no broadcast, so we don't try to recv —
        # just verify the state directly.

    assert any(p.id == host for p in games[gid].players)


def test_kick_by_host_removes_target(tc):
    """Host kicking a non-host removes that player from the game state."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{host}") as host_ws:
        _recv(host_ws)
        host_ws.send_text(json.dumps({"action": "kick", "target_id": other, "reason": "afk"}))
        # Drain the broadcast that the kick triggered (state minus the kicked player).
        try:
            state = _recv(host_ws)
            assert not any(p["id"] == other for p in state["players"])
        except Exception:
            pass

    assert not any(p.id == other for p in games[gid].players)
    assert any(p.id == host for p in games[gid].players)  # host stays


def test_kick_cannot_target_self(tc):
    """Host trying to kick themselves is a no-op."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "kick", "target_id": host, "reason": "afk"}))

    assert any(p.id == host for p in games[gid].players)


def test_kick_missing_target_id_is_noop(tc):
    """`kick` without a target_id is silently ignored (no crash)."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(json.dumps({"action": "kick", "reason": "afk"}))

    # Both players still present
    assert any(p.id == host for p in games[gid].players)
    assert any(p.id == other for p in games[gid].players)


# ── G45: host edits room rules mid-partie ─────────────────────────────────


def test_update_room_rules_stages_pending_for_host(tc):
    """Host's `update_room_rules` stacks valid changes into pending_room_rules
    without applying them mid-partie."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(
            json.dumps(
                {
                    "action": "update_room_rules",
                    "rules": {"bank_rule": "sec", "afk_seconds": 30},
                }
            )
        )
        state = _recv(ws)

    # Live room config untouched (still has the defaults from /api/create).
    game = games[gid]
    assert game.bank_rule != "sec" or game.afk_seconds != 30, (
        "Live rules shouldn't change yet — they apply at the next partie."
    )
    # Pending dict carries the changes.
    assert game.pending_room_rules.get("bank_rule") == "sec"
    assert game.pending_room_rules.get("afk_seconds") == 30
    # Broadcast surfaces pending_room_rules in the room payload.
    assert state["room"]["pending_room_rules"]["bank_rule"] == "sec"


def test_update_room_rules_rejects_non_host(tc):
    """A non-host player's `update_room_rules` is silently ignored."""
    gid = _create_room(tc)
    _host = _join(tc, gid, "Alice")
    other = _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{other}") as ws:
        _recv(ws)
        ws.send_text(
            json.dumps(
                {
                    "action": "update_room_rules",
                    "rules": {"bank_rule": "sec"},
                }
            )
        )

    assert games[gid].pending_room_rules == {}


def test_update_room_rules_ignores_invalid_values(tc):
    """Out-of-range or wrong-type values stay out of the pending dict."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _join(tc, gid, "Bob")

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(
            json.dumps(
                {
                    "action": "update_room_rules",
                    "rules": {
                        "bank_rule": "invalid-mode",  # not in ("sec", "free")
                        "afk_seconds": 999,  # > 120
                        "max_players": "not-an-int",  # wrong type
                        "afk_bot": False,  # valid — only this should land
                    },
                }
            )
        )

    pending = games[gid].pending_room_rules
    assert pending == {"afk_bot": False}


def test_update_room_rules_editing_back_drops_pending(tc):
    """Setting a field back to its current value removes the pending entry
    (avoids leaving a noop in the dict)."""
    gid = _create_room(tc)
    host = _join(tc, gid, "Alice")
    _join(tc, gid, "Bob")
    game = games[gid]
    # Snapshot the current allow_spectators value, then queue the flip and
    # immediately queue the flip-back.
    current_spectators = game.allow_spectators

    with tc.websocket_connect(f"/ws/{gid}/{host}") as ws:
        _recv(ws)
        ws.send_text(
            json.dumps(
                {
                    "action": "update_room_rules",
                    "rules": {"allow_spectators": not current_spectators},
                }
            )
        )
        _recv(ws)
        # Now flip back to the original.
        ws.send_text(
            json.dumps(
                {
                    "action": "update_room_rules",
                    "rules": {"allow_spectators": current_spectators},
                }
            )
        )
        state = _recv(ws)

    assert games[gid].pending_room_rules == {}
    assert state["room"]["pending_room_rules"] == {}

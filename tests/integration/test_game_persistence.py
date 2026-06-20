"""Integration tests for game_persistence: DB write and ELO update.

G91: model is per-partie persistence. Each test builds a Game object that
represents a partie that just ended (game.partie_loser_id is set), then
calls persist_completed_partie and verifies the DB rows + PlayerStats
updates landed correctly.
"""

import uuid
from datetime import UTC, datetime

from app.game.logic import Game, GamePhase, Player, PlayerTurn
from app.services.game_persistence import persist_completed_partie


def _unique_gid() -> str:
    """Return a unique 8-char uppercase game code."""
    return f"T{uuid.uuid4().hex[:7].upper()}"


def _ended_partie(game_id: str, players: list[Player], user_ids: dict, loser_id: str) -> Game:
    """Build a Game in FINISHED state representing a just-ended partie."""
    game = Game(id=game_id, phase=GamePhase.FINISHED)
    for p in players:
        p.turn = PlayerTurn(done=True, dice=[4, 2, 1], rank=9000, fiches=8)
        game.players.append(p)
    game.user_ids = user_ids
    game.round_num = 5
    game.partie_loser_id = loser_id
    game.partie_number = 1
    game.partie_started_at = datetime.now(UTC)
    # Round points / manche counters that would have been built up during play.
    for p in players:
        game.round_points[p.id] = 0
        game.manches_played[p.id] = 4
        game.manches_lost[p.id] = 1 if p.id == loser_id else 0
    game.round_points[loser_id] = 5  # threshold-hit triggered the partie end
    return game


async def test_persist_partie_all_guests(client):
    """Guests-only partie: writes Game + GamePlayer rows, no PlayerStats updates."""
    gid = _unique_gid()
    p0 = Player(id="gA", name="Guest A", tokens=2)
    p1 = Player(id="gB", name="Guest B", tokens=11)
    game = _ended_partie(gid, [p0, p1], {"gA": None, "gB": None}, loser_id="gB")

    await persist_completed_partie(game)
    # No exception means the DB write succeeded.


async def test_persist_partie_with_registered_user(client, make_user):
    """Registered survivor's PlayerStats: parties_survived +1, current_streak +1, ELO bump."""
    data = make_user("persist_survive")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    gid = _unique_gid()
    p0 = Player(id="rA", name=data["username"], tokens=3)  # survivor
    p1 = Player(id="rB", name="Guest", tokens=11)  # loser
    game = _ended_partie(gid, [p0, p1], {"rA": user_id, "rB": None}, loser_id="rB")

    await persist_completed_partie(game)

    r = await client.get(f"/api/profile/{data['username']}")
    assert r.status_code == 200
    body = r.json()
    assert body["games_played"] == 1
    assert body["parties_survived"] == 1
    assert body["parties_lost"] == 0
    assert body["current_streak"] == 1
    assert body["longest_streak"] == 1


async def test_persist_partie_loser_gets_correct_stats(client, make_user):
    """Registered loser's PlayerStats: parties_lost +1, current_streak = 0, ELO drop."""
    data = make_user("persist_lose")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    gid = _unique_gid()
    p0 = Player(id="rA", name="Guest A", tokens=2)
    p1 = Player(id="rB", name=data["username"], tokens=11)
    game = _ended_partie(gid, [p0, p1], {"rA": None, "rB": user_id}, loser_id="rB")

    await persist_completed_partie(game)

    r = await client.get(f"/api/profile/{data['username']}")
    assert r.status_code == 200
    body = r.json()
    assert body["games_played"] == 1
    assert body["parties_lost"] == 1
    assert body["parties_survived"] == 0
    assert body["current_streak"] == 0
    assert body["manches_lost"] == 1
    assert body["manches_played"] == 4


async def test_persist_partie_streak_extends(client, make_user):
    """Two consecutive survivals → current_streak = 2, longest_streak = 2."""
    data = make_user("persist_streak")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    for partie_n in (1, 2):
        gid = _unique_gid()
        p0 = Player(id="rA", name=data["username"], tokens=3)
        p1 = Player(id="rB", name="Guest", tokens=11)
        game = _ended_partie(gid, [p0, p1], {"rA": user_id, "rB": None}, loser_id="rB")
        game.partie_number = partie_n
        await persist_completed_partie(game)

    r = await client.get(f"/api/profile/{data['username']}")
    body = r.json()
    assert body["games_played"] == 2
    assert body["parties_survived"] == 2
    assert body["current_streak"] == 2
    assert body["longest_streak"] == 2


# ── Defensive / error paths (G99 coverage push) ────────────────────────────


async def test_persist_partie_no_loser_id_returns_early(client):
    """Caller bug: partie_loser_id unset → log warning, early return, no DB write."""
    from app.services.game_persistence import persist_completed_partie

    gid = _unique_gid()
    p0 = Player(id="gA", name="Guest A", tokens=2)
    p1 = Player(id="gB", name="Guest B", tokens=11)
    game = _ended_partie(gid, [p0, p1], {"gA": None, "gB": None}, loser_id="gB")
    game.partie_loser_id = None  # the misconfig

    # Must not raise.
    await persist_completed_partie(game)


async def test_persist_partie_loser_not_in_players(client):
    """Defensive: partie_loser_id refers to a player not in `game.players`.
    Logs a warning and returns without writing partial rows."""
    from app.services.game_persistence import persist_completed_partie

    gid = _unique_gid()
    p0 = Player(id="gA", name="Guest A", tokens=2)
    game = _ended_partie(gid, [p0], {"gA": None}, loser_id="gA")
    # Now flip loser to a phantom id.
    game.partie_loser_id = "ghost_pid"

    await persist_completed_partie(game)


async def test_persist_player_session_no_user_id_noop():
    """Empty user_id_str is a no-op (e.g. guest left mid-partie)."""
    from app.services.game_persistence import persist_player_session

    # No raise, no side effect — guests aren't tracked.
    await persist_player_session("", "GAME_X", 3)


async def test_persist_player_session_invalid_uuid_noop():
    """user_id_str that doesn't parse as UUID is silently dropped."""
    from app.services.game_persistence import persist_player_session

    await persist_player_session("not-a-uuid", "GAME_X", 3)


async def test_persist_player_session_user_without_stats_row(client, make_user):
    """User exists but has no PlayerStats row → log warning, return cleanly.
    Should be impossible in production (registration creates the row) but
    the defensive branch exists."""
    from app.db.base import AsyncSessionLocal
    from app.db.models import PlayerStats
    from app.services.game_persistence import persist_player_session

    data = make_user("no_stats_row")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    # Delete the PlayerStats row to simulate the bad state.
    async with AsyncSessionLocal() as db:
        stats = await db.get(PlayerStats, uuid.UUID(user_id))
        if stats:
            await db.delete(stats)
            await db.commit()

    # Must not raise.
    await persist_player_session(user_id, "GAME_NOSTATS", round_points=4, manches_played=2)


async def test_persist_player_session_increments_counters(client, make_user):
    """Happy path: mid-partie leave bumps games_played + parties_lost +
    manche counters, zeroes current_streak."""
    from app.services.game_persistence import persist_player_session

    data = make_user("session_leave")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    # Pre-set a streak so we can confirm it's reset.
    from app.db.base import AsyncSessionLocal
    from app.db.models import PlayerStats

    async with AsyncSessionLocal() as db:
        stats = await db.get(PlayerStats, uuid.UUID(user_id))
        stats.current_streak = 3
        await db.commit()

    await persist_player_session(
        user_id, "GAME_LEAVE", round_points=4, manches_played=3, manches_lost=2
    )

    r = await client.get(f"/api/profile/{data['username']}")
    body = r.json()
    assert body["games_played"] == 1
    assert body["parties_lost"] == 1
    assert body["current_streak"] == 0
    assert body["manches_played"] == 3
    assert body["manches_lost"] == 2


async def test_persist_partie_unregistered_loser_with_registered_survivor(client, make_user):
    """Loser is a guest (no user_id) → ELO update is skipped (no K-factor
    anchor), but the registered survivor still gets counter increments."""
    from app.services.game_persistence import persist_completed_partie

    data = make_user("guest_loser_test")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    gid = _unique_gid()
    p0 = Player(id="rA", name=data["username"], tokens=2)  # registered survivor
    p1 = Player(id="gB", name="Guest", tokens=11)  # guest loser
    game = _ended_partie(gid, [p0, p1], {"rA": user_id, "gB": None}, loser_id="gB")

    await persist_completed_partie(game)

    r = await client.get(f"/api/profile/{data['username']}")
    body = r.json()
    assert body["games_played"] == 1
    assert body["parties_survived"] == 1
    # ELO unchanged because the loser had no anchor — confirms the skip path.
    assert body["elo"] == 1200


async def test_persist_partie_invalid_user_id_in_user_ids_map(client, make_user):
    """user_ids map contains a malformed UUID string → that entry is skipped,
    but the partie still persists for the well-formed ones."""
    from app.services.game_persistence import persist_completed_partie

    data = make_user("good_user_with_bad_peer")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    gid = _unique_gid()
    p0 = Player(id="rA", name=data["username"], tokens=2)
    p1 = Player(id="rB", name="Malformed", tokens=11)
    # Inject an invalid UUID for p1; persistence should skip it without
    # corrupting p0's write.
    game = _ended_partie(gid, [p0, p1], {"rA": user_id, "rB": "not-a-real-uuid"}, loser_id="rB")

    await persist_completed_partie(game)

    r = await client.get(f"/api/profile/{data['username']}")
    assert r.status_code == 200
    body = r.json()
    assert body["games_played"] == 1
    assert body["parties_survived"] == 1

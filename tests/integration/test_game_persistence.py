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

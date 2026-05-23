"""Integration tests for game_persistence: DB write and ELO update."""

import uuid

from app.game.logic import Game, GamePhase, Player, PlayerTurn
from app.services.game_persistence import persist_completed_game


def _unique_gid() -> str:
    """Return a unique 8-char uppercase game code to avoid unique-constraint collisions."""
    return f"T{uuid.uuid4().hex[:7].upper()}"


def _finished_game(game_id: str, players: list[Player], user_ids: dict) -> Game:
    """Return a Game object already in FINISHED state for persistence testing."""
    game = Game(id=game_id, phase=GamePhase.FINISHED)
    for p in players:
        p.turn = PlayerTurn(done=True, dice=[4, 2, 1], rank=9000, fiches=8)
        game.players.append(p)
        game.match_losses[p.id] = 0
    game.user_ids = user_ids
    game.round_num = 5
    return game


async def test_persist_game_all_guests(client):
    """persist_completed_game handles a game with no registered players."""
    gid = _unique_gid()
    p0 = Player(id="gA", name="Guest A", tokens=0)
    p1 = Player(id="gB", name="Guest B", tokens=11)
    game = _finished_game(gid, [p0, p1], {"gA": None, "gB": None})
    game.match_losses["gB"] = 2

    await persist_completed_game(game)

    from app.game.state import games

    assert gid not in games


async def test_persist_game_with_registered_user(client, make_user):
    """persist_completed_game updates ELO for registered players."""
    data = make_user("persist")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    gid = _unique_gid()
    p0 = Player(id="rA", name=data["username"], tokens=0)
    p1 = Player(id="rB", name="Guest", tokens=11)
    game = _finished_game(gid, [p0, p1], {"rA": user_id, "rB": None})
    game.match_losses["rB"] = 2

    await persist_completed_game(game)

    from app.game.state import games

    assert gid not in games

    r = await client.get(f"/api/profile/{data['username']}")
    assert r.status_code == 200
    assert r.json()["games_played"] >= 1

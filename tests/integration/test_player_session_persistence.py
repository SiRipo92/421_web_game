"""Integration tests for G18 — `persist_player_session` bumps PlayerStats.

The function is called from the WS leave/kick handlers when a registered user
steps out of an active game. We test it directly here because driving the
full leave flow through the WS test client + verifying the eventual DB write
adds a lot of moving parts; the function itself is the contract.
"""

from app.services.game_persistence import persist_player_session


async def test_persist_player_session_bumps_games_and_losses(client, make_user):
    """A leaver with round_points > 0 bumps games_played by 1 and losses by N."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    # Snapshot initial stats
    r_before = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    before = r_before.json()["stats"]
    assert before["games_played"] == 0
    assert before["losses"] == 0

    # User leaves a game where they took 2 round points
    await persist_player_session(user_id, "TESTGAME", 2)

    r_after = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    after = r_after.json()["stats"]
    assert after["games_played"] == 1
    assert after["losses"] == 2  # round_points attributed to losses
    assert after["wins"] == 0


async def test_persist_player_session_zero_points_counts_as_win(client, make_user):
    """A leaver with round_points == 0 bumps games_played and wins (no losses)."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    await persist_player_session(user_id, "TESTGAME", 0)

    r = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    stats = r.json()["stats"]
    assert stats["games_played"] == 1
    assert stats["wins"] == 1
    assert stats["losses"] == 0


async def test_persist_player_session_accumulates_across_calls(client, make_user):
    """Multiple session-persists accumulate cleanly on the same PlayerStats row."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    await persist_player_session(user_id, "GAME-A", 1)  # +1 loss
    await persist_player_session(user_id, "GAME-B", 0)  # +1 win
    await persist_player_session(user_id, "GAME-C", 3)  # +3 losses

    r = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    stats = r.json()["stats"]
    assert stats["games_played"] == 3
    assert stats["wins"] == 1
    assert stats["losses"] == 4


async def test_persist_player_session_unknown_user_is_noop():
    """Calling with a non-existent user UUID logs + returns without crashing."""
    # No assertion needed — just shouldn't raise.
    await persist_player_session("00000000-0000-0000-0000-000000000000", "TEST", 1)


async def test_persist_player_session_invalid_uuid_is_noop():
    """Garbage user_id string is treated as no-op (uuid parse fails)."""
    await persist_player_session("not-a-uuid", "TEST", 1)


async def test_persist_player_session_empty_user_id_is_noop():
    """Empty / None user_id (guest) does nothing — guests don't have PlayerStats."""
    await persist_player_session("", "TEST", 1)
    await persist_player_session(None, "TEST", 1)  # type: ignore[arg-type]

"""Integration tests for `persist_player_session` (mid-partie leave).

G91 semantics: leaving mid-partie is treated as a concession.
- parties_played += 1
- parties_lost += 1
- current_streak = 0
- ELO loses (small, against an avg-1200 phantom field)
- Manche counters NOT updated (the partie didn't end naturally for them)

The function is called from the WS leave/kick handlers when a registered
user steps out of an active partie. We test it directly here because
driving the full leave flow through the WS test client + verifying the
eventual DB write adds a lot of moving parts; the function itself is the
contract.
"""

from app.services.game_persistence import persist_player_session


async def test_persist_player_session_increments_parties_lost(client, make_user):
    """A leaver bumps games_played and parties_lost (concession)."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    r_before = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    before = r_before.json()["stats"]
    assert before["games_played"] == 0
    assert before["parties_lost"] == 0

    await persist_player_session(user_id, "TESTGAME", round_points=2)

    r_after = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    after = r_after.json()["stats"]
    assert after["games_played"] == 1
    assert after["parties_lost"] == 1
    assert after["parties_survived"] == 0
    assert after["current_streak"] == 0


async def test_persist_player_session_resets_streak(client, make_user):
    """A leaver who had a current_streak loses it (streak resets to 0)."""
    from sqlalchemy import select

    from app.db.base import AsyncSessionLocal
    from app.db.models import PlayerStats

    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    # Seed a current_streak directly (simulating prior survivals)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(PlayerStats).where(PlayerStats.user_id == user_id))
        stats = result.scalar_one()
        stats.current_streak = 3
        stats.longest_streak = 3
        await db.commit()

    await persist_player_session(user_id, "TESTGAME", round_points=1)

    r = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    after = r.json()["stats"]
    assert after["current_streak"] == 0
    # longest_streak should be preserved even after a streak break
    assert after["longest_streak"] == 3


async def test_persist_player_session_accumulates_across_calls(client, make_user):
    """Multiple session-persists accumulate cleanly on the same PlayerStats row."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    await persist_player_session(user_id, "GAME-A", 1)
    await persist_player_session(user_id, "GAME-B", 0)
    await persist_player_session(user_id, "GAME-C", 3)

    r = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    stats = r.json()["stats"]
    assert stats["games_played"] == 3
    assert stats["parties_lost"] == 3
    assert stats["parties_survived"] == 0


async def test_persist_player_session_unknown_user_is_noop():
    """Calling with a non-existent user UUID logs + returns without crashing."""
    await persist_player_session("00000000-0000-0000-0000-000000000000", "TEST", 1)


async def test_persist_player_session_invalid_uuid_is_noop():
    """Garbage user_id string is treated as no-op (uuid parse fails)."""
    await persist_player_session("not-a-uuid", "TEST", 1)


async def test_persist_player_session_empty_user_id_is_noop():
    """Empty / None user_id (guest) does nothing — guests don't have PlayerStats."""
    await persist_player_session("", "TEST", 1)
    await persist_player_session(None, "TEST", 1)  # type: ignore[arg-type]

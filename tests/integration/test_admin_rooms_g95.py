"""Integration tests for G95 admin room moderation endpoints.

Strategy: create a `Game` in-memory directly (bypassing the WS lifecycle
that would normally bring one into existence) so we can test the admin
endpoints in isolation. Mock the WS manager's `broadcast` so we don't
need real WebSocket sockets to assert broadcast happens.

Covers:
  GET    /api/admin/rooms                  list + sort
  GET    /api/admin/rooms/{game_id}        detail + 404
  POST   /api/admin/rooms/{id}/broadcast   delivers + audit
  POST   /api/admin/rooms/{id}/kick        removes player + chat-bans + audit
  POST   /api/admin/rooms/{id}/dissolve    persists stats + dissolves + audit
  Auth   moderator vs admin gating
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, update

from app.db.base import AsyncSessionLocal
from app.db.models import GdprAuditLog, User
from app.game.logic import Game, GamePhase, Player
from app.game.state import games

# ---------------- helpers (mirrored from test_admin_dashboard_g90) ----------------


async def _promote(user_id: str, role: str) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(user_id)).values(role=role))
        await db.commit()


async def _make_admin(client, make_user, prefix: str = "adm") -> tuple[dict, str, str]:
    data = make_user(prefix)
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    uid = me.json()["id"]
    await _promote(uid, "admin")
    return data, token, uid


def _make_room(game_id: str = "TESTROOM", phase: GamePhase = GamePhase.CHARGE) -> Game:
    """Build a 2-player in-memory Game and stash it in the registry.

    Caller is responsible for cleanup (or the test cleans up by hitting
    the dissolve endpoint).
    """
    p1 = Player(id="p1", name="Alice", tokens=5)
    p2 = Player(id="p2", name="Bob", tokens=6)
    game = Game(id=game_id, phase=phase)
    game.players = [p1, p2]
    game.host_player_id = "p1"
    game.is_public = True
    game.max_players = 5
    game.round_points = {"p1": 1, "p2": 2}
    game.match_losses = {"p1": 0, "p2": 0}
    game.manches_played = {"p1": 3, "p2": 3}
    game.manches_lost = {"p1": 1, "p2": 2}
    games[game_id] = game
    return game


@pytest.fixture(autouse=True)
def _clean_games_registry():
    """Tests in this file create rooms in the in-memory `games` dict.
    Snapshot the dict before each test and restore after — so cross-test
    pollution can't accumulate stale rooms."""
    snapshot = dict(games)
    yield
    games.clear()
    games.update(snapshot)


# ---------------- auth gates ----------------


async def test_list_rooms_requires_moderator(client, make_user):
    """Plain player gets 403."""
    data = make_user("plain")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get("/api/admin/rooms", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_dissolve_requires_admin(client, make_user):
    """Moderators can list/broadcast/kick but NOT dissolve."""
    mod_data = make_user("mod_dis")
    mod_reg = await client.post("/auth/register", json=mod_data)
    mod_token = mod_reg.json()["access_token"]
    mod_uid = (
        await client.get("/auth/me", headers={"Authorization": f"Bearer {mod_token}"})
    ).json()["id"]
    await _promote(mod_uid, "moderator")

    _make_room("MODROOM")
    r = await client.post(
        "/api/admin/rooms/MODROOM/dissolve",
        json={"confirm_game_id": "MODROOM", "reason": "test"},
        headers={"Authorization": f"Bearer {mod_token}"},
    )
    assert r.status_code == 403


# ---------------- list ----------------


async def test_list_rooms_returns_sorted_shape(client, make_user):
    """Sort: more players first, then partie_number desc."""
    _, admin_token, _ = await _make_admin(client, make_user, "lroom_adm")
    g1 = _make_room("ROOMSML")
    g1.players = [Player(id="p1", name="A")]
    _make_room("ROOMBIG")
    # ROOMBIG: 2 players, ROOMSML: 1 player → ROOMBIG first

    r = await client.get("/api/admin/rooms", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 2
    # The first two entries should be our two test rooms (sorted by player_count desc)
    our_ids = [row["game_id"] for row in body["rooms"] if row["game_id"] in ("ROOMSML", "ROOMBIG")]
    assert our_ids == ["ROOMBIG", "ROOMSML"]


# ---------------- detail ----------------


async def test_room_detail_returns_full_state(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "rdet_adm")
    game = _make_room("DETROOM")
    game.log_events = [{"kind": "log_test", "text": "hello world"}]

    r = await client.get(
        "/api/admin/rooms/DETROOM", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["game_id"] == "DETROOM"
    assert body["host_name"] == "Alice"
    assert len(body["players"]) == 2
    assert body["players"][0]["is_host"] is True
    assert body["players"][1]["is_host"] is False
    assert body["recent_log"][0]["text"] == "hello world"


async def test_room_detail_404_for_missing_room(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "rd404_adm")
    r = await client.get(
        "/api/admin/rooms/MISSING", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 404


# ---------------- broadcast ----------------


async def test_broadcast_calls_ws_manager_and_audit_logs(client, make_user):
    _, admin_token, adm_uid = await _make_admin(client, make_user, "brc_adm")
    _make_room("BRCROOM")

    with patch("app.game.ws.manager.broadcast", new_callable=AsyncMock) as mock_bcast:
        r = await client.post(
            "/api/admin/rooms/BRCROOM/broadcast",
            json={
                "message_fr": "Du calme à table.",
                "message_en": "Settle down at the table.",
                "severity": "warning",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert r.status_code == 200
    mock_bcast.assert_called_once()
    payload = mock_bcast.call_args.args[1]
    assert payload["type"] == "admin_broadcast"
    assert payload["severity"] == "warning"

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(GdprAuditLog).where(
                GdprAuditLog.event_type == "admin_room_broadcast",
                GdprAuditLog.user_id == uuid.UUID(adm_uid),
            )
        )
        assert len(result.scalars().all()) >= 1


async def test_broadcast_invalid_severity_returns_400(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "brcsev_adm")
    _make_room("BRCSEV")
    r = await client.post(
        "/api/admin/rooms/BRCSEV/broadcast",
        json={"message_fr": "x", "message_en": "x", "severity": "nuclear"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400


# ---------------- admin kick ----------------


async def test_admin_kick_removes_player_and_chat_bans_user(client, make_user):
    """Admin kick removes the player AND sets chat_banned_until for the
    registered user behind that player slot."""
    _, admin_token, _ = await _make_admin(client, make_user, "kck_adm")

    # Create a real registered user whose User.id we'll attach to the
    # in-memory player slot via game.user_ids.
    target_data = make_user("kicked")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]

    game = _make_room("KCKROOM")
    game.user_ids = {"p2": target_uid}

    with patch("app.game.ws.manager.broadcast", new_callable=AsyncMock):
        # Patch connections so the send_json loop runs without sockets
        with patch("app.game.ws.manager.connections", {"KCKROOM": []}):
            r = await client.post(
                "/api/admin/rooms/KCKROOM/kick",
                json={"player_id": "p2", "reason": "harassment", "chat_ban_hours": 2},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    assert r.status_code == 200
    # Bob removed from game state
    assert all(p.id != "p2" for p in game.players)
    # Chat ban applied to the underlying User row
    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(target_uid))
        assert u.chat_banned_until is not None
        assert u.chat_banned_until > datetime.now(UTC)


async def test_admin_kick_migrates_host_if_host_kicked(client, make_user):
    """If the kicked player was the host, host_player_id migrates to the
    longest-tenured remaining player."""
    _, admin_token, _ = await _make_admin(client, make_user, "kckhost_adm")
    game = _make_room("HSTROOM")  # host is p1 by default

    with patch("app.game.ws.manager.broadcast", new_callable=AsyncMock):
        with patch("app.game.ws.manager.connections", {"HSTROOM": []}):
            r = await client.post(
                "/api/admin/rooms/HSTROOM/kick",
                json={"player_id": "p1", "reason": "admin_action"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    assert r.status_code == 200
    # Host migrated to p2
    assert game.host_player_id == "p2"


async def test_admin_kick_404_for_missing_player(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "kck404_adm")
    _make_room("KCK404")
    with patch("app.game.ws.manager.broadcast", new_callable=AsyncMock):
        with patch("app.game.ws.manager.connections", {"KCK404": []}):
            r = await client.post(
                "/api/admin/rooms/KCK404/kick",
                json={"player_id": "nonexistent", "reason": "x"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    assert r.status_code == 404


# ---------------- dissolve ----------------


async def test_dissolve_requires_matching_game_id(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "dis_conf_adm")
    _make_room("DISCONF")
    r = await client.post(
        "/api/admin/rooms/DISCONF/dissolve",
        json={"confirm_game_id": "WRONGCODE", "reason": "x"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400


async def test_dissolve_removes_room_and_persists_stats(client, make_user):
    """Dissolve writes the in-flight partie's stats for any registered
    player AND removes the room from the in-memory registry."""
    _, admin_token, _ = await _make_admin(client, make_user, "dis_adm")

    target_data = make_user("disleft")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]

    game = _make_room("DISROOM")
    game.user_ids = {"p1": target_uid}  # p1 is registered

    with patch("app.game.ws.manager.broadcast", new_callable=AsyncMock):
        with patch.dict("app.game.ws.manager.connections", {"DISROOM": []}, clear=False):
            with patch.dict("app.game.ws.manager.spectators", {"DISROOM": []}, clear=False):
                r = await client.post(
                    "/api/admin/rooms/DISROOM/dissolve",
                    json={"confirm_game_id": "DISROOM", "reason": "Players violated rules"},
                    headers={"Authorization": f"Bearer {admin_token}"},
                )
    assert r.status_code == 200
    assert r.json()["dissolved"] is True
    # Room is gone from registry
    assert "DISROOM" not in games
    # Registered player's stats got updated (parties_lost +=1)
    async with AsyncSessionLocal() as db:
        from app.db.models import PlayerStats

        ps_result = await db.execute(
            select(PlayerStats).where(PlayerStats.user_id == uuid.UUID(target_uid))
        )
        stats = ps_result.scalar_one_or_none()
        assert stats is not None
        assert stats.games_played == 1
        assert stats.parties_lost == 1


async def test_dissolve_404_for_missing_room(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "dis404_adm")
    r = await client.post(
        "/api/admin/rooms/NOWHERE/dissolve",
        json={"confirm_game_id": "NOWHERE", "reason": "x"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404

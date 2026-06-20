"""Integration tests for the G38 admin foundation.

Covers:
- `/auth/me` now returns the role + strike + ban fields.
- New `require_moderator` / `require_admin` deps enforced by `/api/admin/*`.
- `/api/admin/dashboard-summary` returns sane counts for a moderator.
- Login gate: an account with `banned_until > now()` is rejected with 403
  carrying the structured error payload the frontend uses to render the
  blocked-login screen.
- Admin can promote / demote another user via PATCH /api/admin/users/{id}/role.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import update

from app.db.base import AsyncSessionLocal
from app.db.models import User


async def _promote(user_id: str, role: str) -> None:
    """Test helper: directly stamp a user's role (bypasses the admin endpoint)."""
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(user_id)).values(role=role))
        await db.commit()


async def _suspend(user_id: str, until: datetime, reason: str) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(User)
            .where(User.id == uuid.UUID(user_id))
            .values(banned_until=until, ban_reason=reason)
        )
        await db.commit()


async def test_me_returns_default_role_and_strike(client, make_user):
    """New accounts surface role=player and strike_count=0 from /auth/me."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "player"
    assert body["strike_count"] == 0
    assert body["chat_banned_until"] is None
    assert body["banned_until"] is None
    assert body["ban_reason"] is None


async def test_player_cannot_hit_dashboard_summary(client, make_user):
    """Default-role user hitting an admin route gets 403."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get(
        "/api/admin/dashboard-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


async def test_moderator_sees_dashboard_summary(client, make_user):
    """Moderator role can fetch dashboard counts."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me_resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _promote(me_resp.json()["id"], "moderator")
    r = await client.get(
        "/api/admin/dashboard-summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    # Shape assertions only — counts depend on the rest of the suite's writes.
    assert body["total_users"] >= 1
    for key in (
        "active_account_bans",
        "active_chat_bans",
        "users_with_strikes",
        "pending_inbox_items",
        "appeals_awaiting_review",
    ):
        assert key in body
        assert body[key] >= 0


async def test_admin_can_promote_another_user(client, make_user):
    """Admin promotes a regular player to moderator via PATCH endpoint."""
    admin_data = make_user("promoter")
    admin_reg = await client.post("/auth/register", json=admin_data)
    admin_token = admin_reg.json()["access_token"]
    admin_me = await client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    await _promote(admin_me.json()["id"], "admin")

    target_data = make_user("target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_token = target_reg.json()["access_token"]
    target_me = await client.get("/auth/me", headers={"Authorization": f"Bearer {target_token}"})
    target_id = target_me.json()["id"]

    r = await client.patch(
        f"/api/admin/users/{target_id}/role?new_role=moderator",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "moderator"
    assert r.json()["previous"] == "player"


async def test_moderator_cannot_promote_others(client, make_user):
    """Moderator does NOT have role-management rights — admin-only."""
    mod_data = make_user("mod")
    mod_reg = await client.post("/auth/register", json=mod_data)
    mod_token = mod_reg.json()["access_token"]
    mod_me = await client.get("/auth/me", headers={"Authorization": f"Bearer {mod_token}"})
    await _promote(mod_me.json()["id"], "moderator")

    target_data = make_user("target2")
    target_reg = await client.post("/auth/register", json=target_data)
    target_token = target_reg.json()["access_token"]
    target_me = await client.get("/auth/me", headers={"Authorization": f"Bearer {target_token}"})
    target_id = target_me.json()["id"]

    r = await client.patch(
        f"/api/admin/users/{target_id}/role?new_role=moderator",
        headers={"Authorization": f"Bearer {mod_token}"},
    )
    assert r.status_code == 403


async def test_promote_rejects_unknown_role(client, make_user):
    """Sending a role that isn't in the enum → 400."""
    admin_data = make_user("rejecter")
    admin_reg = await client.post("/auth/register", json=admin_data)
    admin_token = admin_reg.json()["access_token"]
    admin_me = await client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    await _promote(admin_me.json()["id"], "admin")

    target_data = make_user("target3")
    target_reg = await client.post("/auth/register", json=target_data)
    target_me = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
    )
    target_id = target_me.json()["id"]

    r = await client.patch(
        f"/api/admin/users/{target_id}/role?new_role=superuser",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400


async def test_login_rejected_for_temporarily_banned_user(client, make_user):
    """G42 login gate: a user with banned_until in the future gets a 403 + payload."""
    data = make_user("banned")
    reg = await client.post("/auth/register", json=data)
    me_resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {reg.json()['access_token']}"}
    )
    until = datetime.now(UTC) + timedelta(days=7)
    await _suspend(me_resp.json()["id"], until, "harassment")

    r = await client.post(
        "/auth/login",
        json={"email": data["email"], "password": data["password"]},
    )
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "account_temporarily_suspended"
    assert detail["reason"] == "harassment"
    assert "until" in detail


async def test_login_works_after_ban_expires(client, make_user):
    """A user whose banned_until is in the past can log in normally."""
    data = make_user("expired")
    reg = await client.post("/auth/register", json=data)
    me_resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {reg.json()['access_token']}"}
    )
    past = datetime.now(UTC) - timedelta(days=1)
    await _suspend(me_resp.json()["id"], past, "spam")

    r = await client.post(
        "/auth/login",
        json={"email": data["email"], "password": data["password"]},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_bot_decisions_endpoint_requires_moderator(client, make_user):
    """G55 follow-up: a regular player hitting the bot-decisions endpoint
    gets 403; a moderator gets 200 with the buffer payload."""
    from app.game.logic import Game
    from app.game.state import games

    # Seed a synthetic game with one bot-decision entry.
    game = Game(id="MODBOT01")
    game.bot_decisions.append(
        {
            "game_id": "MODBOT01",
            "player_id": "b1",
            "player_name": "BotPlayer",
            "is_starter": True,
            "throw": 1,
            "dice_before": [0, 0, 0],
            "kept_mask": [False, False, False],
            "dice_after": [4, 2, 1],
            "combo": "421",
            "rank": 9000,
            "fiches": 8,
            "target_rank": 0,
            "max_throws_allowed": 3,
            "stop_reason": "ceiling_421",
        }
    )
    games["MODBOT01"] = game

    try:
        # Non-mod gets 403.
        player_data = make_user("nonmod")
        reg = await client.post("/auth/register", json=player_data)
        token = reg.json()["access_token"]
        r = await client.get(
            "/api/admin/games/MODBOT01/bot-decisions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403

        # Mod gets 200 with the payload.
        mod_data = make_user("mod")
        mod_reg = await client.post("/auth/register", json=mod_data)
        mod_token = mod_reg.json()["access_token"]
        me = await client.get("/auth/me", headers={"Authorization": f"Bearer {mod_token}"})
        await _promote(me.json()["id"], "moderator")
        r2 = await client.get(
            "/api/admin/games/MODBOT01/bot-decisions",
            headers={"Authorization": f"Bearer {mod_token}"},
        )
        assert r2.status_code == 200
        body = r2.json()
        assert body["game_id"] == "MODBOT01"
        assert body["count"] == 1
        assert body["decisions"][0]["combo"] == "421"
    finally:
        games.pop("MODBOT01", None)


async def test_bot_decisions_endpoint_404_unknown_game(client, make_user):
    """G55 follow-up: unknown game id → 404."""
    mod_data = make_user("modmissing")
    reg = await client.post("/auth/register", json=mod_data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _promote(me.json()["id"], "moderator")
    r = await client.get(
        "/api/admin/games/NOPENOPE/bot-decisions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


async def test_chat_ban_does_not_block_login(client, make_user):
    """chat_banned_until is surfaced via /auth/me but doesn't gate login."""
    data = make_user("chatban")
    reg = await client.post("/auth/register", json=data)
    me_resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {reg.json()['access_token']}"}
    )
    user_id = me_resp.json()["id"]
    # Stamp chat_banned_until directly.
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(User)
            .where(User.id == uuid.UUID(user_id))
            .values(chat_banned_until=datetime.now(UTC) + timedelta(days=30))
        )
        await db.commit()

    r = await client.post(
        "/auth/login",
        json={"email": data["email"], "password": data["password"]},
    )
    assert r.status_code == 200
    me = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}
    )
    assert me.json()["chat_banned_until"] is not None

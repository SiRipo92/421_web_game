"""Integration tests for the G90 admin dashboard rebuild.

Covers:
- last_seen_at middleware (throttled refresh on authenticated requests)
- GET /api/admin/users (filters: q, role, status, online, sort, pagination)
- GET /api/admin/users/{user_id} (full detail + audit log)
- POST/DELETE /api/admin/users/{user_id}/ban
- POST/DELETE /api/admin/users/{user_id}/chat-ban
- DELETE /api/admin/users/{user_id} (type-username-to-confirm + anonymize)
- GET /api/admin/audit (paginated, filterable)
- GET /api/admin/dashboard-summary (online_count + recent_admin_actions)
- Authorization gates (player → 403, moderator → some, admin → all)
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from sqlalchemy import select, update

from app.db.base import AsyncSessionLocal
from app.db.models import GdprAuditLog, User

# ---------------- helpers ----------------


async def _promote(user_id: str, role: str) -> None:
    """Directly stamp a user's role (bypasses the admin endpoint)."""
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(user_id)).values(role=role))
        await db.commit()


async def _set_last_seen(user_id: str, when: datetime | None) -> None:
    """Stamp last_seen_at directly without going through the middleware."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(User).where(User.id == uuid.UUID(user_id)).values(last_seen_at=when)
        )
        await db.commit()


async def _make_admin(client, make_user, prefix: str = "adm") -> tuple[dict, str, str]:
    """Register + promote to admin. Returns (payload, token, user_id)."""
    data = make_user(prefix)
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    uid = me.json()["id"]
    await _promote(uid, "admin")
    # Re-fetch /auth/me so the next request sees the new role (the JWT is
    # still valid; role lookup happens server-side per request).
    return data, token, uid


# ---------------- last_seen_at middleware ----------------


async def test_last_seen_at_set_on_first_authenticated_request(client, make_user):
    """last_seen_at starts NULL after register; flips to non-null after /auth/me."""
    data = make_user("seen_first")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me_first = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    uid = me_first.json()["id"]

    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(uid))
        assert u.last_seen_at is not None


async def test_last_seen_at_throttled_within_5min(client, make_user):
    """Second request within 5 minutes does NOT update last_seen_at."""
    data = make_user("seen_throttle")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    uid = me.json()["id"]

    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(uid))
        first_ts = u.last_seen_at
    assert first_ts is not None

    # Second request immediately — should NOT update (throttle is 5 min).
    await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(uid))
        assert u.last_seen_at == first_ts  # unchanged within throttle window


# ---------------- GET /api/admin/users ----------------


async def test_list_users_requires_moderator(client, make_user):
    """Plain player → 403 on the user list endpoint."""
    data = make_user("player_list")
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_list_users_returns_paginated_shape(client, make_user):
    """Admin gets a paginated response with the expected shape."""
    _, admin_token, _ = await _make_admin(client, make_user, "list_shape")
    r = await client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert "users" in body and "total" in body and "page" in body and "has_next" in body
    assert body["page"] == 1
    assert isinstance(body["users"], list)
    assert len(body["users"]) >= 1  # at least the admin themselves


async def test_list_users_q_search_matches_username_partial(client, make_user):
    """The q param matches username substring case-insensitively."""
    _, admin_token, _ = await _make_admin(client, make_user, "list_q_adm")
    target_data = make_user("findme_unique")
    await client.post("/auth/register", json=target_data)

    r = await client.get(
        "/api/admin/users?q=findme",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    usernames = [u["username"] for u in r.json()["users"]]
    assert any("findme" in u for u in usernames)


async def test_list_users_role_filter(client, make_user):
    """role=admin returns only admins."""
    _, admin_token, _ = await _make_admin(client, make_user, "role_filter_adm")
    r = await client.get(
        "/api/admin/users?role=admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert all(u["role"] == "admin" for u in r.json()["users"])


async def test_list_users_online_filter(client, make_user):
    """online=true returns only users with recent last_seen_at."""
    _, admin_token, admin_uid = await _make_admin(client, make_user, "online_adm")
    # Create an "offline" user (last_seen 1 day ago)
    offline_data = make_user("offline_user")
    offline_reg = await client.post("/auth/register", json=offline_data)
    offline_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {offline_reg.json()['access_token']}"}
        )
    ).json()["id"]
    await _set_last_seen(offline_uid, datetime.now(UTC) - timedelta(days=1))
    # Admin themselves should be "online" (just hit /auth/me as part of _make_admin)

    r = await client.get(
        "/api/admin/users?online=true",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    returned_ids = [u["id"] for u in r.json()["users"]]
    assert admin_uid in returned_ids
    assert offline_uid not in returned_ids


async def test_list_users_status_banned_filter(client, make_user):
    """status=banned returns only users with active account ban."""
    _, admin_token, _ = await _make_admin(client, make_user, "banstat_adm")
    victim_data = make_user("banned_target")
    victim_reg = await client.post("/auth/register", json=victim_data)
    victim_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {victim_reg.json()['access_token']}"}
        )
    ).json()["id"]
    # Ban the victim via the admin endpoint
    with patch("app.routers.admin._send_via_brevo"):
        await client.post(
            f"/api/admin/users/{victim_uid}/ban",
            json={"duration": "7d", "reason": "spam"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    r = await client.get(
        "/api/admin/users?status=banned",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    ids = [u["id"] for u in r.json()["users"]]
    assert victim_uid in ids


# ---------------- GET /api/admin/users/{user_id} ----------------


async def test_get_user_detail_includes_stats_and_audit(client, make_user):
    """Detail endpoint returns stats block + audit log."""
    _, admin_token, _ = await _make_admin(client, make_user, "detail_adm")
    target_data = make_user("detail_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]
    r = await client.get(
        f"/api/admin/users/{target_uid}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == target_uid
    assert body["username"] == target_data["username"]
    assert "stats" in body
    assert body["stats"]["elo"] == 1200
    assert "audit_log" in body
    # The "account_created" event from registration should be in the log
    assert any(e["event_type"] == "account_created" for e in body["audit_log"])


async def test_get_user_detail_404_for_missing_user(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "404_adm")
    fake_uid = "00000000-0000-4000-8000-000000000000"
    r = await client.get(
        f"/api/admin/users/{fake_uid}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404


# ---------------- POST/DELETE ban ----------------


async def test_ban_user_sets_banned_until_and_fires_email(client, make_user):
    """Ban sets banned_until + ban_reason and attempts the ban_notice email."""
    _, admin_token, _ = await _make_admin(client, make_user, "ban_adm")
    target_data = make_user("ban_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]

    with patch("app.routers.admin._send_via_brevo") as mock_brevo:
        r = await client.post(
            f"/api/admin/users/{target_uid}/ban",
            json={"duration": "7d", "reason": "harassment"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert r.status_code == 200
    assert r.json()["banned_until"] is not None
    assert r.json()["reason"] == "harassment"
    mock_brevo.assert_called_once()

    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(target_uid))
        assert u.banned_until is not None
        assert u.ban_reason == "harassment"


async def test_ban_user_invalid_duration_returns_400(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "ban_baddur_adm")
    target_data = make_user("ban_baddur_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]

    r = await client.post(
        f"/api/admin/users/{target_uid}/ban",
        json={"duration": "tomorrow", "reason": "x"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400


async def test_unban_user_clears_fields(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "unban_adm")
    target_data = make_user("unban_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]
    with patch("app.routers.admin._send_via_brevo"):
        await client.post(
            f"/api/admin/users/{target_uid}/ban",
            json={"duration": "7d", "reason": "spam"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    r = await client.delete(
        f"/api/admin/users/{target_uid}/ban",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(target_uid))
        assert u.banned_until is None
        assert u.ban_reason is None


async def test_ban_admin_protected_unless_actor_is_admin(client, make_user):
    """A moderator cannot ban an admin."""
    # Create a moderator
    mod_data = make_user("mod_for_ban")
    mod_reg = await client.post("/auth/register", json=mod_data)
    mod_token = mod_reg.json()["access_token"]
    mod_uid = (
        await client.get("/auth/me", headers={"Authorization": f"Bearer {mod_token}"})
    ).json()["id"]
    await _promote(mod_uid, "moderator")

    # Create an admin victim
    adm_data = make_user("admin_victim")
    adm_reg = await client.post("/auth/register", json=adm_data)
    adm_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {adm_reg.json()['access_token']}"}
        )
    ).json()["id"]
    await _promote(adm_uid, "admin")

    r = await client.post(
        f"/api/admin/users/{adm_uid}/ban",
        json={"duration": "1d", "reason": "test"},
        headers={"Authorization": f"Bearer {mod_token}"},
    )
    assert r.status_code == 403


# ---------------- chat-ban ----------------


async def test_chat_ban_user(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "chatban_adm")
    target_data = make_user("chatban_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]

    r = await client.post(
        f"/api/admin/users/{target_uid}/chat-ban",
        json={"duration": "24h", "reason": "spam"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200

    r2 = await client.delete(
        f"/api/admin/users/{target_uid}/chat-ban",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(target_uid))
        assert u.chat_banned_until is None


# ---------------- DELETE user ----------------


async def test_delete_user_requires_admin(client, make_user):
    """Moderator cannot delete; admin-only."""
    mod_data = make_user("del_mod")
    mod_reg = await client.post("/auth/register", json=mod_data)
    mod_token = mod_reg.json()["access_token"]
    mod_uid = (
        await client.get("/auth/me", headers={"Authorization": f"Bearer {mod_token}"})
    ).json()["id"]
    await _promote(mod_uid, "moderator")
    target_data = make_user("del_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]

    r = await client.request(
        "DELETE",
        f"/api/admin/users/{target_uid}",
        json={"confirm_username": target_data["username"]},
        headers={"Authorization": f"Bearer {mod_token}"},
    )
    assert r.status_code == 403


async def test_delete_user_requires_matching_username(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "del_confirm_adm")
    target_data = make_user("del_confirm_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]
    r = await client.request(
        "DELETE",
        f"/api/admin/users/{target_uid}",
        json={"confirm_username": "wrong"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400


async def test_delete_user_soft_deletes_and_anonymizes(client, make_user):
    """Confirmed delete: deleted_at set, username + email anonymized."""
    _, admin_token, _ = await _make_admin(client, make_user, "del_anon_adm")
    target_data = make_user("del_anon_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]
    original_username = target_data["username"]
    original_email = target_data["email"]

    with patch("app.routers.admin._send_via_brevo"):
        r = await client.request(
            "DELETE",
            f"/api/admin/users/{target_uid}",
            json={"confirm_username": original_username},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert r.status_code == 200
    async with AsyncSessionLocal() as db:
        u = await db.get(User, uuid.UUID(target_uid))
        assert u.deleted_at is not None
        assert u.username != original_username
        assert u.username.startswith("deleted_user_")
        assert u.email != original_email
        assert u.email.endswith("@deleted.invalid")
        assert u.hashed_password is None


async def test_delete_user_cannot_self_delete(client, make_user):
    _, admin_token, admin_uid = await _make_admin(client, make_user, "self_del_adm")
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    r = await client.request(
        "DELETE",
        f"/api/admin/users/{admin_uid}",
        json={"confirm_username": me.json()["username"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 400


# ---------------- audit feed ----------------


async def test_audit_feed_returns_recent_actions(client, make_user):
    _, admin_token, _ = await _make_admin(client, make_user, "audit_adm")
    target_data = make_user("audit_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]
    with patch("app.routers.admin._send_via_brevo"):
        await client.post(
            f"/api/admin/users/{target_uid}/ban",
            json={"duration": "1d", "reason": "test"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    r = await client.get(
        "/api/admin/audit?event_type=account_banned",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert all(e["event_type"] == "account_banned" for e in body["entries"])


# ---------------- dashboard summary ----------------


async def test_dashboard_summary_includes_online_count(client, make_user):
    _, admin_token, admin_uid = await _make_admin(client, make_user, "sum_online_adm")
    r = await client.get(
        "/api/admin/dashboard-summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "online_count" in body
    assert body["online_count"] >= 1  # admin just authenticated → counts as online
    assert "recent_admin_actions" in body
    assert isinstance(body["recent_admin_actions"], list)


# ---------------- audit log integrity ----------------


async def test_ban_writes_audit_log(client, make_user):
    """A ban action produces a GdprAuditLog row of type account_banned."""
    _, admin_token, _ = await _make_admin(client, make_user, "audwrite_adm")
    target_data = make_user("audwrite_target")
    target_reg = await client.post("/auth/register", json=target_data)
    target_uid = (
        await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {target_reg.json()['access_token']}"}
        )
    ).json()["id"]
    with patch("app.routers.admin._send_via_brevo"):
        await client.post(
            f"/api/admin/users/{target_uid}/ban",
            json={"duration": "1d", "reason": "test"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(GdprAuditLog).where(
                GdprAuditLog.user_id == uuid.UUID(target_uid),
                GdprAuditLog.event_type == "account_banned",
            )
        )
        rows = result.scalars().all()
        assert len(rows) >= 1
        meta = rows[-1].metadata_ or {}
        assert meta.get("duration") == "1d"
        assert meta.get("reason") == "test"

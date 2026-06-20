"""Integration tests for the /auth/me PATCH/DELETE and /auth/export endpoints."""

import uuid


async def _register_and_token(client, make_user) -> tuple[dict, str]:
    data = make_user()
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    return data, r.json()["access_token"]


async def test_update_me_change_username(client, make_user):
    """PATCH /auth/me updates the username and returns the new MeResponse."""
    _, token = await _register_and_token(client, make_user)
    new_name = f"renamed_{uuid.uuid4().hex[:8]}"
    r = await client.patch(
        "/auth/me",
        json={"username": new_name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["username"] == new_name


async def test_update_me_change_lang_pref(client, make_user):
    """PATCH /auth/me updates the language preference."""
    _, token = await _register_and_token(client, make_user)
    r = await client.patch(
        "/auth/me",
        json={"lang_pref": "en"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["lang_pref"] == "en"


async def test_update_me_change_theme_pref(client, make_user):
    """G46: PATCH /auth/me accepts theme_pref, /auth/me surfaces it."""
    _, token = await _register_and_token(client, make_user)
    # Default before any change.
    me_before = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_before.json()["theme_pref"] == "light"
    # Flip to dark.
    r = await client.patch(
        "/auth/me",
        json={"theme_pref": "dark"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["theme_pref"] == "dark"
    # Persisted.
    me_after = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_after.json()["theme_pref"] == "dark"


async def test_update_me_theme_pref_rejects_invalid(client, make_user):
    """G46: theme_pref outside {'light', 'dark'} → 422 from Pydantic validator."""
    _, token = await _register_and_token(client, make_user)
    r = await client.patch(
        "/auth/me",
        json={"theme_pref": "neon"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


async def test_update_me_username_conflict_returns_409(client, make_user):
    """Renaming to a taken username → 409."""
    other, _ = await _register_and_token(client, make_user)
    _, token = await _register_and_token(client, make_user)
    r = await client.patch(
        "/auth/me",
        json={"username": other["username"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 409


async def test_update_me_no_op_username_same_value(client, make_user):
    """Submitting the current username is a no-op (no conflict check fires)."""
    data, token = await _register_and_token(client, make_user)
    r = await client.patch(
        "/auth/me",
        json={"username": data["username"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


async def test_delete_me_soft_deletes(client, make_user):
    """DELETE /auth/me returns 204 and the token can no longer authenticate."""
    _, token = await _register_and_token(client, make_user)
    r = await client.delete("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204

    # Soft-deleted accounts shouldn't be returned by /auth/me anymore
    r2 = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 401


async def test_export_returns_account_and_stats(client, make_user):
    """GET /auth/export returns account info plus stats and an (empty) games list."""
    data, token = await _register_and_token(client, make_user)
    r = await client.get("/auth/export", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    payload = r.json()
    assert payload["account"]["username"] == data["username"]
    assert payload["account"]["email"] == data["email"]
    assert payload["stats"]["elo"] is not None
    assert payload["games"] == []

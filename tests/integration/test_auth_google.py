"""Integration tests for Google SSO and complete-profile endpoints."""

import sys
import types
import uuid
from unittest.mock import patch


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _install_google_stubs():
    """Provide minimal `google.auth.transport.requests` / `google.oauth2.id_token` modules.

    Production has google-auth installed; tests run without it. We stub just enough for
    `id_token.verify_oauth2_token` to be patchable.
    """
    if "google" not in sys.modules:
        sys.modules["google"] = types.ModuleType("google")
    if "google.auth" not in sys.modules:
        sys.modules["google.auth"] = types.ModuleType("google.auth")
    if "google.auth.transport" not in sys.modules:
        sys.modules["google.auth.transport"] = types.ModuleType("google.auth.transport")
    if "google.auth.transport.requests" not in sys.modules:
        mod = types.ModuleType("google.auth.transport.requests")
        mod.Request = lambda: None
        sys.modules["google.auth.transport.requests"] = mod
    if "google.oauth2" not in sys.modules:
        sys.modules["google.oauth2"] = types.ModuleType("google.oauth2")
    if "google.oauth2.id_token" not in sys.modules:
        mod = types.ModuleType("google.oauth2.id_token")
        mod.verify_oauth2_token = lambda *a, **k: {}
        sys.modules["google.oauth2.id_token"] = mod


_install_google_stubs()


async def test_google_unconfigured_returns_503(client, monkeypatch):
    """Without GOOGLE_CLIENT_ID → 503."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "")
    r = await client.post("/auth/google", json={"credential": "anything"})
    assert r.status_code == 503


async def test_google_invalid_token_returns_401(client, monkeypatch):
    """Token verification raising → 401."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "test-client")
    with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("bad")):
        r = await client.post("/auth/google", json={"credential": "junk"})
    assert r.status_code == 401


async def test_google_new_user_signup(client, monkeypatch):
    """First-time Google sign-in creates the user and returns is_new=True."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "test-client")
    u = _uid()
    info = {"sub": f"goog-new-{u}", "email": f"alice_{u}@gmail.com", "name": f"Alice{u}"}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=info):
        r = await client.post("/auth/google", json={"credential": "fake"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_new"] is True
    assert body["access_token"]


async def test_google_existing_user_links(client, make_user, monkeypatch):
    """Existing email-registered account is linked to the Google id and signed in."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "test-client")
    data = make_user()
    await client.post("/auth/register", json=data)

    info = {"sub": f"goog-link-{_uid()}", "email": data["email"], "name": data["username"]}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=info):
        r = await client.post("/auth/google", json={"credential": "fake"})
    assert r.status_code == 200
    assert r.json()["is_new"] is False


async def test_google_username_collision_appends_suffix(client, make_user, monkeypatch):
    """If the derived username is taken, the endpoint appends a numeric suffix."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "test-client")
    existing = make_user()
    await client.post("/auth/register", json=existing)

    u = _uid()
    info = {
        "sub": f"goog-coll-{u}",
        "email": f"other_{u}@gmail.com",
        "name": existing["username"],
    }
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=info):
        r = await client.post("/auth/google", json={"credential": "fake"})
    assert r.status_code == 200
    assert r.json()["is_new"] is True


async def test_complete_profile_happy_path(client, monkeypatch):
    """Google-created user completes their profile (username + birthdate)."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "test-client")
    u = _uid()
    info = {"sub": f"goog-cp-{u}", "email": f"bob_{u}@gmail.com", "name": f"Bob{u}"}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=info):
        signin = await client.post("/auth/google", json={"credential": "fake"})
    token = signin.json()["access_token"]

    r = await client.post(
        "/auth/complete-profile",
        json={"username": f"Bobby{u}", "birthdate": "1990-05-01"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


async def test_complete_profile_username_conflict(client, make_user, monkeypatch):
    """Taking an existing username via complete-profile → 409."""
    monkeypatch.setattr("app.routers.auth.settings.google_client_id", "test-client")
    other = make_user()
    await client.post("/auth/register", json=other)

    u = _uid()
    info = {"sub": f"goog-cp2-{u}", "email": f"conflict_{u}@gmail.com", "name": f"Conf{u}"}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=info):
        signin = await client.post("/auth/google", json={"credential": "fake"})
    token = signin.json()["access_token"]

    r = await client.post(
        "/auth/complete-profile",
        json={"username": other["username"], "birthdate": "1990-01-01"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 409

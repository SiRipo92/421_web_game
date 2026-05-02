"""Integration tests for auth endpoints: register, login, me, forgot/reset-password."""

from unittest.mock import AsyncMock, patch


async def test_register_creates_user(client, make_user):
    """POST /auth/register with valid data returns 201 and an access_token."""
    r = await client.post("/auth/register", json=make_user())
    assert r.status_code == 201
    assert "access_token" in r.json()


async def test_register_duplicate_rejected(client, make_user):
    """Registering the same email twice returns 409."""
    data = make_user()
    await client.post("/auth/register", json=data)
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 409


async def test_register_underage_rejected(client, make_user):
    """Birthdate that puts the user under 15 returns 422."""
    data = make_user()
    data["birthdate"] = "2015-01-01"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422


async def test_login_success(client, make_user):
    """Valid credentials return 200 and an access_token."""
    data = make_user()
    await client.post("/auth/register", json=data)
    r = await client.post(
        "/auth/login", json={"email": data["email"], "password": data["password"]}
    )
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_login_wrong_password(client, make_user):
    """Wrong password returns 401."""
    data = make_user()
    await client.post("/auth/register", json=data)
    r = await client.post("/auth/login", json={"email": data["email"], "password": "wrongpassword"})
    assert r.status_code == 401


async def test_me_authenticated(client, make_user):
    """GET /auth/me with a valid JWT returns 200 and the username."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["username"] == data["username"]


async def test_me_unauthenticated(client):
    """GET /auth/me without a token returns 401."""
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_forgot_password_unknown_email(client):
    """POST /auth/forgot-password with an unknown email still returns 202."""
    r = await client.post("/auth/forgot-password", json={"email": "ghost@nowhere.example.com"})
    assert r.status_code == 202


async def test_forgot_password_known_user(client, make_user):
    """POST /auth/forgot-password for a real user returns 202 and calls send_reset_email."""
    data = make_user()
    await client.post("/auth/register", json=data)
    with patch("app.routers.auth.send_reset_email", new_callable=AsyncMock):
        r = await client.post("/auth/forgot-password", json={"email": data["email"]})
    assert r.status_code == 202


async def test_reset_password_bad_token(client):
    """POST /auth/reset-password with a garbage token returns 400."""
    r = await client.post(
        "/auth/reset-password",
        json={"token": "notarealtoken", "new_password": "newpassword123"},
    )
    assert r.status_code == 400


async def test_reset_password_success(client, make_user):
    """A valid reset token lets the user change their password."""
    data = make_user()
    await client.post("/auth/register", json=data)

    captured = []

    async def capture_token(email, token, lang):
        captured.append(token)

    with patch("app.routers.auth.send_reset_email", side_effect=capture_token):
        await client.post("/auth/forgot-password", json={"email": data["email"]})

    assert captured, "send_reset_email should have been called"
    r = await client.post(
        "/auth/reset-password",
        json={"token": captured[0], "new_password": "newpassword456"},
    )
    assert r.status_code == 200
    # Old password should no longer work
    r2 = await client.post(
        "/auth/login", json={"email": data["email"], "password": data["password"]}
    )
    assert r2.status_code == 401


async def test_login_remember_me(client, make_user):
    """remember_me=true returns a token (longer TTL path in create_access_token)."""
    data = make_user()
    await client.post("/auth/register", json=data)
    r = await client.post(
        "/auth/login",
        json={"email": data["email"], "password": data["password"], "remember_me": True},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_me_malformed_bearer_token(client):
    """A Bearer token that is not a valid JWT returns 401 (covers JWTError path)."""
    r = await client.get("/auth/me", headers={"Authorization": "Bearer not-a-jwt-at-all"})
    assert r.status_code == 401


async def test_me_valid_jwt_unknown_user(client):
    """A well-formed JWT referencing a nonexistent user returns 401."""
    from jose import jwt

    from app.core.config import settings

    token = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000000"},
        settings.secret_key,
        algorithm="HS256",
    )
    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401

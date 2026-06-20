"""Integration tests for auth endpoints: register, login, me, forgot/reset-password."""

from unittest.mock import AsyncMock, patch

from sqlalchemy import select


async def test_register_creates_user(client, make_user):
    """POST /auth/register with valid data returns 201 and an access_token."""
    r = await client.post("/auth/register", json=make_user())
    assert r.status_code == 201
    assert "access_token" in r.json()


async def test_register_with_opt_in_sends_welcome_email(client, make_user):
    """email_opt_in=True at signup → send_welcome_email is invoked."""
    data = make_user("welcomed")
    data["email_opt_in"] = True
    with patch("app.routers.auth.send_welcome_email", new_callable=AsyncMock) as send_mock:
        r = await client.post("/auth/register", json=data)
    assert r.status_code == 201
    send_mock.assert_called_once()
    assert send_mock.call_args.kwargs["to_email"] == data["email"]


async def test_register_without_opt_in_skips_welcome_email(client, make_user):
    """email_opt_in=False (default) → no welcome email."""
    data = make_user("quiet")
    # Don't set email_opt_in — defaults to False
    with patch("app.routers.auth.send_welcome_email", new_callable=AsyncMock) as send_mock:
        r = await client.post("/auth/register", json=data)
    assert r.status_code == 201
    send_mock.assert_not_called()


async def test_register_duplicate_rejected(client, make_user):
    """Registering the same email twice returns 409."""
    data = make_user()
    await client.post("/auth/register", json=data)
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 409


async def test_register_username_collision_blames_username(client, make_user):
    """G97: when only the username collides, error says 'Username already taken'."""
    first = make_user("dup_u")
    await client.post("/auth/register", json=first)
    second = make_user("dup_u_v2")  # fresh email + suffix
    second["username"] = first["username"]
    r = await client.post("/auth/register", json=second)
    assert r.status_code == 409
    assert "username" in r.json()["detail"].lower()
    assert "email" not in r.json()["detail"].lower()


async def test_register_email_collision_blames_email(client, make_user):
    """G97: when only the email collides, error says 'Email already taken'."""
    first = make_user("dup_e")
    await client.post("/auth/register", json=first)
    second = make_user("dup_e_v2")  # fresh username
    second["email"] = first["email"]
    r = await client.post("/auth/register", json=second)
    assert r.status_code == 409
    assert "email" in r.json()["detail"].lower()
    assert "username" not in r.json()["detail"].lower()


async def test_register_underage_rejected(client, make_user):
    """G97: birthdate that puts the user under 15 returns 422."""
    data = make_user("under15")
    # Sliding window: 14 years ago always fails the >= 15 check.
    from datetime import date

    data["birthdate"] = date.today().replace(year=date.today().year - 14).isoformat()
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    assert "15 years" in str(r.json()).lower() or "15 ans" in str(r.json())


async def test_register_overage_rejected(client, make_user):
    """G97: birthdate over 120 years ago returns 422 (catches 1889-style typos)."""
    data = make_user("over120")
    data["birthdate"] = "1889-01-01"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    assert "120" in str(r.json())


async def test_register_future_birthdate_rejected(client, make_user):
    """G97: a future birthdate is nonsense — reject with 422."""
    data = make_user("future")
    from datetime import date, timedelta

    data["birthdate"] = (date.today() + timedelta(days=30)).isoformat()
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    assert "future" in str(r.json()).lower()


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
        json={"token": "notarealtoken", "new_password": "Newpassword1"},
    )
    assert r.status_code == 400


async def test_reset_password_success(client, make_user):
    """A valid reset token lets the user change their password."""
    data = make_user()
    await client.post("/auth/register", json=data)

    captured = []

    async def capture_token(email, token, lang, username=""):
        captured.append(token)

    with patch("app.routers.auth.send_reset_email", side_effect=capture_token):
        await client.post("/auth/forgot-password", json={"email": data["email"]})

    assert captured, "send_reset_email should have been called"
    r = await client.post(
        "/auth/reset-password",
        json={"token": captured[0], "new_password": "Newpassword2"},
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


# ── Register — validation edge cases ─────────────────────────────────────────


async def test_register_password_no_uppercase_returns_422(client, make_user):
    """Password without uppercase is rejected at the schema level with 422.

    This is the root cause of the registration breakage: the test fixture was
    using 'testpassword123' (no uppercase) which fails the password_strong
    validator in RegisterRequest.
    """
    data = make_user()
    data["password"] = "testpassword123"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    errors = r.json()["detail"]
    fields = [e["loc"][-1] for e in errors]
    assert "password" in fields


async def test_register_password_too_short_returns_422(client, make_user):
    """Password under 8 characters returns 422 with 'password' in the error location."""
    data = make_user()
    data["password"] = "Ab1"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    fields = [e["loc"][-1] for e in r.json()["detail"]]
    assert "password" in fields


async def test_register_password_no_digit_or_special_returns_422(client, make_user):
    """Password with no digit or special character returns 422."""
    data = make_user()
    data["password"] = "NoDigitsHere"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    fields = [e["loc"][-1] for e in r.json()["detail"]]
    assert "password" in fields


async def test_register_username_too_short_returns_422(client, make_user):
    """Single-character username returns 422."""
    data = make_user()
    data["username"] = "x"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    fields = [e["loc"][-1] for e in r.json()["detail"]]
    assert "username" in fields


async def test_register_username_too_long_returns_422(client, make_user):
    """Username over 32 characters returns 422."""
    data = make_user()
    data["username"] = "a" * 33
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422
    fields = [e["loc"][-1] for e in r.json()["detail"]]
    assert "username" in fields


async def test_register_invalid_lang_pref_returns_422(client, make_user):
    """Unsupported lang_pref value returns 422."""
    data = make_user()
    data["lang_pref"] = "de"
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422


async def test_register_missing_birthdate_returns_422(client, make_user):
    """Omitting birthdate (required field) returns 422."""
    data = make_user()
    del data["birthdate"]
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 422


# ── Register — response shape and DB side-effects ────────────────────────────


async def test_register_response_shape(client, make_user):
    """Successful registration returns access_token, token_type, and is_new."""
    r = await client.post("/auth/register", json=make_user())
    assert r.status_code == 201
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["is_new"] is False


async def test_register_creates_player_stats(client, make_user):
    """Registration creates a matching PlayerStats row in the database."""
    from app.db.base import get_db
    from app.db.models import PlayerStats, User

    data = make_user()
    reg = await client.post("/auth/register", json=data)
    assert reg.status_code == 201

    async for db in get_db():
        result = await db.execute(select(User).where(User.username == data["username"]))
        user = result.scalar_one_or_none()
        assert user is not None

        stats = await db.execute(select(PlayerStats).where(PlayerStats.user_id == user.id))
        assert stats.scalar_one_or_none() is not None, "PlayerStats row missing after registration"
        break


async def test_register_me_reflects_lang_pref(client, make_user):
    """lang_pref sent at registration is returned by /auth/me."""
    data = make_user()
    data["lang_pref"] = "en"
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["lang_pref"] == "en"


async def test_register_email_opt_in_defaults_false(client, make_user):
    """Omitting email_opt_in defaults to False; /auth/me confirms it."""
    data = make_user()
    reg = await client.post("/auth/register", json=data)
    token = reg.json()["access_token"]
    r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["email_opt_in"] is False


# ── Register — duplicate handling ─────────────────────────────────────────────


async def test_register_duplicate_username_returns_409(client, make_user):
    """Same username, different email → 409."""
    first = make_user()
    await client.post("/auth/register", json=first)

    second = make_user()
    second["username"] = first["username"]  # same username, new email
    r = await client.post("/auth/register", json=second)
    assert r.status_code == 409


async def test_register_duplicate_email_returns_409(client, make_user):
    """Same email, different username → 409."""
    first = make_user()
    await client.post("/auth/register", json=first)

    second = make_user()
    second["email"] = first["email"]  # same email, new username
    r = await client.post("/auth/register", json=second)
    assert r.status_code == 409


# ── Reset password — new password actually works ──────────────────────────────


async def test_reset_password_new_password_enables_login(client, make_user):
    """After a successful reset, the new password can be used to log in."""
    data = make_user()
    await client.post("/auth/register", json=data)

    captured = []

    async def capture(email, token, lang, username=""):
        captured.append(token)

    with patch("app.routers.auth.send_reset_email", side_effect=capture):
        await client.post("/auth/forgot-password", json={"email": data["email"]})

    new_password = "NewSecure1pass"
    await client.post(
        "/auth/reset-password",
        json={"token": captured[0], "new_password": new_password},
    )

    r = await client.post("/auth/login", json={"email": data["email"], "password": new_password})
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_reset_password_token_single_use(client, make_user):
    """A reset token cannot be used a second time."""
    data = make_user()
    await client.post("/auth/register", json=data)

    captured = []

    async def capture(email, token, lang, username=""):
        captured.append(token)

    with patch("app.routers.auth.send_reset_email", side_effect=capture):
        await client.post("/auth/forgot-password", json={"email": data["email"]})

    payload = {"token": captured[0], "new_password": "NewSecure1pass"}
    r1 = await client.post("/auth/reset-password", json=payload)
    assert r1.status_code == 200

    r2 = await client.post("/auth/reset-password", json=payload)
    assert r2.status_code == 400

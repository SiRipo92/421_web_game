"""Integration tests for the contact form + unsubscribe endpoints."""

from unittest.mock import AsyncMock, patch


async def test_contact_silently_succeeds_when_unconfigured(client, monkeypatch):
    """No CONTACT_EMAIL set → 202 with success message (don't leak config state)."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "")
    r = await client.post(
        "/api/contact",
        json={"name": "Marcel", "email": "marcel@gmail.com", "subject": "bug", "message": "stuck"},
    )
    assert r.status_code == 202
    assert r.json() == {"detail": "Message received"}


async def test_contact_silently_succeeds_without_brevo_key(client, monkeypatch):
    """CONTACT_EMAIL set but no BREVO_API_KEY → 202, no email sent."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.brevo_api_key", "")
    r = await client.post(
        "/api/contact",
        json={"name": "Marcel", "email": "marcel@gmail.com", "subject": "other", "message": "hi"},
    )
    assert r.status_code == 202


async def test_contact_sends_email_via_brevo(client, monkeypatch):
    """Happy path: both configs set → send_admin_contact_form is invoked."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.brevo_api_key", "xkeysib-test")
    with patch("app.routers.contact.send_admin_contact_form", new_callable=AsyncMock) as send_mock:
        r = await client.post(
            "/api/contact",
            json={
                "name": "Marcel",
                "email": "marcel@gmail.com",
                "subject": "export",
                "message": "I want my data",
            },
        )
    assert r.status_code == 202
    send_mock.assert_called_once()
    kwargs = send_mock.call_args.kwargs
    assert kwargs["from_email"] == "marcel@gmail.com"
    assert kwargs["category"] == "export"
    assert "export de données" in kwargs["category_label"].lower()


async def test_contact_unknown_subject_falls_through(client, monkeypatch):
    """Unmapped subject string falls through to the default 'other' label."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.brevo_api_key", "xkeysib-test")
    with patch("app.routers.contact.send_admin_contact_form", new_callable=AsyncMock) as send_mock:
        r = await client.post(
            "/api/contact",
            json={"name": "M", "email": "m@gmail.com", "subject": "feedback", "message": "x"},
        )
    assert r.status_code == 202
    # Falls back to "other"
    assert send_mock.call_args.kwargs["category_label"] == "Message de contact"


async def test_contact_brevo_failure_returns_502(client, monkeypatch):
    """Brevo raising → 502 to the caller with a code field."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.brevo_api_key", "xkeysib-test")
    with patch(
        "app.routers.contact.send_admin_contact_form",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        r = await client.post(
            "/api/contact",
            json={"name": "M", "email": "m@gmail.com", "subject": "bug", "message": "x"},
        )
    assert r.status_code == 502
    assert "code" in r.json()["detail"]


async def test_contact_sender_domain_error_maps_to_specific_code(client, monkeypatch):
    """An exception mentioning 'domain' / 'sender' → email_sender_not_configured code."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.brevo_api_key", "xkeysib-test")
    with patch(
        "app.routers.contact.send_admin_contact_form",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Sender domain not verified"),
    ):
        r = await client.post(
            "/api/contact",
            json={"name": "M", "email": "m@gmail.com", "subject": "bug", "message": "x"},
        )
    assert r.status_code == 502
    assert r.json()["detail"]["code"] == "email_sender_not_configured"


# ---------------- /api/unsubscribe ----------------


async def test_unsubscribe_with_invalid_token_redirects_to_invalid_page(client):
    r = await client.get("/api/unsubscribe?token=not-real", follow_redirects=False)
    assert r.status_code == 302
    assert "/unsubscribed?status=invalid" in r.headers["location"]


async def test_unsubscribe_with_nonuuid_sub_redirects_to_invalid_page(client):
    """Valid signature but the 'sub' isn't a UUID → invalid path."""
    from jose import jwt

    from app.core.config import settings

    bad = jwt.encode(
        {"sub": "not-a-uuid", "purpose": "unsubscribe"},
        settings.secret_key,
        algorithm="HS256",
    )
    r = await client.get(f"/api/unsubscribe?token={bad}", follow_redirects=False)
    assert r.status_code == 302
    assert "/unsubscribed?status=invalid" in r.headers["location"]


async def test_unsubscribe_for_unknown_user_treats_as_ok(client):
    """User deleted since the token was issued → still redirect to ok page (idempotent)."""
    from app.services.email import make_unsubscribe_token

    tok = make_unsubscribe_token("00000000-0000-4000-8000-000000abcdef")
    r = await client.get(f"/api/unsubscribe?token={tok}", follow_redirects=False)
    assert r.status_code == 302
    assert "/unsubscribed?status=ok" in r.headers["location"]


async def test_unsubscribe_flips_opt_in_for_real_user(client, make_user):
    """Valid token for a real opted-in user → email_opt_in becomes False."""
    from sqlalchemy import select

    from app.db.base import AsyncSessionLocal
    from app.db.models import User
    from app.services.email import make_unsubscribe_token

    # Register a user with opt-in=True
    payload = make_user("unsub")
    payload["email_opt_in"] = True
    r = await client.post("/auth/register", json=payload)
    assert r.status_code == 201

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == payload["email"]))
        user = result.scalar_one()
        assert user.email_opt_in is True
        uid = str(user.id)

    tok = make_unsubscribe_token(uid)
    r = await client.get(f"/api/unsubscribe?token={tok}", follow_redirects=False)
    assert r.status_code == 302
    assert "/unsubscribed?status=ok" in r.headers["location"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == payload["email"]))
        assert result.scalar_one().email_opt_in is False

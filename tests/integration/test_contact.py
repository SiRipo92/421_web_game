"""Integration tests for the contact form endpoint."""

from unittest.mock import patch


async def test_contact_silently_succeeds_when_unconfigured(client, monkeypatch):
    """No CONTACT_EMAIL set → 202 with success message (don't leak config state)."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "")
    r = await client.post(
        "/api/contact",
        json={"name": "Marcel", "email": "marcel@gmail.com", "subject": "bug", "message": "stuck"},
    )
    assert r.status_code == 202
    assert r.json() == {"detail": "Message received"}


async def test_contact_silently_succeeds_without_resend_key(client, monkeypatch):
    """CONTACT_EMAIL set but no RESEND_API_KEY → 202, no email sent."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.resend_api_key", "")
    r = await client.post(
        "/api/contact",
        json={"name": "Marcel", "email": "marcel@gmail.com", "subject": "other", "message": "hi"},
    )
    assert r.status_code == 202


async def test_contact_sends_email_via_resend(client, monkeypatch):
    """Happy path: both configs set → resend.Emails.send is called with mapped subject."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.resend_api_key", "re_test")
    with patch("resend.Emails.send") as send_mock:
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
    payload = send_mock.call_args[0][0]
    assert payload["to"] == "owner@example.com"
    assert "export de données" in payload["subject"]


async def test_contact_unknown_subject_falls_through(client, monkeypatch):
    """Unmapped subject string falls through to the default prefixed subject."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.resend_api_key", "re_test")
    with patch("resend.Emails.send") as send_mock:
        r = await client.post(
            "/api/contact",
            json={"name": "M", "email": "m@gmail.com", "subject": "feedback", "message": "x"},
        )
    assert r.status_code == 202
    assert "feedback" in send_mock.call_args[0][0]["subject"]


async def test_contact_resend_failure_returns_502(client, monkeypatch):
    """Resend raising → 502 to the caller."""
    monkeypatch.setattr("app.routers.contact.settings.contact_email", "owner@example.com")
    monkeypatch.setattr("app.routers.contact.settings.resend_api_key", "re_test")
    with patch("resend.Emails.send", side_effect=RuntimeError("boom")):
        r = await client.post(
            "/api/contact",
            json={"name": "M", "email": "m@gmail.com", "subject": "bug", "message": "x"},
        )
    assert r.status_code == 502

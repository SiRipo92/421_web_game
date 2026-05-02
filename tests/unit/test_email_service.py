"""Unit tests for the email service (mocks the Resend API call)."""

from unittest.mock import patch

import pytest

from app.services.email import send_reset_email


@pytest.mark.asyncio
async def test_send_reset_email_french():
    """send_reset_email in French calls _send with French subject."""
    with patch("app.services.email.resend.Emails.send") as mock_send:
        await send_reset_email("user@example.com", "tok123", lang="fr")
    mock_send.assert_called_once()
    payload = mock_send.call_args[0][0]
    body = payload["subject"].lower() + payload["html"].lower()
    assert "réinitialisation" in body


@pytest.mark.asyncio
async def test_send_reset_email_english():
    """send_reset_email in English calls _send with English subject."""
    with patch("app.services.email.resend.Emails.send") as mock_send:
        await send_reset_email("user@example.com", "tok456", lang="en")
    mock_send.assert_called_once()
    payload = mock_send.call_args[0][0]
    assert "Reset" in payload["subject"]


@pytest.mark.asyncio
async def test_send_reset_email_propagates_exception():
    """Exceptions from the Resend API are logged and re-raised."""
    with patch("app.services.email.resend.Emails.send", side_effect=RuntimeError("api down")):
        with pytest.raises(RuntimeError):
            await send_reset_email("user@example.com", "tok789", lang="en")

"""Top-level test fixtures shared across unit and integration tests."""

import pytest

from app.core.limiter import limiter


@pytest.fixture(autouse=True)
def _bypass_email_deliverability(monkeypatch):
    """Skip DNS MX-record / null-MX checks (example.com is null-MX by RFC 7505).

    Production keeps the real check; tests use placeholder domains.
    """
    from email_validator import validate_email as real_validate

    def fake_validate(email, *args, **kwargs):
        kwargs["check_deliverability"] = False
        return real_validate(email, *args, **kwargs)

    monkeypatch.setattr("app.schemas.auth._validate_email", fake_validate)


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    """Disable slowapi limits so back-to-back tests don't trip per-IP quotas."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(autouse=True)
def _zero_validate_hold(monkeypatch):
    """G56: collapse the 1.5s post-validate hold so tests don't pay the
    sleep cost on every cycle-advance. The advance itself still fires —
    sleep(0) yields once but doesn't delay. Tests that observe the *held*
    state read the broadcast before the advance broadcast.
    """
    monkeypatch.setattr("app.game.ws.HUMAN_VALIDATE_HOLD_SECONDS", 0)

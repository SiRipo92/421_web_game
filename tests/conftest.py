"""Top-level test fixtures shared across unit and integration tests.

WARNING: the test-database swap below MUST execute before any `app.*`
import in this file (or in any other conftest). pydantic-settings
caches env values at module-instantiation time — so once
`app.core.config.settings` runs, it's locked to whatever DATABASE_URL
was in os.environ at that moment. Re-ordering imports here will
silently re-point tests at the production DB.
"""

import os
from pathlib import Path

# pytest doesn't auto-load `.env`, but pydantic-settings will read it
# when `app.core.config.settings` is instantiated. We need to know
# TEST_DATABASE_URL *before* that, so we parse `.env` manually here.
# Tiny parser: KEY=value lines, ignore blanks + #comments, no escaping
# / multiline / quotes (matches the shape of our .env exactly).
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _key, _, _val = _line.partition("=")
        _key = _key.strip()
        _val = _val.strip()
        # Don't clobber values explicitly set in the shell — those win.
        if _key and _key not in os.environ:
            os.environ[_key] = _val

# Swap DATABASE_URL → TEST_DATABASE_URL before app modules import.
# Two guards:
#   1. Refuse to run if TEST_DATABASE_URL isn't set — better to fail
#      loudly than to silently hit prod.
#   2. Refuse to run if the chosen URL doesn't contain "test" — the
#      "test" substring is a typo trip-wire (a misconfigured env that
#      points the test suite at fourtwentyone would otherwise wipe
#      the user table).
_test_url = os.environ.get("TEST_DATABASE_URL", "").strip()
if not _test_url:
    raise RuntimeError(
        "TEST_DATABASE_URL is not set. Create a separate test database "
        "(see README → Tests) and add the connection string to .env."
    )
if "test" not in _test_url.lower():
    raise RuntimeError(
        f"TEST_DATABASE_URL does not contain 'test' — refusing to run "
        f"tests against this URL ({_test_url}). Safety guard to prevent "
        f"accidental writes to the production DB."
    )
os.environ["DATABASE_URL"] = _test_url

import pytest  # noqa: E402

from app.core.limiter import limiter  # noqa: E402


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
    """Disable slowapi limits so back-to-back tests don't trip per-IP quotas.

    Setting `limiter.enabled = False` is necessary but not sufficient — the
    in-memory storage still accumulates counts in some code paths (the
    `_inject_headers` branch evaluates `current_limit` even when disabled,
    and certain test sequences leak counts across fixture teardowns). We
    also reset the storage at both ends so a slow test on the previous
    file can't poison the bucket for the next file's first test.

    The symptom this guards against: `r.json()["access_token"]` raising
    KeyError because the register call returned 429 mid-suite.
    """
    limiter.enabled = False
    try:
        limiter._storage.reset()
    except Exception:
        # Some storage backends (e.g. Redis in CI) don't expose reset()
        # — the enabled=False flag remains the primary defence.
        pass
    yield
    try:
        limiter._storage.reset()
    except Exception:
        pass
    limiter.enabled = True


@pytest.fixture(autouse=True)
def _zero_validate_hold(monkeypatch):
    """G56: collapse the 1.5s post-validate hold so tests don't pay the
    sleep cost on every cycle-advance. The advance itself still fires —
    sleep(0) yields once but doesn't delay. Tests that observe the *held*
    state read the broadcast before the advance broadcast.
    """
    monkeypatch.setattr("app.game.ws.HUMAN_VALIDATE_HOLD_SECONDS", 0)

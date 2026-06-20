"""G93 unit tests for the AFK eviction module.

Focused on the pure-function helpers (is_eviction_due, should_send_warning,
warning_payload, mark_afk_started, clear_afk_state). The async `evict_player`
function has integration tests in the same suite that needs a real DB +
GdprAuditLog write — covered separately.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from app.game.logic import Player
from app.services import afk_eviction


def _player(afk_started_at=None, warnings_sent=0):
    p = Player(id="p1", name="Alice")
    p.afk_started_at = afk_started_at
    p.afk_warnings_sent = warnings_sent
    return p


def test_is_eviction_due_returns_false_when_not_afk():
    """A player with no afk_started_at cannot be due for eviction."""
    assert afk_eviction.is_eviction_due(_player()) is False


def test_is_eviction_due_false_before_threshold():
    """1 minute into AFK with a 10-minute timeout → no eviction."""
    p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=1))
    assert afk_eviction.is_eviction_due(p) is False


def test_is_eviction_due_true_after_threshold():
    """10+1 minutes into AFK → eviction is due."""
    p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=11))
    assert afk_eviction.is_eviction_due(p) is True


def test_timeout_is_clamped_to_min():
    """Misconfig BOT_TAKEOVER_MAX_MINUTES=1 → runtime treats it as MIN_TIMEOUT (5)."""
    with patch.object(afk_eviction.settings, "bot_takeover_max_minutes", 1):
        # 4 min elapsed → not yet at the 5-min floor
        p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=4))
        assert afk_eviction.is_eviction_due(p) is False
        # 6 min elapsed → past the 5-min floor
        p2 = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=6))
        assert afk_eviction.is_eviction_due(p2) is True


def test_timeout_is_clamped_to_max():
    """Misconfig BOT_TAKEOVER_MAX_MINUTES=99 → runtime treats it as MAX_TIMEOUT (30)."""
    with patch.object(afk_eviction.settings, "bot_takeover_max_minutes", 99):
        # 31 minutes elapsed → past the 30-min ceiling
        p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=31))
        assert afk_eviction.is_eviction_due(p) is True


def test_should_send_warning_only_inside_t_minus_window():
    """Warning fires when elapsed is in the last `warning_seconds` of the timeout."""
    # 10 - 2 = 8 minutes into AFK → in the warning window
    p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=9))
    assert afk_eviction.should_send_warning(p) is True


def test_should_send_warning_false_before_window():
    """5 minutes in is below the T-2min threshold → no warning yet."""
    p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=5))
    assert afk_eviction.should_send_warning(p) is False


def test_should_send_warning_false_after_already_sent():
    """Once a warning has fired for this episode, don't re-fire."""
    p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=9), warnings_sent=1)
    assert afk_eviction.should_send_warning(p) is False


def test_warning_payload_shape():
    """Payload includes the WS message type, remaining seconds, player_id."""
    p = _player(afk_started_at=datetime.now(UTC) - timedelta(minutes=9))
    payload = afk_eviction.warning_payload(p)
    assert payload["type"] == "eviction_warning"
    assert payload["player_id"] == p.id
    # 10 - 9 = 1 minute remaining, give or take
    assert 0 <= payload["seconds_remaining"] <= 120


def test_mark_afk_started_idempotent():
    """Calling mark_afk_started repeatedly only sets the timestamp once."""
    import asyncio

    p = _player()
    asyncio.run(afk_eviction.mark_afk_started(p))
    first = p.afk_started_at
    assert first is not None
    asyncio.run(afk_eviction.mark_afk_started(p))
    assert p.afk_started_at == first  # didn't get re-stamped


def test_clear_afk_state_resets_both_fields():
    """Handback / return path clears the eviction clock + warning counter."""
    p = _player(afk_started_at=datetime.now(UTC), warnings_sent=2)
    afk_eviction.clear_afk_state(p)
    assert p.afk_started_at is None
    assert p.afk_warnings_sent == 0


def test_render_session_ended_afk_email_renders():
    """The new email template renders without missing variables.

    Mirrors the pattern in test_email_service for the other stub
    templates — confirms metadata.py wiring + variable contract."""
    from app.services.email import render_email

    subject, html, text = render_email(
        "session_ended_afk",
        "fr",
        username="Alice",
        game_code="ABC123",
        timeout_minutes=10,
    )
    assert "inactivité" in subject.lower()
    assert "Alice" in html
    assert "ABC123" in html
    assert "Alice" in text
    # English variant too
    subject_en, _, _ = render_email(
        "session_ended_afk",
        "en",
        username="Alice",
        game_code="ABC123",
        timeout_minutes=10,
    )
    assert "inactivity" in subject_en.lower()

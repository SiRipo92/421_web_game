"""Unit tests for RegisterRequest Pydantic schema validators.

Runs without a database or HTTP layer — validates schema logic directly.
These are the fastest safety net against validator regressions.
"""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest


def _payload(**overrides) -> dict:
    """Minimal valid payload; override individual fields to test failure paths."""
    return {
        "username": "ValidUser",
        "email": "user@example.com",
        "password": "Secure1pass",
        "birthdate": "1990-06-15",
        **overrides,
    }


def _make(**overrides) -> RegisterRequest:
    return RegisterRequest(**_payload(**overrides))


# ── Password ──────────────────────────────────────────────────────────────────


def test_password_too_short():
    with pytest.raises(ValidationError, match="8 characters"):
        _make(password="Ab1")


def test_password_no_uppercase():
    """The bug: 'testpassword123' has no uppercase — this is what breaks registration."""
    with pytest.raises(ValidationError, match="uppercase"):
        _make(password="testpassword123")


def test_password_no_digit_or_special():
    with pytest.raises(ValidationError, match="number or special"):
        _make(password="NoDigitsHere")


def test_password_exceeds_72_bytes():
    with pytest.raises(ValidationError, match="72"):
        _make(password="A1!" + "a" * 71)


def test_password_exactly_72_bytes_accepted():
    p = "A1" + "a" * 70
    assert _make(password=p).password == p


def test_password_minimum_valid():
    r = _make(password="Secure1!")
    assert r.password == "Secure1!"


def test_password_special_char_satisfies_digit_rule():
    # Special character alone (no digit) should pass the digit-or-special check
    r = _make(password="NoDigit!A")
    assert r.password == "NoDigit!A"


# ── Username ──────────────────────────────────────────────────────────────────


def test_username_too_short_rejected():
    """G96: tightened bound — minimum is now 3 chars."""
    with pytest.raises(ValidationError, match="at least 3"):
        _make(username="ab")


def test_username_too_long_rejected():
    """G96: tightened bound — maximum is now 20 chars."""
    with pytest.raises(ValidationError, match="at most 20"):
        _make(username="a" * 21)


def test_username_strips_whitespace():
    assert _make(username="  alice  ").username == "alice"


def test_username_three_chars_accepted():
    """G96: 3 chars is the new minimum."""
    assert _make(username="abc").username == "abc"


def test_username_20_chars_accepted():
    """G96: 20 chars is the new maximum."""
    assert _make(username="a" * 20).username == "a" * 20


def test_username_bigbite420_rejected():
    """G96 acceptance: the original reported case must reject."""
    with pytest.raises(ValidationError, match="inappropriate"):
        _make(username="BigBite420")


def test_username_l33t_bypass_rejected():
    """G96: l33t substitutions don't bypass the blocklist."""
    with pytest.raises(ValidationError, match="inappropriate"):
        _make(username="c0nnard")


def test_username_admin_impersonation_rejected():
    """G96: handles flagging system roles ('admin') are rejected."""
    with pytest.raises(ValidationError, match="inappropriate"):
        _make(username="admin")


def test_username_assassin_accepted():
    """G96 false-positive guard: 'Assassin' contains 'ass' but is clean."""
    assert _make(username="Assassin").username == "Assassin"


def test_username_special_chars_rejected():
    """G96: special chars beyond _ . - are rejected."""
    with pytest.raises(ValidationError, match="letters, digits"):
        _make(username="b!gger")


def test_username_consecutive_special_rejected():
    """G96: consecutive _ / . / - flagged."""
    with pytest.raises(ValidationError, match="consecutive"):
        _make(username="user__name")


def test_username_leading_special_rejected():
    """G96: cannot start with _ / . / -."""
    with pytest.raises(ValidationError, match="start"):
        _make(username="_sneaky")


# ── Age / birthdate ───────────────────────────────────────────────────────────


def test_age_14_rejected():
    underage = (date.today() - timedelta(days=14 * 365)).isoformat()
    with pytest.raises(ValidationError, match="15"):
        _make(birthdate=underage)


def test_age_exactly_15_today_accepted():
    today = date.today()
    bday = today.replace(year=today.year - 15)
    r = _make(birthdate=bday.isoformat())
    assert r.birthdate == bday


def test_age_14_years_364_days_rejected():
    """One day before the 15th birthday must still be rejected."""
    today = date.today()
    bday_15 = today.replace(year=today.year - 15)
    one_day_short = bday_15 + timedelta(days=1)
    with pytest.raises(ValidationError, match="15"):
        _make(birthdate=one_day_short.isoformat())


def test_age_30_years_accepted():
    r = _make(birthdate="1995-01-01")
    assert r.birthdate == date(1995, 1, 1)


# ── lang_pref ─────────────────────────────────────────────────────────────────


def test_lang_pref_unsupported_rejected():
    with pytest.raises(ValidationError, match="'fr' or 'en'"):
        _make(lang_pref="de")


def test_lang_pref_fr_accepted():
    assert _make(lang_pref="fr").lang_pref == "fr"


def test_lang_pref_en_accepted():
    assert _make(lang_pref="en").lang_pref == "en"


def test_lang_pref_defaults_to_fr():
    assert _make().lang_pref == "fr"


# ── Defaults ──────────────────────────────────────────────────────────────────


def test_email_opt_in_defaults_false():
    assert _make().email_opt_in is False


def test_email_opt_in_true_accepted():
    assert _make(email_opt_in=True).email_opt_in is True

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


def test_username_one_char_rejected():
    with pytest.raises(ValidationError, match="2.32 characters"):
        _make(username="x")


def test_username_33_chars_rejected():
    with pytest.raises(ValidationError, match="2.32 characters"):
        _make(username="a" * 33)


def test_username_strips_whitespace():
    assert _make(username="  alice  ").username == "alice"


def test_username_two_chars_accepted():
    assert _make(username="ab").username == "ab"


def test_username_32_chars_accepted():
    assert _make(username="a" * 32).username == "a" * 32


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

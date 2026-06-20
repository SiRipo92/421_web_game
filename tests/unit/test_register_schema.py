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


# ── Email validator edge cases (G99 coverage push) ────────────────────────────


def test_email_dns_failure_falls_back_to_normalized(monkeypatch):
    """DNS lookup raising a generic exception → fall back to lowercased input
    rather than rejecting. We don't want a flaky DNS resolver to block
    real signups."""
    from app.schemas import auth as auth_schema

    def boom_resolver(*args, **kwargs):
        raise OSError("dns down")

    monkeypatch.setattr(auth_schema, "_validate_email", boom_resolver)
    user = _make(email="UPPER@example.com")
    assert user.email == "upper@example.com"


def test_email_deliverability_rejected(monkeypatch):
    """EmailNotValidError from the deliverability check → ValidationError.

    Pydantic's EmailStr runs first and accepts a syntactically valid
    address; our `email_deliverable` field_validator then asks
    `_validate_email(..., check_deliverability=True)` which can raise
    if the domain has no MX record. We simulate that path here."""
    from email_validator import EmailNotValidError

    from app.schemas import auth as auth_schema

    def reject(*args, **kwargs):
        raise EmailNotValidError("domain has no MX record")

    monkeypatch.setattr(auth_schema, "_validate_email", reject)
    with pytest.raises(ValidationError, match="MX record"):
        _make(email="user@nonexistent-domain-zzz.example")


def test_email_disposable_rejected(monkeypatch):
    """MailChecker says disposable → reject with the disposable message."""
    from app.schemas import auth as auth_schema

    if not auth_schema._mailchecker_available:
        pytest.skip("MailChecker not installed in this env")

    class _FakeChecker:
        @staticmethod
        def is_valid(addr):
            return False

    monkeypatch.setattr(auth_schema, "_MailChecker", _FakeChecker)
    with pytest.raises(ValidationError, match="[Dd]isposable"):
        _make(email="user@10minutemail.com")


# ── Reset / update / complete-profile schemas ─────────────────────────────────


def test_reset_password_strong():
    """ResetPasswordRequest enforces the same password rules as register."""
    from app.schemas.auth import ResetPasswordRequest

    # Too short
    with pytest.raises(ValidationError, match="8 characters"):
        ResetPasswordRequest(token="t" * 32, new_password="Ab1")
    # No uppercase
    with pytest.raises(ValidationError, match="uppercase"):
        ResetPasswordRequest(token="t" * 32, new_password="lowercase1")
    # No digit/special
    with pytest.raises(ValidationError, match="number or special"):
        ResetPasswordRequest(token="t" * 32, new_password="OnlyLetters")
    # Over 72 bytes
    with pytest.raises(ValidationError, match="72 characters"):
        ResetPasswordRequest(token="t" * 32, new_password="Ab1" + "x" * 80)
    # Happy path
    r = ResetPasswordRequest(token="t" * 32, new_password="Goodpass1")
    assert r.new_password == "Goodpass1"


def test_update_me_passthrough_when_none():
    """UpdateMeRequest with explicit None values stays None (no validation fire)."""
    from app.schemas.auth import UpdateMeRequest

    r = UpdateMeRequest(username=None, lang_pref=None, theme_pref=None)
    assert r.username is None and r.lang_pref is None and r.theme_pref is None


def test_update_me_invalid_lang_pref_rejected():
    from app.schemas.auth import UpdateMeRequest

    with pytest.raises(ValidationError, match="lang_pref"):
        UpdateMeRequest(lang_pref="de")


def test_update_me_invalid_theme_pref_rejected():
    from app.schemas.auth import UpdateMeRequest

    with pytest.raises(ValidationError, match="theme_pref"):
        UpdateMeRequest(theme_pref="purple")


def test_update_me_valid_theme_accepted():
    from app.schemas.auth import UpdateMeRequest

    assert UpdateMeRequest(theme_pref="dark").theme_pref == "dark"
    assert UpdateMeRequest(theme_pref="light").theme_pref == "light"


def test_complete_profile_birthdate_future_rejected():
    from app.schemas.auth import CompleteProfileRequest

    future = date.today() + timedelta(days=30)
    with pytest.raises(ValidationError, match="future"):
        CompleteProfileRequest(username="Newbie", birthdate=future)


def test_complete_profile_birthdate_too_young_rejected():
    from app.schemas.auth import CompleteProfileRequest

    today = date.today()
    too_young = date(today.year - 14, today.month, today.day)
    with pytest.raises(ValidationError, match="at least 15"):
        CompleteProfileRequest(username="Newbie", birthdate=too_young)


def test_complete_profile_birthdate_over_120_rejected():
    from app.schemas.auth import CompleteProfileRequest

    today = date.today()
    too_old = date(today.year - 130, today.month, today.day)
    with pytest.raises(ValidationError, match="120"):
        CompleteProfileRequest(username="Newbie", birthdate=too_old)


def test_complete_profile_valid_birthdate_accepted():
    from app.schemas.auth import CompleteProfileRequest

    r = CompleteProfileRequest(username="Newbie", birthdate=date(1990, 6, 15))
    assert r.birthdate == date(1990, 6, 15)

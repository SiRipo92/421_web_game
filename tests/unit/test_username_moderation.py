"""G96 unit tests for the username_moderation module.

Two-layer defense:
  Layer 1: format validator (regex + allowlist + structural rules).
  Layer 2: bilingual blocklist with l33t normalization.

We test each layer in isolation, then the combined `check_username` API
that's wired into Pydantic validators. False-positive guards are
explicit so we catch regressions where the blocklist gets too aggressive.
"""

import pytest

from app.services.username_moderation import (
    check_username,
    is_clean_username,
    validate_format,
)

# ---------------- Layer 1: format ----------------


@pytest.mark.parametrize(
    "username",
    [
        "Sierra",
        "marcel_dupont",
        "user.42",
        "bot-3",  # format-wise valid; blocked at layer 2 (bot impersonation)
        "abc",
        "a" * 20,
        "TheWitch",
        "Mat-h",
        "ANNA",
    ],
)
def test_format_accepts_well_formed(username):
    ok, err = validate_format(username)
    assert ok, err


@pytest.mark.parametrize(
    "username,reason_substr",
    [
        ("", "required"),
        ("ab", "at least 3"),
        ("a" * 21, "at most 20"),
        ("BigBite 420", "letters, digits"),
        ("b!gger", "letters, digits"),
        ("user__name", "consecutive"),
        ("user..name", "consecutive"),
        ("user--name", "consecutive"),
        ("_sneaky", "start"),
        ("trail-", "end"),
        ("..bad", "consecutive"),  # both consecutive AND leading-special; consecutive matches first
    ],
)
def test_format_rejects_malformed(username, reason_substr):
    ok, err = validate_format(username)
    assert not ok
    assert reason_substr.lower() in err.lower()


# ---------------- Layer 2: blocklist ----------------


@pytest.mark.parametrize(
    "username",
    [
        "Sierra",
        "marcel_dupont",
        "user.42",
        # False-positive guards: handles that contain blocklist substrings
        # but are legitimate compound words.
        "Assassin",  # contains 'ass'
        "robotanist",  # contains 'bot' but as a substring not a token
        "gamemaster",  # contains 'master'
        "Cassandra",  # contains 'ass'
        "compassion",  # contains 'ass'
        "TheWitch",
        "ANNA",
    ],
)
def test_blocklist_accepts_clean(username):
    ok, err = is_clean_username(username)
    assert ok, err


@pytest.mark.parametrize(
    "username",
    [
        # The original reported case + variants
        "BigBite420",
        "b1gb1te",
        "B!gB1te420",  # rejected at layer 1 anyway, but normalizes to bigbite for layer 2
        "c0nnard",
        "m3rde",
        "fucker",
        "biotchman",
        "F4ckthis",
        "p3n1s420",
        # Whole-word slurs
        "admin",
        "official",
        "support",
        "bot",
        # Substring slurs (anywhere in handle)
        "nigga420",
        # Dot/underscore-split handles
        "big.bite.420",
        "con_nard",
        "fuck-you",
        "F4ck.you",
    ],
)
def test_blocklist_rejects_offensive(username):
    # check_username is used so the format check runs first; we then
    # confirm the rejection happens (via ValueError).
    with pytest.raises(ValueError):
        check_username(username)


# ---------------- Combined check_username ----------------


def test_check_username_returns_the_input_on_success():
    """The combined gate returns the validated handle unchanged."""
    assert check_username("Sierra") == "Sierra"


def test_check_username_format_errors_come_first():
    """A handle that fails BOTH layers should raise the format error
    (more specific feedback). Layer 1 runs before layer 2."""
    with pytest.raises(ValueError, match="letters, digits"):
        check_username("BigBite 420")


def test_blocklist_error_is_generic():
    """The blocklist error should never reveal which term matched —
    that would let attackers iterate around the gate."""
    with pytest.raises(ValueError, match="inappropriate"):
        check_username("c0nnard")

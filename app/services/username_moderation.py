"""Username + display-name moderation (G96).

Two-layer defense:
  Layer 1: format allowlist (regex). Rejects spaces, unicode confusables,
    most special chars. Cheap, eliminates noise before the blocklist runs.
  Layer 2: bilingual blocklist with l33t normalization. Rejects profanity
    + variants like `B1gB1te420`, `c0nnard`, `m3rde`.

Public surface:
  - validate_format(username) -> (ok: bool, error: str | None)
  - is_clean_username(username) -> (ok: bool, error: str | None)
  - check_username(username) -> raise ValueError on bad

The error strings returned are generic on purpose — we never reveal
WHICH blocklist term matched. Callers (Pydantic validators) convert
ValueError into a user-facing message that says "username contains
inappropriate content" without leaking the blocklist surface.

Add entries to app/data/username_blocklist.txt — no code change needed.
"""

import re
from pathlib import Path

# --- Layer 1: format allowlist ---

# Letters / digits / underscore / dot / hyphen. 3-20 chars. No spaces.
# No leading/trailing special chars enforced separately so the error is
# specific. The set keeps unicode confusables (homoglyphs) out by being
# strict ASCII.
_FORMAT_RE = re.compile(r"^[A-Za-z0-9_.\-]{3,20}$")

# No consecutive special chars (e.g. "user..name", "user__name"). Also
# rejected: leading/trailing special.
_BAD_SEQUENCES_RE = re.compile(r"(^[_.\-])|([_.\-]$)|([_.\-]{2,})")


def validate_format(username: str) -> tuple[bool, str | None]:
    """Layer 1: structural check.

    Returns (True, None) when the handle is well-formed; (False, reason)
    otherwise. Reasons are user-facing but generic — they describe the
    rule, not the offending character.
    """
    if not username:
        return False, "Username is required"
    if len(username) < 3:
        return False, "Username must be at least 3 characters"
    if len(username) > 20:
        return False, "Username must be at most 20 characters"
    if not _FORMAT_RE.match(username):
        return False, "Username can only contain letters, digits, _, . and -"
    if _BAD_SEQUENCES_RE.search(username):
        return False, "Username cannot start, end, or have consecutive _, . or -"
    return True, None


# --- Layer 2: blocklist + l33t normalization ---

# Common l33t-speak substitutions. Applied AFTER lowercasing + stripping
# non-letters. Kept short — too many substitutions explode the search
# space and start producing false positives.
_LEET_MAP = str.maketrans(
    {
        "0": "o",
        "1": "i",  # also matches `l` words — see "fill" test case
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "8": "b",
        "@": "a",
        "$": "s",
    }
)

# Alt map: `4`/`@` can substitute a vowel that's neither `a` (e.g.
# `f4ck` = `fuck`, `c4nt` = `cunt`). The primary map covers the common
# case; this alt covers the bypass. Both forms are checked against the
# blocklist — if EITHER matches, reject.
_LEET_MAP_ALT = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "u",
        "5": "s",
        "7": "t",
        "8": "b",
        "@": "u",
        "$": "s",
    }
)

_BLOCKLIST_PATH = Path(__file__).resolve().parent.parent / "data" / "username_blocklist.txt"


def _load_blocklist() -> tuple[frozenset[str], frozenset[str]]:
    """Load the blocklist file.

    Returns (substrings, whole_words). Substrings match anywhere in the
    normalized handle; whole_words match only as standalone tokens
    after stripping non-letters.
    """
    substrings: set[str] = set()
    whole_words: set[str] = set()
    if not _BLOCKLIST_PATH.exists():
        return frozenset(), frozenset()
    for raw in _BLOCKLIST_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("*"):
            term = line[1:].strip().lower()
            if term:
                substrings.add(term)
        else:
            whole_words.add(line.lower())
    return frozenset(substrings), frozenset(whole_words)


_SUBSTRINGS, _WHOLE_WORDS = _load_blocklist()


def _normalize(s: str, *, alt: bool = False) -> str:
    """Lowercase, apply l33t, strip non-letters. Keep only [a-z].

    `alt=True` uses the alternate map where `4`/`@` substitute `u`
    instead of `a` — catches the `f4ck` / `c4nt` bypass pattern.
    """
    table = _LEET_MAP_ALT if alt else _LEET_MAP
    s = s.lower().translate(table)
    return "".join(c for c in s if c.isalpha())


def is_clean_username(username: str) -> tuple[bool, str | None]:
    """Layer 2: blocklist check after l33t normalization.

    Returns (True, None) when the handle passes the blocklist;
    (False, generic_reason) otherwise. The reason never reveals the
    matched term — that would let attackers iterate around the gate.
    """
    if not username:
        return False, "Username is required"
    # Try BOTH l33t normalizations and reject if either form matches.
    # Catches the `f4ck` (alt) and `b1gb1te` (primary) bypass patterns
    # without false-positiving on innocent `4`-as-`a` handles.
    normalized_forms = (_normalize(username), _normalize(username, alt=True))

    # Substring slurs match anywhere.
    for term in _SUBSTRINGS:
        if any(term in form for form in normalized_forms):
            return False, "Username contains inappropriate content"

    # Whole-word match: the term IS the normalized handle, OR appears
    # at a token boundary in the original raw string (split on the
    # special chars we allow: . _ -). This avoids "assassin" matching
    # "ass" while still catching "big.bite.420" → "bite".
    if any(form in _WHOLE_WORDS for form in normalized_forms):
        return False, "Username contains inappropriate content"
    tokens = re.split(r"[._\-]", username.lower())
    for tok in tokens:
        if _normalize(tok) in _WHOLE_WORDS or _normalize(tok, alt=True) in _WHOLE_WORDS:
            return False, "Username contains inappropriate content"

    return True, None


def check_username(username: str) -> str:
    """Combined layer 1 + layer 2 check, ValueError on rejection.

    Convenience wrapper for Pydantic validators — raise the error,
    Pydantic surfaces it as a 422 with the message intact.
    """
    ok, err = validate_format(username)
    if not ok:
        raise ValueError(err)
    ok, err = is_clean_username(username)
    if not ok:
        raise ValueError(err)
    return username


def reload_blocklist_for_tests() -> None:
    """Reload the blocklist from disk. Test-only helper for hot-edit cases."""
    global _SUBSTRINGS, _WHOLE_WORDS
    _SUBSTRINGS, _WHOLE_WORDS = _load_blocklist()

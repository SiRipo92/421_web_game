"""G98: single source of truth for the ELO badge ladder.

Until G98, the same thresholds + names + icons were duplicated across
`app/routers/rankings.py`, `frontend/src/utils/badge.js`,
`frontend/src/i18n/index.js` (login marketing copy), and inline in
several React pages. Changing the ladder used to be a 4-file change.

Now: backend reads here, frontend reads the mirrored constants from
`frontend/src/utils/ranks.js`. The login marketing copy on the
auth page reads the same frontend constants instead of hardcoded i18n
strings — so editing this file + its frontend twin is the only change
needed to shift the ladder.

ELO starting value stays at the algorithm-standard 1200. The UI side
suppresses the badge display until `parties_played >= 1` so newly
registered users don't appear as « Amateur » without having earned it.
"""

# Ordered high-to-low so the linear scan in `get_badge` stops at the
# first threshold the score meets. Tuple form so it's immutable.
BADGES: tuple[tuple[int, str, str], ...] = (
    (1700, "Maître", "👑"),
    (1500, "Expert", "🥇"),
    (1300, "Confirmé", "🥈"),
    (1100, "Amateur", "🥉"),
    (0, "Débutant", "🎲"),
)


def get_badge(elo: int, parties_played: int = 1) -> tuple[str, str] | None:
    """Resolve (badge_name, icon) for an ELO score.

    Returns None when `parties_played < 1` — that's the unranked case.
    A newly-registered user has elo=1200 in the DB (the algorithm baseline)
    but hasn't actually earned « Amateur » yet; the UI should render
    « — · Non classé(e) » instead of the badge for these users.

    Callers that don't track parties_played (e.g. raw ELO inspection in
    the admin UI) can omit the second arg to get the historical behavior.
    """
    if parties_played < 1:
        return None
    for threshold, name, icon in BADGES:
        if elo >= threshold:
            return name, icon
    # Defensive — should be unreachable since the last threshold is 0.
    return "Débutant", "🎲"

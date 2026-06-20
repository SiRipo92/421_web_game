"""G98 unit tests for the centralized rank module."""

from app.services.ranks import BADGES, get_badge


def test_unranked_returns_none():
    """parties_played=0 → None regardless of ELO. The user hasn't earned
    a badge yet; the UI renders "—" / "Unranked" instead."""
    assert get_badge(1200, parties_played=0) is None
    assert get_badge(2500, parties_played=0) is None
    assert get_badge(50, parties_played=0) is None


def test_ranked_returns_pair():
    """parties_played≥1 returns (name, icon) for any ELO."""
    assert get_badge(1200, parties_played=1) == ("Amateur", "🥉")
    assert get_badge(2500, parties_played=10) == ("Maître", "👑")
    assert get_badge(0, parties_played=1) == ("Débutant", "🎲")


def test_threshold_boundaries():
    """At each threshold boundary, the next tier kicks in immediately."""
    # 1100 is Amateur (1100 <= ELO < 1300)
    assert get_badge(1100, parties_played=1) == ("Amateur", "🥉")
    assert get_badge(1099, parties_played=1) == ("Débutant", "🎲")
    # 1300 is Confirmé
    assert get_badge(1300, parties_played=1) == ("Confirmé", "🥈")
    assert get_badge(1299, parties_played=1) == ("Amateur", "🥉")
    # 1700 is Maître
    assert get_badge(1700, parties_played=1) == ("Maître", "👑")
    assert get_badge(1699, parties_played=1) == ("Expert", "🥇")


def test_default_parties_played_is_one():
    """Callers that don't track parties_played (admin inspection, etc)
    get the historical behavior — always returns a badge."""
    assert get_badge(1200) == ("Amateur", "🥉")


def test_badges_ordered_high_to_low():
    """Linear-scan correctness depends on descending threshold order."""
    thresholds = [t for t, _, _ in BADGES]
    assert thresholds == sorted(thresholds, reverse=True)
    assert thresholds[-1] == 0  # last bucket must catch everything


def test_badges_last_bucket_is_debutant():
    """The lowest tier must be the catch-all so we never miss a score."""
    _, name, icon = BADGES[-1]
    assert name == "Débutant"
    assert icon == "🎲"

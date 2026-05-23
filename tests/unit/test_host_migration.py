"""Unit tests for host-migration semantics in the leave handler.

The full leave path lives in ws.py inside an async websocket loop and is
hard to exercise in isolation; here we test the *rule* — `min(players, key=joined_at)`
correctly identifies the longest-tenured player even after the initial-roll
sort has reordered the players list.
"""

from datetime import UTC, datetime, timedelta

from app.game.logic import Player


def _player(pid: str, joined_at: datetime) -> Player:
    return Player(id=pid, name=pid, joined_at=joined_at)


def test_longest_tenured_is_min_by_joined_at():
    """min(players, key=joined_at) returns the earliest-joined player."""
    now = datetime.now(UTC)
    players = [
        _player("c", now),
        _player("a", now - timedelta(seconds=30)),
        _player("b", now - timedelta(seconds=10)),
    ]
    longest = min(players, key=lambda p: p.joined_at)
    assert longest.id == "a"


def test_longest_tenured_survives_list_reordering():
    """After the initial-roll sort reshuffles game.players, joined_at still
    identifies the original earliest-joined seat."""
    now = datetime.now(UTC)
    # `a` joined first, but a roll-order sort might have moved them to the back
    a = _player("a", now - timedelta(seconds=60))
    b = _player("b", now - timedelta(seconds=30))
    c = _player("c", now - timedelta(seconds=10))
    reordered = [c, b, a]  # e.g. sorted by initial roll value
    longest = min(reordered, key=lambda p: p.joined_at)
    assert longest.id == "a"


def test_default_joined_at_set_on_construction():
    """A Player created without an explicit joined_at gets the current UTC time."""
    before = datetime.now(UTC)
    p = Player(id="x", name="X")
    after = datetime.now(UTC)
    assert before <= p.joined_at <= after

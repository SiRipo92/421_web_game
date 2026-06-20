"""Integration tests for `app/services/afk_eviction.py:evict_player`.

The pure-function helpers (is_eviction_due, should_send_warning, etc.)
are covered in tests/unit/test_afk_eviction.py. This module covers the
async `evict_player` function which writes to the DB, applies anti-grief
chat-bans, sends email, and broadcasts a WS payload.

Each test sets up a real `Game` in the in-memory registry + a real
`User` in the DB, then asserts the side-effects after `evict_player`
returns.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from app.db.base import AsyncSessionLocal
from app.db.models import GdprAuditLog, PlayerStats, User
from app.game.logic import Game, GamePhase, Player
from app.game.state import games as games_registry
from app.services.afk_eviction import (
    EVICTION_24H_THRESHOLD,
    _apply_anti_grief,
    _recent_evictions_for,
    _send_eviction_email,
    evict_player,
)


def _make_game(player_ids: list[str], user_id_map: dict[str, str | None] | None = None) -> Game:
    """Build a minimal in-memory Game with the given players, register it, return it."""
    game_id = "TEST" + uuid.uuid4().hex[:4].upper()
    g = Game(id=game_id)
    g.phase = GamePhase.CHARGE
    g.host_player_id = player_ids[0]
    user_id_map = user_id_map or {}
    for pid in player_ids:
        p = Player(id=pid, name=f"Player_{pid}")
        # Backdate so elapsed_minutes is non-zero.
        p.afk_started_at = datetime.now(UTC) - timedelta(minutes=12)
        g.players.append(p)
        g.user_ids[pid] = user_id_map.get(pid)
        g.has_avatars[pid] = False
        g.match_losses[pid] = 0
        g.round_points[pid] = 0
        g.manches_played[pid] = 0
        g.manches_lost[pid] = 0
    games_registry[game_id] = g
    return g


async def _register_user(client, make_user, *, opt_in: bool = False) -> tuple[str, str]:
    """Register a user via the API; return (user_id, email). Optionally flips
    email_opt_in on the resulting row."""
    data = make_user()
    if opt_in:
        data["email_opt_in"] = True
    r = await client.post("/auth/register", json=data)
    assert r.status_code == 201
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == data["email"]))).scalar_one()
        return str(user.id), data["email"]


async def test_evict_player_removes_from_game_state(client, make_user):
    """After eviction the player is gone from every Game collection."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1", "p2"], {"p1": user_id})
    player = g.players[0]

    result = await evict_player(g, player)

    assert result["evicted"] is True
    assert result["player_id"] == "p1"
    assert all(p.id != "p1" for p in g.players)
    assert "p1" not in g.user_ids
    assert "p1" not in g.round_points
    assert "p1" not in g.manches_played
    games_registry.pop(g.id, None)


async def test_evict_player_writes_audit_log(client, make_user):
    """The eviction writes a GdprAuditLog row with afk_eviction event_type."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1"], {"p1": user_id})
    player = g.players[0]

    await evict_player(g, player)

    async with AsyncSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(GdprAuditLog).where(
                        GdprAuditLog.user_id == uuid.UUID(user_id),
                        GdprAuditLog.event_type == "afk_eviction",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].metadata_["game_id"] == g.id
        assert rows[0].metadata_["player_name"] == "Player_p1"
        assert rows[0].metadata_["elapsed_minutes"] >= 12
    games_registry.pop(g.id, None)


async def test_evict_player_migrates_host(client, make_user):
    """If the evicted player was the host, host migrates to longest-tenured."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["host_p", "p2"], {"host_p": user_id})
    g.players[1].joined_at = datetime.now(UTC) - timedelta(minutes=5)
    g.players[0].joined_at = datetime.now(UTC) - timedelta(minutes=10)
    # Re-set host since fixture defaults to player_ids[0]
    g.host_player_id = "host_p"

    await evict_player(g, g.players[0])

    assert g.host_player_id == "p2"
    games_registry.pop(g.id, None)


async def test_evict_player_with_no_registered_user(client, make_user):
    """Guest player (user_id_str is None) — eviction still succeeds, no audit
    log row created with a real user FK."""
    g = _make_game(["guest_p"], {"guest_p": None})
    player = g.players[0]

    result = await evict_player(g, player)

    assert result["evicted"] is True
    async with AsyncSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(GdprAuditLog).where(
                        GdprAuditLog.event_type == "afk_eviction",
                        GdprAuditLog.user_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        # At least one row with NULL user_id from this call.
        assert any(r.metadata_.get("game_id") == g.id for r in rows)
    games_registry.pop(g.id, None)


async def test_evict_player_broadcasts_when_broadcaster_given(client, make_user):
    """If a broadcaster callable is passed, it gets called with the eviction payload."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1"], {"p1": user_id})
    broadcaster = AsyncMock()

    await evict_player(g, g.players[0], broadcaster=broadcaster)

    broadcaster.assert_awaited_once()
    args = broadcaster.await_args.args
    assert args[0] == g.id
    payload = args[1]
    assert payload["type"] == "player_evicted_afk"
    assert payload["player_id"] == "p1"
    games_registry.pop(g.id, None)


async def test_evict_player_swallows_broadcaster_errors(client, make_user):
    """Broadcaster failure must not raise — eviction always returns cleanly."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1"], {"p1": user_id})
    broken_broadcaster = AsyncMock(side_effect=RuntimeError("ws gone"))

    result = await evict_player(g, g.players[0], broadcaster=broken_broadcaster)

    assert result["evicted"] is True
    games_registry.pop(g.id, None)


async def test_anti_grief_applies_chat_ban_at_threshold(client, make_user):
    """The (THRESHOLD)th eviction in 24h applies a 24h chat-ban."""
    user_id, _ = await _register_user(client, make_user)
    # Pre-seed THRESHOLD-1 prior evictions in the audit log.
    async with AsyncSessionLocal() as db:
        for _ in range(EVICTION_24H_THRESHOLD - 1):
            db.add(
                GdprAuditLog(
                    user_id=uuid.UUID(user_id),
                    event_type="afk_eviction",
                    metadata_={"game_id": "PRIOR"},
                )
            )
        await db.commit()

    g = _make_game(["p1"], {"p1": user_id})
    result = await evict_player(g, g.players[0])

    assert result["chat_ban_applied_until"] is not None
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        assert user.chat_banned_until is not None
        # Should be ~24h in the future.
        assert user.chat_banned_until > datetime.now(UTC) + timedelta(hours=23)
    games_registry.pop(g.id, None)


async def test_anti_grief_below_threshold_no_chat_ban(client, make_user):
    """Below the threshold → no chat-ban applied, no chat_banned_until set."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1"], {"p1": user_id})

    result = await evict_player(g, g.players[0])

    assert result["chat_ban_applied_until"] is None
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        assert user.chat_banned_until is None
    games_registry.pop(g.id, None)


async def test_anti_grief_extends_existing_ban(client, make_user):
    """If user already has a chat-ban that ends before now+24h, it's extended."""
    user_id, _ = await _register_user(client, make_user)
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        user.chat_banned_until = datetime.now(UTC) + timedelta(hours=1)
        for _ in range(EVICTION_24H_THRESHOLD - 1):
            db.add(
                GdprAuditLog(
                    user_id=uuid.UUID(user_id),
                    event_type="afk_eviction",
                    metadata_={"game_id": "PRIOR"},
                )
            )
        await db.commit()

    g = _make_game(["p1"], {"p1": user_id})
    await evict_player(g, g.players[0])

    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        # Extended from +1h to +24h
        assert user.chat_banned_until > datetime.now(UTC) + timedelta(hours=23)
    games_registry.pop(g.id, None)


async def test_anti_grief_preserves_longer_existing_ban(client, make_user):
    """If existing chat-ban is longer than 24h, it's kept (don't shorten)."""
    user_id, _ = await _register_user(client, make_user)
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        user.chat_banned_until = datetime.now(UTC) + timedelta(days=7)
        for _ in range(EVICTION_24H_THRESHOLD - 1):
            db.add(
                GdprAuditLog(
                    user_id=uuid.UUID(user_id),
                    event_type="afk_eviction",
                    metadata_={"game_id": "PRIOR"},
                )
            )
        await db.commit()

    g = _make_game(["p1"], {"p1": user_id})
    await evict_player(g, g.players[0])

    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        # 7d ban preserved, not truncated to 24h
        assert user.chat_banned_until > datetime.now(UTC) + timedelta(days=6)
    games_registry.pop(g.id, None)


async def test_recent_evictions_count_only_last_24h(client, make_user):
    """The 24h window: an eviction from 25h ago doesn't count toward threshold."""
    user_id, _ = await _register_user(client, make_user)
    async with AsyncSessionLocal() as db:
        # Old eviction (outside window) — manually set occurred_at after insert
        # since occurred_at is server-default now().
        from sqlalchemy import update

        db.add(
            GdprAuditLog(
                user_id=uuid.UUID(user_id),
                event_type="afk_eviction",
                metadata_={"game_id": "OLD"},
            )
        )
        await db.commit()
        # Backdate that row to 25h ago.
        await db.execute(
            update(GdprAuditLog)
            .where(GdprAuditLog.metadata_["game_id"].astext == "OLD")
            .values(occurred_at=datetime.now(UTC) - timedelta(hours=25))
        )
        await db.commit()

        count = await _recent_evictions_for(uuid.UUID(user_id), db)
        assert count == 0


async def test_send_eviction_email_gated_on_opt_in(client, make_user):
    """email_opt_in=False → no Brevo call. opt_in=True → call attempted."""
    async with AsyncSessionLocal() as db:
        user_no = User(
            id=uuid.uuid4(),
            username=f"opt_no_{uuid.uuid4().hex[:6]}",
            email=f"noopt_{uuid.uuid4().hex[:6]}@example.com",
            email_opt_in=False,
            lang_pref="en",
        )
        user_yes = User(
            id=uuid.uuid4(),
            username=f"opt_yes_{uuid.uuid4().hex[:6]}",
            email=f"yesopt_{uuid.uuid4().hex[:6]}@example.com",
            email_opt_in=True,
            lang_pref="en",
        )
        db.add_all([user_no, user_yes])
        await db.commit()
        await db.refresh(user_no)
        await db.refresh(user_yes)

    with pytest.MonkeyPatch.context() as mp:
        sent_calls = []

        def fake_send(**kwargs):
            sent_calls.append(kwargs)

        mp.setattr("app.services.email._send_via_brevo", fake_send)
        await _send_eviction_email(user_no, "GAME1", elapsed_minutes=10)
        assert sent_calls == []
        await _send_eviction_email(user_yes, "GAME2", elapsed_minutes=10)
        assert len(sent_calls) == 1
        assert sent_calls[0]["to_email"] == user_yes.email


async def test_send_eviction_email_swallows_errors(client, make_user):
    """Brevo failure must not raise — eviction must proceed regardless."""
    async with AsyncSessionLocal() as db:
        user = User(
            id=uuid.uuid4(),
            username=f"broken_{uuid.uuid4().hex[:6]}",
            email=f"broken_{uuid.uuid4().hex[:6]}@example.com",
            email_opt_in=True,
            lang_pref="en",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    with pytest.MonkeyPatch.context() as mp:

        def boom(**kwargs):
            raise RuntimeError("brevo down")

        mp.setattr("app.services.email._send_via_brevo", boom)
        # Should not raise.
        await _send_eviction_email(user, "GAMEX", elapsed_minutes=10)


async def test_evict_player_during_charge_persists_stats(client, make_user):
    """When phase is CHARGE/DECHARGE/TIEBREAK, mid-partie stats are persisted
    to PlayerStats before the player is removed."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1"], {"p1": user_id})
    g.phase = GamePhase.DECHARGE
    g.round_points["p1"] = 4
    g.manches_played["p1"] = 3
    g.manches_lost["p1"] = 1

    await evict_player(g, g.players[0])

    async with AsyncSessionLocal() as db:
        stats = await db.get(PlayerStats, uuid.UUID(user_id))
        # PlayerStats should have been touched by persist_player_session.
        assert stats is not None
        # manches_played increments by what the eviction persisted.
        assert stats.manches_played >= 3
    games_registry.pop(g.id, None)


async def test_evict_player_outside_active_phase_skips_persist(client, make_user):
    """If the game is in WAITING / FINISHED, mid-partie stats are NOT persisted —
    the partie either never started or already settled."""
    user_id, _ = await _register_user(client, make_user)
    g = _make_game(["p1"], {"p1": user_id})
    g.phase = GamePhase.WAITING

    # Capture stats before
    async with AsyncSessionLocal() as db:
        stats_before = await db.get(PlayerStats, uuid.UUID(user_id))
        before = stats_before.manches_played if stats_before else 0

    await evict_player(g, g.players[0])

    async with AsyncSessionLocal() as db:
        stats_after = await db.get(PlayerStats, uuid.UUID(user_id))
        after = stats_after.manches_played if stats_after else 0
    assert after == before
    games_registry.pop(g.id, None)


async def test_apply_anti_grief_idempotent_under_threshold(client, make_user):
    """Direct unit-on-helper test: below threshold → returns None, no DB change."""
    user_id, _ = await _register_user(client, make_user)
    async with AsyncSessionLocal() as db:
        user = await db.get(User, uuid.UUID(user_id))
        result = await _apply_anti_grief(user, db)
        await db.commit()
        assert result is None
        assert user.chat_banned_until is None


# Silence "imported but unused" if MagicMock isn't used directly.
_ = MagicMock

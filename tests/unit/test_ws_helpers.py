"""Unit tests for ws.py pure-function helpers: bot logic and JWT resolution."""

import pytest
from jose import jwt

from app.core.config import settings
from app.game.logic import Game, GamePhase, Player, PlayerTurn
from app.game.ws import _bot_take_turn, _resolve_user_from_token, _schedule_afk


class TestBotTakeTurn:
    """Tests for the AFK bot that auto-plays a player's turn."""

    def test_bot_fills_dice(self):
        """After _bot_take_turn all three dice are valid (1–6)."""
        p = Player(id="b1", name="Bot")
        p.turn = PlayerTurn()
        _bot_take_turn(p)
        assert all(1 <= d <= 6 for d in p.turn.dice)

    def test_bot_marks_done(self):
        """The turn is marked done and rolls_left is 0 after bot plays."""
        p = Player(id="b2", name="Bot")
        p.turn = PlayerTurn()
        _bot_take_turn(p)
        assert p.turn.done is True
        assert p.turn.rolls_left == 0

    def test_bot_sets_combo(self):
        """The combo, rank, and fiches fields are populated after bot plays."""
        p = Player(id="b3", name="Bot")
        p.turn = PlayerTurn()
        _bot_take_turn(p)
        assert p.turn.combo != ""
        assert p.turn.rank > 0
        assert p.turn.fiches > 0


class TestScheduleAfkStartedAt:
    """G1: _schedule_afk stamps game.afk_started_at for per-turn phases only."""

    def _make_game(self, phase: GamePhase) -> Game:
        p1 = Player(id="p1", name="Alice")
        p1.turn = PlayerTurn()
        p2 = Player(id="p2", name="Bob")
        p2.turn = PlayerTurn()
        return Game(
            id="TEST1234",
            players=[p1, p2],
            phase=phase,
            current_index=0,
            afk_seconds=45,
            afk_bot=True,
        )

    async def test_charge_phase_stamps_started_at(self):
        """CHARGE → afk_started_at gets a positive epoch-ms timestamp."""
        game = self._make_game(GamePhase.CHARGE)
        _schedule_afk(game, game.id)
        assert game.afk_started_at is not None
        assert game.afk_started_at > 0
        for t in game.afk_tasks.values():
            t.cancel()

    async def test_decharge_phase_stamps_started_at(self):
        game = self._make_game(GamePhase.DECHARGE)
        _schedule_afk(game, game.id)
        assert game.afk_started_at is not None
        for t in game.afk_tasks.values():
            t.cancel()

    async def test_initial_roll_does_not_stamp_started_at(self):
        """INITIAL_ROLL is per-player; the single shared field stays None."""
        game = self._make_game(GamePhase.INITIAL_ROLL)
        _schedule_afk(game, game.id)
        assert game.afk_started_at is None
        for t in game.afk_tasks.values():
            t.cancel()

    async def test_finished_phase_clears_started_at(self):
        game = self._make_game(GamePhase.CHARGE)
        _schedule_afk(game, game.id)
        assert game.afk_started_at is not None
        for t in game.afk_tasks.values():
            t.cancel()
        game.afk_tasks.clear()
        game.phase = GamePhase.FINISHED
        _schedule_afk(game, game.id)
        assert game.afk_started_at is None

    async def test_afk_bot_disabled_clears_started_at(self):
        game = self._make_game(GamePhase.CHARGE)
        _schedule_afk(game, game.id)
        for t in game.afk_tasks.values():
            t.cancel()
        game.afk_tasks.clear()
        game.afk_bot = False
        _schedule_afk(game, game.id)
        assert game.afk_started_at is None


class TestResolveUserFromToken:
    """Tests for async JWT decoding used by WS endpoints."""

    @pytest.mark.asyncio
    async def test_valid_token_returns_subject(self):
        """A well-formed JWT returns the 'sub' claim."""
        token = jwt.encode({"sub": "user-uuid-123"}, settings.secret_key, algorithm="HS256")
        result = await _resolve_user_from_token(token)
        assert result == "user-uuid-123"

    @pytest.mark.asyncio
    async def test_invalid_token_returns_none(self):
        """A garbage token string returns None."""
        result = await _resolve_user_from_token("not-a-jwt")
        assert result is None

    @pytest.mark.asyncio
    async def test_none_token_returns_none(self):
        """Passing None (no token) returns None without raising."""
        result = await _resolve_user_from_token(None)
        assert result is None

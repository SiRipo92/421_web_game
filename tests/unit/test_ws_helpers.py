"""Unit tests for ws.py pure-function helpers: bot logic and JWT resolution."""

import pytest
from jose import jwt

from app.core.config import settings
from app.game.logic import Player, PlayerTurn
from app.game.ws import _bot_take_turn, _resolve_user_from_token


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

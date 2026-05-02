"""Unit tests for ConnectionManager: connect, disconnect, broadcast, spectators."""

from unittest.mock import AsyncMock, MagicMock

from app.game.logic import Game
from app.game.ws import ConnectionManager, _cancel_afk


def _ws() -> AsyncMock:
    """Return a mock WebSocket with an async send_json and accept."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


class TestConnectionManager:
    """Tests for player and spectator registration and broadcast."""

    async def test_connect_accepts_and_registers(self):
        """connect() calls ws.accept() and adds the connection."""
        cm = ConnectionManager()
        ws = _ws()
        await cm.connect("G1", ws, "p1")
        ws.accept.assert_called_once()
        assert (ws, "p1") in cm.connections["G1"]

    async def test_connect_spectator(self):
        """connect_spectator() calls ws.accept() and registers the spectator."""
        cm = ConnectionManager()
        ws = _ws()
        await cm.connect_spectator("G1", ws)
        ws.accept.assert_called_once()
        assert ws in cm.spectators["G1"]

    async def test_disconnect_removes_player(self):
        """disconnect() removes the matching WebSocket from connections."""
        cm = ConnectionManager()
        ws = _ws()
        await cm.connect("G1", ws, "p1")
        cm.disconnect("G1", ws)
        assert ws not in [w for w, _ in cm.connections.get("G1", [])]

    async def test_disconnect_spectator_removes_entry(self):
        """disconnect_spectator() removes the matching WebSocket."""
        cm = ConnectionManager()
        ws = _ws()
        await cm.connect_spectator("G1", ws)
        cm.disconnect_spectator("G1", ws)
        assert ws not in cm.spectators.get("G1", [])

    async def test_spectator_count(self):
        """spectator_count() returns the number of connected spectators."""
        cm = ConnectionManager()
        ws1, ws2 = _ws(), _ws()
        await cm.connect_spectator("G1", ws1)
        await cm.connect_spectator("G1", ws2)
        assert cm.spectator_count("G1") == 2

    async def test_broadcast_sends_to_players_and_spectators(self):
        """broadcast() sends the payload to every player and spectator."""
        cm = ConnectionManager()
        pw = _ws()
        sw = _ws()
        await cm.connect("G1", pw, "p1")
        await cm.connect_spectator("G1", sw)
        await cm.broadcast("G1", {"type": "state"})
        pw.send_json.assert_called_once_with({"type": "state"})
        sw.send_json.assert_called_once_with({"type": "state"})

    async def test_broadcast_swallows_send_errors(self):
        """broadcast() continues when a client's send_json raises."""
        cm = ConnectionManager()
        bad_ws = _ws()
        bad_ws.send_json.side_effect = RuntimeError("disconnected")
        await cm.connect("G1", bad_ws, "p1")
        # Should not raise
        await cm.broadcast("G1", {"type": "state"})


class TestCancelAfk:
    """Tests for _cancel_afk helper."""

    def test_cancel_removes_and_cancels_task(self):
        """_cancel_afk cancels the asyncio Task and removes it from afk_tasks."""
        game = Game(id="X")
        mock_task = MagicMock()
        game.afk_tasks["p1"] = mock_task
        _cancel_afk(game, "p1")
        mock_task.cancel.assert_called_once()
        assert "p1" not in game.afk_tasks

    def test_cancel_noop_when_no_task(self):
        """_cancel_afk is a no-op when no task exists for the player."""
        game = Game(id="X")
        _cancel_afk(game, "nobody")  # should not raise

"""In-memory game registry; keyed by short game ID."""

from app.game.logic import Game

games: dict[str, Game] = {}

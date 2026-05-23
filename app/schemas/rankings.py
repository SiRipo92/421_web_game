"""Pydantic response schemas for rankings and profile endpoints."""

from pydantic import BaseModel


class PlayerRank(BaseModel):
    """One row in the leaderboard: ELO, stats, and badge."""

    username: str
    elo: int
    games_played: int
    wins: int
    losses: int
    badge: str
    badge_icon: str


class RankingsResponse(BaseModel):
    """Paginated (top-50) leaderboard response."""

    players: list[PlayerRank]


class GameHistoryEntry(BaseModel):
    """One completed game in a player's recent history."""

    game_code: str
    played_at: str
    placement: int
    total_players: int
    final_tokens: int
    round_points: int
    total_rounds: int


class ProfileResponse(BaseModel):
    """Full player profile: stats, badge, and recent games."""

    username: str
    elo: int
    badge: str
    badge_icon: str
    games_played: int
    wins: int
    losses: int
    recent_games: list[GameHistoryEntry]

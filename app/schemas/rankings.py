"""Pydantic response schemas for rankings and profile endpoints.

G91: partie/manche semantics — `wins` and `losses` were retired in favor of
`parties_survived` / `parties_lost`. Survival rate and manche resilience are
derived server-side so the frontend renders consistent numbers.
"""

from pydantic import BaseModel


class PlayerRank(BaseModel):
    """One row in the leaderboard: ELO, stats, and badge."""

    username: str
    elo: int
    games_played: int
    parties_survived: int
    parties_lost: int
    survival_rate: float  # parties_survived / max(games_played, 1)
    badge: str
    badge_icon: str


class RankingsResponse(BaseModel):
    """Paginated (top-50) leaderboard response."""

    players: list[PlayerRank]


class GameHistoryEntry(BaseModel):
    """One completed partie in a player's recent history."""

    game_code: str
    partie_number: int
    played_at: str
    placement: int
    total_players: int
    final_tokens: int
    round_points: int
    total_rounds: int


class ProfileResponse(BaseModel):
    """Full player profile: stats, badge, and recent parties."""

    username: str
    elo: int
    badge: str
    badge_icon: str
    games_played: int
    parties_survived: int
    parties_lost: int
    survival_rate: float
    manches_played: int
    manches_lost: int
    manche_resilience: float  # 1 - (manches_lost / max(manches_played, 1))
    current_streak: int
    longest_streak: int
    recent_games: list[GameHistoryEntry]

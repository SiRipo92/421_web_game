"""Pydantic response schemas for rankings and profile endpoints.

G91: partie/manche semantics — `wins` and `losses` were retired in favor of
`parties_survived` / `parties_lost`. Survival rate and manche resilience are
derived server-side so the frontend renders consistent numbers.
"""

from typing import Optional

from pydantic import BaseModel


class PlayerRank(BaseModel):
    """One row in the leaderboard: ELO, stats, and badge.

    G98: `badge` / `badge_icon` are nullable for the unranked case
    (parties_played == 0), though the /api/rankings endpoint filters
    those out so listed rows always have a badge in practice.
    """

    username: str
    elo: int
    games_played: int
    parties_survived: int
    parties_lost: int
    survival_rate: float  # parties_survived / max(games_played, 1)
    badge: Optional[str]
    badge_icon: Optional[str]


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
    """Full player profile: stats, badge, and recent parties.

    G98: `badge` / `badge_icon` are None when the user is unranked
    (parties_played == 0). Frontend renders « — · Non classé(e) ».
    """

    username: str
    elo: int
    badge: Optional[str]
    badge_icon: Optional[str]
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

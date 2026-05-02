from pydantic import BaseModel


class PlayerRank(BaseModel):
    username: str
    elo: int
    games_played: int
    wins: int
    losses: int
    badge: str
    badge_icon: str


class RankingsResponse(BaseModel):
    players: list[PlayerRank]


class GameHistoryEntry(BaseModel):
    game_code: str
    played_at: str
    placement: int
    total_players: int
    final_tokens: int
    sets_lost: int
    total_rounds: int


class ProfileResponse(BaseModel):
    username: str
    elo: int
    badge: str
    badge_icon: str
    games_played: int
    wins: int
    losses: int
    recent_games: list[GameHistoryEntry]

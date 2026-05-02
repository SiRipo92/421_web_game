from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.db.models import GamePlayer, Game as GameRecord, PlayerStats, User
from app.schemas.rankings import GameHistoryEntry, PlayerRank, ProfileResponse, RankingsResponse

router = APIRouter(tags=["rankings"])

BADGES = [
    (1700, "Maître",    "👑"),
    (1500, "Expert",    "🥇"),
    (1300, "Confirmé",  "🥈"),
    (1100, "Amateur",   "🥉"),
    (0,    "Débutant",  "🎲"),
]


def get_badge(elo: int) -> tuple[str, str]:
    for threshold, name, icon in BADGES:
        if elo >= threshold:
            return name, icon
    return "Débutant", "🎲"


@router.get("/api/rankings", response_model=RankingsResponse)
async def rankings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlayerStats, User.username)
        .join(User, User.id == PlayerStats.user_id)
        .where(User.deleted_at.is_(None))
        .order_by(PlayerStats.elo.desc())
        .limit(50)
    )
    players = []
    for stats, username in result:
        badge, icon = get_badge(stats.elo)
        players.append(PlayerRank(
            username=username,
            elo=stats.elo,
            games_played=stats.games_played,
            wins=stats.wins,
            losses=stats.losses,
            badge=badge,
            badge_icon=icon,
        ))
    return RankingsResponse(players=players)


@router.get("/api/profile/{username}", response_model=ProfileResponse)
async def profile(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == username, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stats_result = await db.execute(
        select(PlayerStats).where(PlayerStats.user_id == user.id)
    )
    stats = stats_result.scalar_one_or_none()
    if not stats:
        raise HTTPException(status_code=404, detail="Stats not found")

    # Recent games
    gp_result = await db.execute(
        select(GamePlayer, GameRecord)
        .join(GameRecord, GameRecord.id == GamePlayer.game_id)
        .where(GamePlayer.user_id == user.id)
        .order_by(GameRecord.finished_at.desc())
        .limit(20)
    )
    recent = []
    for gp, game_rec in gp_result:
        # Count total players in that game
        count_result = await db.execute(
            select(GamePlayer).where(GamePlayer.game_id == game_rec.id)
        )
        total = len(count_result.scalars().all())
        recent.append(GameHistoryEntry(
            game_code=game_rec.game_code,
            played_at=game_rec.finished_at.isoformat(),
            placement=gp.placement,
            total_players=total,
            final_tokens=gp.final_tokens,
            sets_lost=gp.sets_lost,
            total_rounds=game_rec.total_rounds,
        ))

    badge, icon = get_badge(stats.elo)
    return ProfileResponse(
        username=user.username,
        elo=stats.elo,
        badge=badge,
        badge_icon=icon,
        games_played=stats.games_played,
        wins=stats.wins,
        losses=stats.losses,
        recent_games=recent,
    )

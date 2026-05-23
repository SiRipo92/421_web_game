"""Admin / moderator endpoints (G38 foundation).

Endpoints here are gated by `require_moderator` (or `require_admin` for
the sharper actions). The dashboard summary is intentionally minimal —
just the counts the placeholder dashboard panels need today. Subsequent
PRs (G39 inbox, G40 strike engine, G41 room-ban uphold, G42 login gate)
extend this surface with the actual moderation actions.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin, require_moderator
from app.db.base import get_db
from app.db.models import GdprAuditLog, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard-summary")
async def dashboard_summary(
    _: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Counts to wire the placeholder dashboard panels.

    The actual moderation surfaces (inbox, strikes, room bans) land in
    G39 / G40 / G41 — for now the counts are computed against the User
    table directly so the dashboard has something live to render.
    """
    now = datetime.now(UTC)

    total_users_row = await db.execute(select(func.count(User.id)).where(User.deleted_at.is_(None)))
    total_users = total_users_row.scalar() or 0

    active_account_bans_row = await db.execute(
        select(func.count(User.id)).where(
            User.deleted_at.is_(None),
            User.banned_until.is_not(None),
            User.banned_until > now,
        )
    )
    active_account_bans = active_account_bans_row.scalar() or 0

    active_chat_bans_row = await db.execute(
        select(func.count(User.id)).where(
            User.deleted_at.is_(None),
            User.chat_banned_until.is_not(None),
            User.chat_banned_until > now,
        )
    )
    active_chat_bans = active_chat_bans_row.scalar() or 0

    active_strikes_row = await db.execute(
        select(func.count(User.id)).where(
            User.deleted_at.is_(None),
            User.strike_count > 0,
        )
    )
    active_strikes = active_strikes_row.scalar() or 0

    return {
        "total_users": total_users,
        "active_account_bans": active_account_bans,
        "active_chat_bans": active_chat_bans,
        "users_with_strikes": active_strikes,
        # Placeholders until G39 lands the ModerationInboxItem table.
        "pending_inbox_items": 0,
        "appeals_awaiting_review": 0,
    }


@router.patch("/users/{user_id}/role", status_code=200)
async def update_user_role(
    user_id: str,
    new_role: str,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Promote / demote a user's role. Admin-only. Audited."""
    if new_role not in ("player", "moderator", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")

    import uuid as _uuid

    try:
        target_uuid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    target = await db.get(User, target_uuid)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    previous = target.role
    target.role = new_role
    db.add(
        GdprAuditLog(
            user_id=target.id,
            event_type="role_changed",
            metadata_={"from": previous, "to": new_role, "by": str(actor.id)},
        )
    )
    await db.commit()
    return {"user_id": str(target.id), "role": target.role, "previous": previous}

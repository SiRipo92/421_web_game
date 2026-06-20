"""Admin / moderator endpoints (G38 foundation + G90 dashboard rebuild).

Endpoints here are gated by `require_moderator` (or `require_admin` for the
sharper actions: role change, account delete). All write paths fire a
`GdprAuditLog` entry so the audit feed can reconstruct who did what.

Audit event types this router emits:
  - role_changed
  - account_banned / account_unbanned
  - chat_banned / chat_unbanned
  - account_deleted_by_admin
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin, require_moderator
from app.db.base import get_db
from app.db.models import GdprAuditLog, PlayerStats, User
from app.schemas.admin import (
    AdminAuditEntry,
    AdminAuditListResponse,
    AdminBanState,
    AdminDashboardSummary,
    AdminStatsBlock,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserRow,
    BanRequest,
    ChatBanRequest,
    DeleteAccountRequest,
)
from app.services.email import _send_via_brevo, render_email

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Online proxy window: a user is "online" if last_seen_at < 5 minutes old.
# Matches _LAST_SEEN_REFRESH_SECONDS in core/security.py.
ONLINE_WINDOW_SECONDS = 300

# Audit events surfaced in the dashboard "recent admin actions" feed.
_MOD_AUDIT_EVENTS = frozenset(
    {
        "role_changed",
        "account_banned",
        "account_unbanned",
        "chat_banned",
        "chat_unbanned",
        "account_deleted_by_admin",
    }
)


# ---------------- helpers ----------------


def _parse_uuid(s: str) -> uuid.UUID:
    """Convert string → UUID, 400 on bad format."""
    try:
        return uuid.UUID(s)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid user_id") from exc


def _user_status(u: User, now: datetime) -> str:
    """Derived status label for the admin list."""
    if u.deleted_at is not None:
        return "deleted"
    if u.banned_until and u.banned_until > now:
        return "banned"
    if u.chat_banned_until and u.chat_banned_until > now:
        return "chat_banned"
    return "active"


def _parse_account_ban_until(duration: str, now: datetime) -> Optional[datetime]:
    """Translate ban duration string → datetime (None = permanent)."""
    mapping = {"1d": 1, "7d": 7, "30d": 30}
    if duration == "permanent":
        # Permanent ban encoded as ~100 years in the future. Cleaner than
        # nullable + a separate "is_permanent" flag; UI translates the
        # far-future date back to "permanent" for display.
        return now + timedelta(days=365 * 100)
    if duration in mapping:
        return now + timedelta(days=mapping[duration])
    # Allow explicit ISO timestamp for future moderator workflows.
    try:
        parsed = datetime.fromisoformat(duration.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid duration: {duration}") from exc


def _parse_chat_ban_until(duration: str, now: datetime) -> datetime:
    """Translate chat-ban duration string → datetime. No permanent option."""
    mapping = {"1h": timedelta(hours=1), "24h": timedelta(hours=24), "7d": timedelta(days=7)}
    if duration not in mapping:
        raise HTTPException(status_code=400, detail=f"Invalid chat-ban duration: {duration}")
    return now + mapping[duration]


async def _send_ban_notice_safe(user: User, reason_label: str, until: Optional[datetime]) -> None:
    """Best-effort ban-notice email. Failures logged, never raised — the
    ban itself must succeed regardless of email delivery."""
    import logging

    logger = logging.getLogger(__name__)
    fr = user.lang_pref == "fr"
    try:
        if until is None or until.year > 2100:
            duration_label = "permanente" if fr else "permanent"
            expires_label = "—"
        else:
            fmt = "%d/%m/%Y" if fr else "%b %d, %Y"
            duration_label = until.strftime(fmt)
            expires_label = duration_label
        default_reason = "violation des règles" if fr else "rule violation"
        from app.core.config import settings

        appeal_url = f"{settings.app_url.rstrip('/')}/contact?subject=appeal"
        subject, html, text = render_email(
            "ban_notice",
            user.lang_pref,
            username=user.username,
            reason_label=reason_label or default_reason,
            duration_label=duration_label,
            expires_at_label=expires_label,
            case_id=None,
            evidence_summary=None,
            appeal_url=appeal_url,
        )
        _send_via_brevo(
            to_email=user.email, to_name=user.username, subject=subject, html=html, text=text
        )
    except Exception:
        logger.exception("Failed to send ban_notice email to %s", user.email)


# ---------------- existing endpoints ----------------


@router.get("/dashboard-summary", response_model=AdminDashboardSummary)
async def dashboard_summary(
    _: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Header counts + recent-actions feed for the admin landing page."""
    now = datetime.now(UTC)
    online_cutoff = now - timedelta(seconds=ONLINE_WINDOW_SECONDS)

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

    online_row = await db.execute(
        select(func.count(User.id)).where(
            User.deleted_at.is_(None),
            User.last_seen_at.is_not(None),
            User.last_seen_at > online_cutoff,
        )
    )
    online_count = online_row.scalar() or 0

    # G90 follow-up: only include the last 7 days of admin actions, and
    # exclude `role_changed` — those usually represent infrastructure
    # setup (you promoting yourself once) rather than actionable
    # moderation. Surface only the high-signal events on the dashboard.
    recent_cutoff = now - timedelta(days=7)
    interesting_events = _MOD_AUDIT_EVENTS - {"role_changed"}
    recent_row = await db.execute(
        select(GdprAuditLog)
        .where(
            GdprAuditLog.event_type.in_(interesting_events),
            GdprAuditLog.occurred_at >= recent_cutoff,
        )
        .order_by(desc(GdprAuditLog.occurred_at))
        .limit(5)
    )
    recent = [_audit_entry(e) for e in recent_row.scalars()]

    return AdminDashboardSummary(
        total_users=total_users,
        active_account_bans=active_account_bans,
        active_chat_bans=active_chat_bans,
        users_with_strikes=active_strikes,
        online_count=online_count,
        pending_inbox_items=0,  # G39 placeholder
        appeals_awaiting_review=0,  # G81 placeholder
        recent_admin_actions=recent,
    )


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

    target_uuid = _parse_uuid(user_id)
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


@router.get("/games/{game_id}/bot-decisions")
async def get_bot_decisions(
    game_id: str,
    _: User = Depends(require_moderator),
):
    """G55: per-throw AFK bot decision trace for a live game. Unchanged from G55."""
    from app.game.state import games

    game = games.get(game_id.upper())
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return {
        "game_id": game.id,
        "decisions": list(game.bot_decisions),
        "count": len(game.bot_decisions),
    }


# ---------------- G90 user list + detail ----------------


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    q: Optional[str] = Query(None, description="Search by email OR username (partial)"),
    role: Optional[str] = Query(None, description="player | moderator | admin"),
    status: Optional[str] = Query(None, description="active | banned | chat_banned | deleted"),
    online: bool = Query(False, description="Filter to users seen in the last 5 minutes"),
    sort: str = Query("created_at_desc", description="sort key, suffix _desc to reverse"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    _: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Paginated, filterable user list — the core admin browsing surface."""
    now = datetime.now(UTC)
    online_cutoff = now - timedelta(seconds=ONLINE_WINDOW_SECONDS)

    # Build the filter list once; reuse for count + page query.
    filters = []
    if q:
        like = f"%{q.lower()}%"
        filters.append(or_(func.lower(User.username).like(like), func.lower(User.email).like(like)))
    if role:
        if role not in ("player", "moderator", "admin"):
            raise HTTPException(status_code=400, detail="Invalid role filter")
        filters.append(User.role == role)
    if status == "deleted":
        filters.append(User.deleted_at.is_not(None))
    else:
        filters.append(User.deleted_at.is_(None))
        if status == "banned":
            filters.append(User.banned_until.is_not(None))
            filters.append(User.banned_until > now)
        elif status == "chat_banned":
            filters.append(User.chat_banned_until.is_not(None))
            filters.append(User.chat_banned_until > now)
        elif status == "active":
            # Active = not banned and not chat-banned
            filters.append(or_(User.banned_until.is_(None), User.banned_until <= now))
            filters.append(or_(User.chat_banned_until.is_(None), User.chat_banned_until <= now))
        elif status is not None:
            raise HTTPException(status_code=400, detail="Invalid status filter")
    if online:
        filters.append(User.last_seen_at.is_not(None))
        filters.append(User.last_seen_at > online_cutoff)

    # Sort key resolution. _desc suffix flips direction.
    sort_key = sort.removesuffix("_desc")
    is_desc = sort.endswith("_desc")
    sort_col_map = {
        "created_at": User.created_at,
        "username": User.username,
        "email": User.email,
        "last_seen_at": User.last_seen_at,
        "elo": PlayerStats.elo,
    }
    if sort_key not in sort_col_map:
        raise HTTPException(status_code=400, detail=f"Invalid sort key: {sort_key}")
    sort_col = sort_col_map[sort_key]
    order = desc(sort_col) if is_desc else sort_col

    # Total count
    count_query = select(func.count(User.id)).where(*filters)
    if sort_key == "elo":
        # PlayerStats join needed even for count when filtering/sorting by elo
        count_query = count_query.join(PlayerStats, PlayerStats.user_id == User.id)
    total_row = await db.execute(count_query)
    total = total_row.scalar() or 0

    # Page query — always join PlayerStats so we can return elo + parties_played
    # in the row payload.
    page_query = (
        select(User, PlayerStats)
        .outerjoin(PlayerStats, PlayerStats.user_id == User.id)
        .where(*filters)
        .order_by(order)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    page_result = await db.execute(page_query)
    rows: list[AdminUserRow] = []
    for u, stats in page_result.all():
        rows.append(
            AdminUserRow(
                id=str(u.id),
                username=u.username,
                email=u.email,
                role=u.role,
                status=_user_status(u, now),
                parties_played=stats.games_played if stats else 0,
                elo=stats.elo if stats else 1200,
                last_seen_at=u.last_seen_at.isoformat() if u.last_seen_at else None,
                created_at=u.created_at.isoformat(),
            )
        )

    return AdminUserListResponse(
        users=rows,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )


def _audit_entry(e: GdprAuditLog) -> AdminAuditEntry:
    return AdminAuditEntry(
        id=str(e.id),
        event_type=e.event_type,
        occurred_at=e.occurred_at.isoformat(),
        user_id=str(e.user_id) if e.user_id else None,
        metadata=e.metadata_,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: str,
    _: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Full profile + stats + moderation history + audit log for one user."""
    target_uuid = _parse_uuid(user_id)
    user = await db.get(User, target_uuid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    stats_row = await db.execute(select(PlayerStats).where(PlayerStats.user_id == user.id))
    stats = stats_row.scalar_one_or_none()
    stats_block = None
    if stats is not None:
        stats_block = AdminStatsBlock(
            elo=stats.elo,
            games_played=stats.games_played,
            parties_survived=stats.parties_survived,
            parties_lost=stats.parties_lost,
            manches_played=stats.manches_played,
            manches_lost=stats.manches_lost,
            current_streak=stats.current_streak,
            longest_streak=stats.longest_streak,
        )

    # Last 50 audit-log entries for this user, reverse chrono
    audit_row = await db.execute(
        select(GdprAuditLog)
        .where(GdprAuditLog.user_id == user.id)
        .order_by(desc(GdprAuditLog.occurred_at))
        .limit(50)
    )
    audit_log = [_audit_entry(e) for e in audit_row.scalars()]

    ban_state = AdminBanState(
        account_until=user.banned_until.isoformat() if user.banned_until else None,
        account_reason=user.ban_reason,
        chat_until=user.chat_banned_until.isoformat() if user.chat_banned_until else None,
        strike_count=user.strike_count,
    )

    return AdminUserDetail(
        id=str(user.id),
        username=user.username,
        email=user.email,
        birthdate=user.birthdate.isoformat() if user.birthdate else None,
        lang_pref=user.lang_pref,
        theme_pref=user.theme_pref,
        email_opt_in=user.email_opt_in,
        role=user.role,
        created_at=user.created_at.isoformat(),
        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
        deleted_at=user.deleted_at.isoformat() if user.deleted_at else None,
        deletion_requested_at=user.deletion_requested_at.isoformat()
        if user.deletion_requested_at
        else None,
        has_avatar=user.avatar_data is not None,
        ban=ban_state,
        stats=stats_block,
        audit_log=audit_log,
    )


# ---------------- G90 moderation actions ----------------


@router.post("/users/{user_id}/ban", status_code=200)
async def ban_user(
    user_id: str,
    body: BanRequest,
    actor: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Set User.banned_until + ban_reason. Fires ban_notice email. Audited."""
    target_uuid = _parse_uuid(user_id)
    target = await db.get(User, target_uuid)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "admin" and actor.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot ban an admin")

    now = datetime.now(UTC)
    until = _parse_account_ban_until(body.duration, now)
    previous_until = target.banned_until
    previous_reason = target.ban_reason
    target.banned_until = until
    target.ban_reason = (body.reason or "rule_violation")[:64]
    db.add(
        GdprAuditLog(
            user_id=target.id,
            event_type="account_banned",
            metadata_={
                "by": str(actor.id),
                "duration": body.duration,
                "reason": body.reason,
                "until": until.isoformat() if until else None,
                "previous_until": previous_until.isoformat() if previous_until else None,
                "previous_reason": previous_reason,
            },
        )
    )
    await db.commit()

    await _send_ban_notice_safe(target, body.reason or "rule_violation", until)

    return {
        "user_id": str(target.id),
        "banned_until": target.banned_until.isoformat() if target.banned_until else None,
        "reason": target.ban_reason,
    }


@router.delete("/users/{user_id}/ban", status_code=200)
async def unban_user(
    user_id: str,
    actor: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Clear User.banned_until + ban_reason. Audited.

    No "ban lifted" email in this PR — captured as a follow-up to G81's
    appeal flow. For now the user discovers the unban on next login attempt.
    """
    target_uuid = _parse_uuid(user_id)
    target = await db.get(User, target_uuid)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    previous_until = target.banned_until
    previous_reason = target.ban_reason
    target.banned_until = None
    target.ban_reason = None
    db.add(
        GdprAuditLog(
            user_id=target.id,
            event_type="account_unbanned",
            metadata_={
                "by": str(actor.id),
                "previous_until": previous_until.isoformat() if previous_until else None,
                "previous_reason": previous_reason,
            },
        )
    )
    await db.commit()
    return {"user_id": str(target.id), "banned_until": None}


@router.post("/users/{user_id}/chat-ban", status_code=200)
async def chat_ban_user(
    user_id: str,
    body: ChatBanRequest,
    actor: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Set User.chat_banned_until. Audited. No email in v1."""
    target_uuid = _parse_uuid(user_id)
    target = await db.get(User, target_uuid)
    if target is None or target.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.now(UTC)
    until = _parse_chat_ban_until(body.duration, now)
    previous = target.chat_banned_until
    target.chat_banned_until = until
    db.add(
        GdprAuditLog(
            user_id=target.id,
            event_type="chat_banned",
            metadata_={
                "by": str(actor.id),
                "duration": body.duration,
                "reason": body.reason,
                "until": until.isoformat(),
                "previous_until": previous.isoformat() if previous else None,
            },
        )
    )
    await db.commit()
    return {"user_id": str(target.id), "chat_banned_until": until.isoformat()}


@router.delete("/users/{user_id}/chat-ban", status_code=200)
async def chat_unban_user(
    user_id: str,
    actor: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Clear chat_banned_until. Audited."""
    target_uuid = _parse_uuid(user_id)
    target = await db.get(User, target_uuid)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    previous = target.chat_banned_until
    target.chat_banned_until = None
    db.add(
        GdprAuditLog(
            user_id=target.id,
            event_type="chat_unbanned",
            metadata_={
                "by": str(actor.id),
                "previous_until": previous.isoformat() if previous else None,
            },
        )
    )
    await db.commit()
    return {"user_id": str(target.id), "chat_banned_until": None}


@router.delete("/users/{user_id}", status_code=200)
async def delete_user(
    user_id: str,
    body: DeleteAccountRequest,
    actor: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-initiated soft-delete (GDPR right of erasure).

    Two-layer safety: frontend modal forces type-username-to-confirm, server
    re-verifies in case of curl/replay. Fires `account_deleted` email BEFORE
    PII anonymization so the recipient still has a valid address.

    Soft-delete semantics: deleted_at = now(); username + email anonymized
    so they can't be re-discovered or block re-registration. The row stays
    30 days for accidental-undo, then the [[G70]] cron hard-deletes.
    """
    target_uuid = _parse_uuid(user_id)
    target = await db.get(User, target_uuid)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.deleted_at is not None:
        raise HTTPException(status_code=400, detail="User already deleted")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account via admin")
    if body.confirm_username != target.username:
        raise HTTPException(
            status_code=400,
            detail="confirm_username does not match target username",
        )

    # Fire the account_deleted email before anonymizing — the recipient
    # needs a valid From + a personalized greeting. Failure is logged
    # inside the helper; deletion proceeds regardless.
    await _send_account_deleted_safe(target)

    now = datetime.now(UTC)
    original_username = target.username
    target.deleted_at = now
    # Anonymize PII immediately to prevent leaks via search / username
    # collision. The hard-delete cron clears the row entirely later.
    anon_suffix = str(target.id)[:8]
    target.username = f"deleted_user_{anon_suffix}"
    target.email = f"deleted_{anon_suffix}@deleted.invalid"
    target.hashed_password = None
    target.google_id = None
    target.avatar_data = None
    target.avatar_content_type = None
    db.add(
        GdprAuditLog(
            user_id=target.id,
            event_type="account_deleted_by_admin",
            metadata_={
                "by": str(actor.id),
                "original_username": original_username,
                # Email NOT logged — admin deletions of accounts are
                # RGPD-sensitive; the audit log only needs the WHO did the
                # action + the username (which is shown to mods anyway).
            },
        )
    )
    await db.commit()
    return {"user_id": str(target.id), "deleted_at": now.isoformat()}


async def _send_account_deleted_safe(user: User) -> None:
    """Best-effort account_deleted email fired before PII anonymization."""
    import logging

    logger = logging.getLogger(__name__)
    try:
        # Reuse the account_deletion_warning template for now — the
        # `account_deleted` (final) template lands with G83.
        subject, html, text = render_email(
            "account_deletion_warning",
            user.lang_pref,
            username=user.username,
            inactive_years=0,
            deletion_date_label=datetime.now(UTC).strftime("%d/%m/%Y"),
            keep_active_url=f"{render_email.__globals__['settings'].app_url.rstrip('/')}/contact",
        )
        _send_via_brevo(
            to_email=user.email, to_name=user.username, subject=subject, html=html, text=text
        )
    except Exception:
        logger.exception("Failed to send account_deleted email to %s", user.email)


# ---------------- G90 audit feed ----------------


@router.get("/audit", response_model=AdminAuditListResponse)
async def audit_feed(
    event_type: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None, description="Filter to entries authored by this admin"),
    target_user_id: Optional[str] = Query(None, description="Filter to entries about this user"),
    from_date: Optional[str] = Query(None, description="ISO-8601 lower bound (inclusive)"),
    to_date: Optional[str] = Query(None, description="ISO-8601 upper bound (exclusive)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _: User = Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Reverse-chronological moderation + GDPR audit feed.

    By default we exclude the chatty `account_created` and
    `account_created_google` events — they dominate the feed and aren't
    actionable. Admin can opt in by filtering `event_type=account_created`
    explicitly.
    """
    filters = []
    if event_type:
        filters.append(GdprAuditLog.event_type == event_type)
    else:
        filters.append(
            GdprAuditLog.event_type.notin_(("account_created", "account_created_google"))
        )
    if target_user_id:
        filters.append(GdprAuditLog.user_id == _parse_uuid(target_user_id))
    if actor_id:
        # actor lives inside metadata.by — filter via JSONB.
        filters.append(GdprAuditLog.metadata_["by"].astext == actor_id)
    if from_date:
        try:
            filters.append(GdprAuditLog.occurred_at >= datetime.fromisoformat(from_date))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid from_date") from exc
    if to_date:
        try:
            filters.append(GdprAuditLog.occurred_at < datetime.fromisoformat(to_date))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid to_date") from exc

    total_row = await db.execute(select(func.count(GdprAuditLog.id)).where(*filters))
    total = total_row.scalar() or 0

    page_row = await db.execute(
        select(GdprAuditLog)
        .where(*filters)
        .order_by(desc(GdprAuditLog.occurred_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    entries = [_audit_entry(e) for e in page_row.scalars()]

    return AdminAuditListResponse(
        entries=entries,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )

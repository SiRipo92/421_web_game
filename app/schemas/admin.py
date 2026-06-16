"""Pydantic schemas for admin dashboard endpoints (G90)."""

from typing import Optional

from pydantic import BaseModel


class AdminUserRow(BaseModel):
    """One row in the paginated admin user list."""

    id: str
    username: str
    email: str
    role: str
    status: str  # 'active' | 'banned' | 'chat_banned' | 'deleted'
    parties_played: int
    elo: int
    last_seen_at: Optional[str]
    created_at: str


class AdminUserListResponse(BaseModel):
    users: list[AdminUserRow]
    total: int
    page: int
    per_page: int
    has_next: bool


class AdminBanState(BaseModel):
    account_until: Optional[str]
    account_reason: Optional[str]
    chat_until: Optional[str]
    strike_count: int


class AdminStatsBlock(BaseModel):
    elo: int
    games_played: int
    parties_survived: int
    parties_lost: int
    manches_played: int
    manches_lost: int
    current_streak: int
    longest_streak: int


class AdminAuditEntry(BaseModel):
    id: str
    event_type: str
    occurred_at: str
    user_id: Optional[str]
    metadata: Optional[dict]


class AdminUserDetail(BaseModel):
    id: str
    username: str
    email: str
    birthdate: Optional[str]
    lang_pref: str
    theme_pref: str
    email_opt_in: bool
    role: str
    created_at: str
    last_seen_at: Optional[str]
    deleted_at: Optional[str]
    deletion_requested_at: Optional[str]
    has_avatar: bool
    ban: AdminBanState
    stats: Optional[AdminStatsBlock]
    audit_log: list[AdminAuditEntry]


class BanRequest(BaseModel):
    """POST /api/admin/users/{id}/ban body.

    `duration` accepts: '1d', '7d', '30d', 'permanent', or an explicit
    ISO-8601 datetime string (e.g. '2026-12-01T00:00:00Z'). `reason` is
    free-text shown to the user in the ban_notice email.
    """

    duration: str
    reason: Optional[str] = None


class ChatBanRequest(BaseModel):
    """POST /api/admin/users/{id}/chat-ban body. Duration: '1h', '24h', '7d'."""

    duration: str
    reason: Optional[str] = None


class DeleteAccountRequest(BaseModel):
    """DELETE /api/admin/users/{id} body. Type-username-to-confirm.

    The frontend modal forces the admin to type the exact username before
    enabling the submit button. Server-side we re-verify for safety in case
    the modal is bypassed (curl, replay, etc.).
    """

    confirm_username: str


class AdminAuditListResponse(BaseModel):
    entries: list[AdminAuditEntry]
    total: int
    page: int
    per_page: int
    has_next: bool


class AdminDashboardSummary(BaseModel):
    total_users: int
    active_account_bans: int
    active_chat_bans: int
    users_with_strikes: int
    online_count: int
    pending_inbox_items: int
    appeals_awaiting_review: int
    recent_admin_actions: list[AdminAuditEntry]

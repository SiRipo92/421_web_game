"""Pydantic schemas for admin dashboard endpoints (G90 users + G95 rooms)."""

from typing import Optional

from pydantic import BaseModel, Field


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
    the modal is bypassed (curl, replay, etc.). Optional reason is included
    in the account_deleted_admin email + persisted to the audit log so the
    deletion has documented context.
    """

    confirm_username: str
    reason: Optional[str] = None


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


# ---------------- G95 room moderation ----------------


class AdminRoomRow(BaseModel):
    """One row in the paginated admin room list. Lightweight — full state
    via GET /api/admin/rooms/{game_id}."""

    game_id: str
    phase: str
    is_public: bool
    host_name: Optional[str]
    player_count: int
    max_players: int
    partie_number: int
    bank_rule: str
    round_num: int
    spectator_count: int


class AdminRoomListResponse(BaseModel):
    rooms: list[AdminRoomRow]
    total: int


class AdminRoomPlayer(BaseModel):
    """Player slot inside the room detail view."""

    id: str
    user_id: Optional[str]
    name: str
    tokens: int
    round_points: int
    connected: bool
    is_host: bool


class AdminRoomLogEntry(BaseModel):
    """One journal entry from `game.log_events`. Mirrors what players see."""

    kind: str
    text: str


class AdminRoomDetail(BaseModel):
    """Full state of one active room for the admin spectate view."""

    game_id: str
    phase: str
    is_public: bool
    host_name: Optional[str]
    host_player_id: str
    max_players: int
    bank_rule: str
    afk_seconds: int
    round_points_to_lose: int
    partie_number: int
    round_num: int
    pool: int
    spectator_count: int
    players: list[AdminRoomPlayer]
    recent_log: list[AdminRoomLogEntry]
    bot_decisions_count: int


class BroadcastRoomRequest(BaseModel):
    """POST /api/admin/rooms/{id}/broadcast body.

    `message_fr` + `message_en` so the in-game banner renders in each
    user's lang. Either can be empty if the admin only writes in one
    language (frontend falls back to whichever is non-empty).
    """

    message_fr: str = Field(min_length=1, max_length=500)
    message_en: str = Field(min_length=1, max_length=500)
    severity: str = "info"  # 'info' | 'warning' | 'critical'


class AdminKickRequest(BaseModel):
    """POST /api/admin/rooms/{id}/kick body.

    Stronger than host-kick: target is kicked AND chat-banned for 1h
    (configurable via `chat_ban_hours`). `player_id` is the in-room
    Player.id (NOT the User.id). admin can kick the host.
    """

    player_id: str
    reason: str = "admin_action"
    chat_ban_hours: int = 1


class DissolveRoomRequest(BaseModel):
    """POST /api/admin/rooms/{id}/dissolve body.

    `confirm_game_id` must match the room's game_id (type-room-code-to
    confirm pattern). `reason` is shown to all players in the dissolution
    banner before the room is destroyed.
    """

    confirm_game_id: str
    reason: str = Field(min_length=1, max_length=500)

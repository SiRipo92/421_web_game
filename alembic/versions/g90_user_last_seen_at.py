"""G90 admin dashboard: User.last_seen_at column.

Adds a `last_seen_at` timestamp to `users` so the admin dashboard can
surface "active in last N minutes" without a full presence layer (G88).
The column is updated from `get_current_user` on every authenticated
request, throttled to one write per 5 minutes per user to avoid hot DB
writes on chatty clients.

Revision ID: g90admin0001
Revises: g91stats0001
Create Date: 2026-06-16
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "g90admin0001"
down_revision: Union[str, None] = "g91stats0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Index for the "online" filter (last_seen_at > now() - 5min) and for
    # "recently active" sort options on the admin user list.
    op.create_index("ix_users_last_seen_at", "users", ["last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_users_last_seen_at", table_name="users")
    op.drop_column("users", "last_seen_at")

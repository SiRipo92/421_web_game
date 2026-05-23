"""G38: add User moderation columns (role, strikes, ban fields) + promote seed admin

Revision ID: g38admin0001
Revises: a1b2c3d4e5f6
Create Date: 2026-05-23 18:00:00.000000

Adds the five new columns the moderation foundation needs and promotes
the seed account (ripochesierra@gmail.com) to `admin`. The data step is
idempotent — a 0-row UPDATE if the email isn't present (dev environments
without that user are unaffected).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g38admin0001"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED_ADMIN_EMAIL = "ripochesierra@gmail.com"


def upgrade() -> None:
    """Add moderation columns to users and promote the seed admin."""
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=16), nullable=False, server_default="player"),
    )
    op.add_column(
        "users",
        sa.Column("strike_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("chat_banned_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("banned_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("ban_reason", sa.String(length=64), nullable=True),
    )

    # Seed admin promotion. Idempotent — UPDATE returns 0 rows if user not present.
    op.execute(
        sa.text("UPDATE users SET role = 'admin' WHERE email = :email").bindparams(
            email=SEED_ADMIN_EMAIL
        )
    )


def downgrade() -> None:
    """Drop the moderation columns (loses any pending bans + strikes)."""
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "banned_until")
    op.drop_column("users", "chat_banned_until")
    op.drop_column("users", "strike_count")
    op.drop_column("users", "role")

"""G92: User.token_version for global session invalidation.

A monotonic counter embedded in every JWT as `tv`. Bumped on password
reset (and any future "kill all sessions" action). On decode we compare
the JWT's `tv` against the stored `token_version`; mismatch → 401.

This is the standard pattern for invalidating outstanding tokens
without a server-side allowlist, and replaces the previous behavior
where a password reset left existing tokens valid until natural
expiry (up to 30 days with remember_me).

Revision ID: g92token0001
Revises: g96user0001
Create Date: 2026-06-20
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "g92token0001"
down_revision: Union[str, None] = "g96user0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")

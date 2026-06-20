"""G96: User.username_pending_change flag.

Set to True when an admin auto-sanitizes an offensive handle, or in the
future when any auto-rename happens. Cleared when the user successfully
renames themselves via PATCH /auth/me. Powers the in-app banner that
prompts the user to choose a new handle.

Revision ID: g96user0001
Revises: g90admin0001
Create Date: 2026-06-20
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "g96user0001"
down_revision: Union[str, None] = "g90admin0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "username_pending_change",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "username_pending_change")

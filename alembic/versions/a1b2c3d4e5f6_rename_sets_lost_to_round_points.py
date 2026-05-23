"""rename game_players.sets_lost to round_points

The column always represented "round-loss count" in the actual game rules
(player took 2 match losses → 1 round point). Rename to match.

Revision ID: a1b2c3d4e5f6
Revises: 882d30e0b3ce
Create Date: 2026-05-23
"""

from typing import Union

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "882d30e0b3ce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("game_players", "sets_lost", new_column_name="round_points")


def downgrade() -> None:
    op.alter_column("game_players", "round_points", new_column_name="sets_lost")

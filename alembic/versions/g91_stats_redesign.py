"""G91 stats redesign — partie/manche semantics

Renames wins → parties_survived and losses → parties_lost (the game's
objective is to NOT lose, not to win — see G91 in docs/ROADMAP.md).
Adds manches_played, manches_lost, current_streak, longest_streak.
Resets all existing PlayerStats rows because their semantics were wrong
(losses was being incremented by round_points count, not loss count) —
better a clean slate at launch than muddy data.

Revision ID: g91stats0001
Revises: 330f1633b5b9
Create Date: 2026-06-16
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "g91stats0001"
down_revision: Union[str, None] = "330f1633b5b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename existing columns to reflect partie/manche semantics
    op.alter_column("player_stats", "wins", new_column_name="parties_survived")
    op.alter_column("player_stats", "losses", new_column_name="parties_lost")

    # Multi-partie-per-room support: a single room (game_code) now hosts
    # multiple parties in sequence. Drop unique constraint on game_code,
    # add partie_number, enforce uniqueness on the (code, partie_number)
    # composite. Existing rows get partie_number=1.
    op.drop_constraint("games_game_code_key", "games", type_="unique")
    op.add_column(
        "games",
        sa.Column("partie_number", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_unique_constraint(
        "games_game_code_partie_number_key", "games", ["game_code", "partie_number"]
    )

    # Add new tracking columns. server_default keeps the upgrade safe for
    # existing rows; the reset UPDATE below zeroes everything anyway.
    op.add_column(
        "player_stats",
        sa.Column("manches_played", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "player_stats",
        sa.Column("manches_lost", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "player_stats",
        sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "player_stats",
        sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"),
    )

    # Reset every row. The pre-G91 data has muddied semantics — wins was
    # only incremented on the lone-survivor edge case, and losses was being
    # accumulated as round_points sums (not loss counts). Easier story for
    # users at launch: "new ranking system, everyone starts fresh".
    op.execute(
        """
        UPDATE player_stats
        SET elo = 1200,
            games_played = 0,
            parties_survived = 0,
            parties_lost = 0,
            manches_played = 0,
            manches_lost = 0,
            current_streak = 0,
            longest_streak = 0
        """
    )


def downgrade() -> None:
    op.drop_constraint("games_game_code_partie_number_key", "games", type_="unique")
    op.drop_column("games", "partie_number")
    op.create_unique_constraint("games_game_code_key", "games", ["game_code"])
    op.drop_column("player_stats", "longest_streak")
    op.drop_column("player_stats", "current_streak")
    op.drop_column("player_stats", "manches_lost")
    op.drop_column("player_stats", "manches_played")
    op.alter_column("player_stats", "parties_lost", new_column_name="losses")
    op.alter_column("player_stats", "parties_survived", new_column_name="wins")

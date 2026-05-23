"""auth v2: birthdate, lang_pref, email_opt_in, password_reset_tokens

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-02
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {col["name"] for col in inspector.get_columns("users")}

    if "birthdate" not in existing_cols:
        op.add_column("users", sa.Column("birthdate", sa.Date, nullable=True))
    if "lang_pref" not in existing_cols:
        op.add_column(
            "users",
            sa.Column("lang_pref", sa.String(2), nullable=False, server_default="fr"),
        )
    if "email_opt_in" not in existing_cols:
        op.add_column(
            "users",
            sa.Column("email_opt_in", sa.Boolean, nullable=False, server_default="false"),
        )

    if "password_reset_tokens" not in inspector.get_table_names():
        op.create_table(
            "password_reset_tokens",
            sa.Column(
                "id",
                UUID(as_uuid=True),
                primary_key=True,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.Text, unique=True, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("password_reset_tokens")}
    if "ix_prt_token_hash" not in existing_indexes:
        op.create_index("ix_prt_token_hash", "password_reset_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_prt_token_hash", "password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "email_opt_in")
    op.drop_column("users", "lang_pref")
    op.drop_column("users", "birthdate")

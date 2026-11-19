"""An account's spare emails (DEV-197)

Revision ID: u53r3m41l5a1
Revises: c4n7v5r0st3r
Create Date: 2026-11-19
"""

import sqlalchemy as sa
from alembic import op

revision = "u53r3m41l5a1"
down_revision = "c4n7v5r0st3r"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "useremail",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("email_normalized", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="code"),
        sa.Column("verified_at", sa.String(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_useremail_user_id", "useremail", ["user_id"])
    op.create_index("ix_useremail_email_normalized", "useremail", ["email_normalized"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_useremail_email_normalized", table_name="useremail")
    op.drop_index("ix_useremail_user_id", table_name="useremail")
    op.drop_table("useremail")

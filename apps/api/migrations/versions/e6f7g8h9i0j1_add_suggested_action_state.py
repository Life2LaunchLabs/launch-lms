"""add suggested action state

Revision ID: e6f7g8h9i0j1
Revises: d3e4f5g6h7i8
Create Date: 2026-05-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f7g8h9i0j1"
down_revision: Union[str, None] = "d3e4f5g6h7i8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "suggestedactionstate",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("action_key", sa.String(), nullable=False),
        sa.Column("surface", sa.String(), nullable=False, server_default="global"),
        sa.Column("dismissed_until", sa.String(), nullable=True),
        sa.Column("completed_at", sa.String(), nullable=True),
        sa.Column("last_seen_at", sa.String(), nullable=True),
        sa.Column("last_clicked_at", sa.String(), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "org_id",
            "action_key",
            "surface",
            name="uq_suggestedactionstate_user_org_key_surface",
        ),
    )
    op.create_index("ix_suggestedactionstate_user_id", "suggestedactionstate", ["user_id"])
    op.create_index("ix_suggestedactionstate_org_id", "suggestedactionstate", ["org_id"])
    op.create_index("ix_suggestedactionstate_action_key", "suggestedactionstate", ["action_key"])
    op.create_index("ix_suggestedactionstate_surface", "suggestedactionstate", ["surface"])


def downgrade() -> None:
    op.drop_index("ix_suggestedactionstate_surface", table_name="suggestedactionstate")
    op.drop_index("ix_suggestedactionstate_action_key", table_name="suggestedactionstate")
    op.drop_index("ix_suggestedactionstate_org_id", table_name="suggestedactionstate")
    op.drop_index("ix_suggestedactionstate_user_id", table_name="suggestedactionstate")
    op.drop_table("suggestedactionstate")

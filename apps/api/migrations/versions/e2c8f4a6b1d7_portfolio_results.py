"""Portfolio results ("What I'm like")

Revision ID: e2c8f4a6b1d7
Revises: d4a7e2b9c1f3
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "e2c8f4a6b1d7"
down_revision = "d4a7e2b9c1f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portfolioresult",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("result_uuid", sa.String(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("summary", sa.String(), nullable=False, server_default=""),
        sa.Column("data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("taken_on", sa.String(), nullable=True),
        sa.Column("visibility", sa.String(), nullable=False, server_default="public"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("source_reference", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_portfolioresult_result_uuid", "portfolioresult", ["result_uuid"], unique=True)
    op.create_index("ix_portfolioresult_portfolio_id", "portfolioresult", ["portfolio_id"])
    op.create_index("ix_portfolioresult_source", "portfolioresult", ["portfolio_id", "source", "source_reference"])


def downgrade() -> None:
    op.drop_index("ix_portfolioresult_source", table_name="portfolioresult")
    op.drop_index("ix_portfolioresult_portfolio_id", table_name="portfolioresult")
    op.drop_index("ix_portfolioresult_result_uuid", table_name="portfolioresult")
    op.drop_table("portfolioresult")

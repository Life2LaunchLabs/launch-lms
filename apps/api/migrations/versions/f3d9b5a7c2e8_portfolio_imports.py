"""Portfolio imports (Oregon CIS, LinkedIn)

Revision ID: f3d9b5a7c2e8
Revises: e2c8f4a6b1d7
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "f3d9b5a7c2e8"
down_revision = "e2c8f4a6b1d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portfolioimport",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("import_uuid", sa.String(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False, server_default=""),
        sa.Column("added", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("kept", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_portfolioimport_import_uuid", "portfolioimport", ["import_uuid"], unique=True)
    op.create_index("ix_portfolioimport_portfolio_id", "portfolioimport", ["portfolio_id"])


def downgrade() -> None:
    op.drop_index("ix_portfolioimport_portfolio_id", table_name="portfolioimport")
    op.drop_index("ix_portfolioimport_import_uuid", table_name="portfolioimport")
    op.drop_table("portfolioimport")

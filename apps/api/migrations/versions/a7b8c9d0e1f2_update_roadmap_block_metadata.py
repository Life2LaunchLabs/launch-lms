"""update roadmap block metadata

Revision ID: a7b8c9d0e1f2
Revises: y6z7a8b9c0d1
Create Date: 2026-05-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "y6z7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("roadmapblockdefinition")}

    if "cashflow_amount" not in columns:
        op.add_column("roadmapblockdefinition", sa.Column("cashflow_amount", sa.Float(), nullable=True))
    if "cashflow_direction" not in columns:
        op.add_column("roadmapblockdefinition", sa.Column("cashflow_direction", sa.String(), nullable=True))
    if "cashflow_period" not in columns:
        op.add_column("roadmapblockdefinition", sa.Column("cashflow_period", sa.String(), nullable=True))
    if "cashflow_stddev" not in columns:
        op.add_column("roadmapblockdefinition", sa.Column("cashflow_stddev", sa.Float(), nullable=True))

    op.execute(
        """
        UPDATE roadmapblockdefinition
        SET cashflow_amount = COALESCE(default_monthly_income, expected_annual_income_mid, target_annual_income),
            cashflow_direction = 'income',
            cashflow_period = CASE
                WHEN default_monthly_income IS NOT NULL THEN 'monthly'
                ELSE 'yearly'
            END
        WHERE cashflow_amount IS NULL
          AND (default_monthly_income IS NOT NULL OR expected_annual_income_mid IS NOT NULL OR target_annual_income IS NOT NULL)
        """
    )
    op.execute(
        """
        UPDATE roadmapblockdefinition
        SET cashflow_amount = COALESCE(default_monthly_expense, default_one_time_cost),
            cashflow_direction = 'expense',
            cashflow_period = CASE
                WHEN default_monthly_expense IS NOT NULL THEN 'monthly'
                ELSE 'total'
            END
        WHERE cashflow_amount IS NULL
          AND (default_monthly_expense IS NOT NULL OR default_one_time_cost IS NOT NULL)
        """
    )
    op.execute("UPDATE roadmapblockdefinition SET block_type = 'employment' WHERE block_type IN ('occupation', 'entrepreneurship', 'job')")
    op.execute("UPDATE roadmapblockdefinition SET block_type = 'learning' WHERE block_type IN ('education', 'credential')")
    op.execute("UPDATE roadmapblockdefinition SET block_type = 'personal' WHERE block_type IN ('life', 'finance', 'custom')")


def downgrade() -> None:
    op.drop_column("roadmapblockdefinition", "cashflow_stddev")
    op.drop_column("roadmapblockdefinition", "cashflow_period")
    op.drop_column("roadmapblockdefinition", "cashflow_direction")
    op.drop_column("roadmapblockdefinition", "cashflow_amount")

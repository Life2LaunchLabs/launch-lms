"""My people access: what each person may see, as two switches (portfolio, plans)

Revision ID: c7d2f9a4e1b8
Revises: b5c8e1f3a7d2
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "c7d2f9a4e1b8"
down_revision = "b5c8e1f3a7d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("portfolioperson", sa.Column("portfolio", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("portfolioperson", sa.Column("plans", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("portfolioperson", "plans")
    op.drop_column("portfolioperson", "portfolio")

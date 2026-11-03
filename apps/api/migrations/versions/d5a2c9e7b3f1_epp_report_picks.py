"""EPP report picks: the portfolio items a learner chooses for their report

Revision ID: d5a2c9e7b3f1
Revises: c3e8f1a6d9b4
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "d5a2c9e7b3f1"
down_revision = "c3e8f1a6d9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learnersupport", sa.Column("report_picks", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("learnersupport", "report_picks")

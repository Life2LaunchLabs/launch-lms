"""Canvas class list pulls into course groups (DEV-193)

Revision ID: c4n7v5r0st3r
Revises: r3m0v3d0rg01
Create Date: 2026-11-19
"""

import sqlalchemy as sa
from alembic import op

revision = "c4n7v5r0st3r"
down_revision = "r3m0v3d0rg01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("canvascoursegroup", sa.Column("memberships_url", sa.String(), nullable=True))
    op.add_column("canvascoursegroup", sa.Column("roster_pulled_at", sa.String(), nullable=True))
    op.add_column("canvascoursegroup", sa.Column("roster_error", sa.String(), nullable=True))
    op.add_column("canvascoursegroup", sa.Column("invited_names", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("canvascoursegroup", "invited_names")
    op.drop_column("canvascoursegroup", "roster_error")
    op.drop_column("canvascoursegroup", "roster_pulled_at")
    op.drop_column("canvascoursegroup", "memberships_url")

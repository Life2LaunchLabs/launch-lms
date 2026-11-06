"""A portfolio's home base settings: how far the learner would go, and whether online is OK

Revision ID: s9h0m1e2b3a4
Revises: r8s3k4i5l6l7
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "s9h0m1e2b3a4"
down_revision = "r8s3k4i5l6l7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "location_settings" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("portfolio")}:
        op.add_column("portfolio", sa.Column("location_settings", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    if "location_settings" in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("portfolio")}:
        op.drop_column("portfolio", "location_settings")

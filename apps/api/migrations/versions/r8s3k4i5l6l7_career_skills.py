"""Careers keep the skills and work styles they lean on

Revision ID: r8s3k4i5l6l7
Revises: q7p2r3o4g5r6
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "r8s3k4i5l6l7"
down_revision = "q7p2r3o4g5r6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "skills" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("careerentry")}:
        op.add_column("careerentry", sa.Column("skills", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    if "skills" in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("careerentry")}:
        op.drop_column("careerentry", "skills")

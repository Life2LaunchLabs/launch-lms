"""Careers keep what people in the job say it takes, and O*NET's related careers

Revision ID: p6c2a7r3e4e5
Revises: o5r1a6s2e3c4
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "p6c2a7r3e4e5"
down_revision = "o5r1a6s2e3c4"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    have = _columns("careerentry")
    for name in ("education", "related"):
        if name not in have:
            op.add_column("careerentry", sa.Column(name, sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    have = _columns("careerentry")
    for name in ("education", "related"):
        if name in have:
            op.drop_column("careerentry", name)

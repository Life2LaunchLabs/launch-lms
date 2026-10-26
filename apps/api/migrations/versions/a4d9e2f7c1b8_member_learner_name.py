"""Staff choose the name learners see

Revision ID: a4d9e2f7c1b8
Revises: f3b7d1c9a2e5
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "a4d9e2f7c1b8"
down_revision = "f3b7d1c9a2e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("userorganization", sa.Column("learner_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("userorganization", "learner_name")

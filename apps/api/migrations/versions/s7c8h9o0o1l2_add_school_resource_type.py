"""add school resource type

Revision ID: s7c8h9o0o1l2
Revises: e8b4d1f6a7c2
"""

from alembic import op


revision = "s7c8h9o0o1l2"
down_revision = "e8b4d1f6a7c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE resourcetypeenum ADD VALUE IF NOT EXISTS 'school'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely while rows may use them.
    pass

"""add program invitation viewed timestamp

Revision ID: i1j2k3l4m5n6
Revises: h0i1j2k3l4m5
"""

from alembic import op
import sqlalchemy as sa


revision = "i1j2k3l4m5n6"
down_revision = "h0i1j2k3l4m5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("programparticipant", sa.Column("viewed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("programparticipant", "viewed_at")

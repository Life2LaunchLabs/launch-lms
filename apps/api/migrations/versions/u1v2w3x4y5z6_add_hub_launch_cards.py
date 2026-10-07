"""add editable Hub launch cards

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
"""

from alembic import op
import sqlalchemy as sa


revision = "u1v2w3x4y5z6"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL means "use the code defaults", so existing installs need no data change.
    op.add_column("hubadvisorconfiguration", sa.Column("launch_cards", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("hubadvisorconfiguration", "launch_cards")

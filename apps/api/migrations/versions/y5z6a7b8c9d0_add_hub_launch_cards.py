"""add editable Hub launch cards

Revision ID: y5z6a7b8c9d0
Revises: d3m0f4i1d3t4
"""

from alembic import op
import sqlalchemy as sa


revision = "y5z6a7b8c9d0"
down_revision = "d3m0f4i1d3t4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL means "use the code defaults", so existing installs need no data change.
    op.add_column("hubadvisorconfiguration", sa.Column("launch_cards", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("hubadvisorconfiguration", "launch_cards")

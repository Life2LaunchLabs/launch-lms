"""add Hub conversation archival

Revision ID: k8l9m0n1o2p3
Revises: j7k8l9m0n1o2
"""

from alembic import op
import sqlalchemy as sa


revision = "k8l9m0n1o2p3"
down_revision = "j7k8l9m0n1o2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("hubconversation", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.create_index("ix_hubconversation_archived_at", "hubconversation", ["archived_at"])


def downgrade() -> None:
    op.drop_index("ix_hubconversation_archived_at", table_name="hubconversation")
    op.drop_column("hubconversation", "archived_at")

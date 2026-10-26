"""Staff invitations carry permissions, assignments and a note

Revision ID: f3b7d1c9a2e5
Revises: e2c8a4f6b1d3
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "f3b7d1c9a2e5"
down_revision = "e2c8a4f6b1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizationinvitation", sa.Column("permissions", sa.JSON(), nullable=True))
    op.add_column("organizationinvitation", sa.Column("assignments", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("organizationinvitation", sa.Column("note", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("organizationinvitation", "note")
    op.drop_column("organizationinvitation", "assignments")
    op.drop_column("organizationinvitation", "permissions")

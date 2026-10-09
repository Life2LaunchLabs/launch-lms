"""make direct invitation invite-code reference nullable

Revision ID: h0i1j2k3l4m5
Revises: g9h0i1j2k3l4

Some databases carried forward the legacy invited-user column as NOT NULL even
though recipient-specific invitations do not use a shared invite code.
"""

from alembic import op
import sqlalchemy as sa


revision = "h0i1j2k3l4m5"
down_revision = "g9h0i1j2k3l4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "organizationinvitation",
        "invite_code_uuid",
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    # Direct invitations legitimately contain NULL, so restoring NOT NULL would
    # make rollback fail or corrupt their meaning. Keep the safe schema.
    pass

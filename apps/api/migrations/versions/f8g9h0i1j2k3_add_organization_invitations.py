"""add durable organization invitations

Revision ID: f8g9h0i1j2k3
Revises: e7f8g9h0i1j2
"""

from alembic import op
import sqlalchemy as sa


revision = "f8g9h0i1j2k3"
down_revision = "e7f8g9h0i1j2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizationinvitation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invitation_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("email_normalized", sa.String(), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("role.id"), nullable=False),
        sa.Column("usergroup_id", sa.Integer(), sa.ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invite_code_uuid", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("email_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("delivery_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_organizationinvitation_invitation_uuid", "organizationinvitation", ["invitation_uuid"], unique=True)
    op.create_index("ix_organizationinvitation_org_id", "organizationinvitation", ["org_id"])
    op.create_index("ix_organizationinvitation_email_normalized", "organizationinvitation", ["email_normalized"])
    op.create_index("ix_organizationinvitation_status", "organizationinvitation", ["status"])
    op.create_index("ix_organizationinvitation_org_status", "organizationinvitation", ["org_id", "status"])
    op.create_index("ix_organizationinvitation_org_email", "organizationinvitation", ["org_id", "email_normalized"])
    op.create_index(
        "uq_organizationinvitation_pending_email",
        "organizationinvitation",
        ["org_id", "email_normalized"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_organizationinvitation_pending_email", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_org_email", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_org_status", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_status", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_email_normalized", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_org_id", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_invitation_uuid", table_name="organizationinvitation")
    op.drop_table("organizationinvitation")

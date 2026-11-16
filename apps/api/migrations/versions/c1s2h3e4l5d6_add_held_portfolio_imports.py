"""Hold a learner's Oregon CIS work until they accept a staff invitation (DEV-40)

Revision ID: c1s2h3e4l5d6
Revises: d3v30a1b2c3d
Create Date: 2026-11-16
"""

from alembic import op
import sqlalchemy as sa

revision = "c1s2h3e4l5d6"
down_revision = "d3v30a1b2c3d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "heldportfolioimport",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("held_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invitation_id", sa.Integer(), sa.ForeignKey("organizationinvitation.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email_normalized", sa.String(), nullable=False),
        sa.Column("learner_name", sa.String(), nullable=False, server_default=""),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="cis"),
        sa.Column("filename", sa.String(), nullable=False, server_default=""),
        sa.Column("content", sa.LargeBinary(), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="held"),
        sa.Column("added", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_heldportfolioimport_held_uuid", "heldportfolioimport", ["held_uuid"], unique=True)
    for column in ("org_id", "invitation_id", "email_normalized", "target_user_id", "status"):
        op.create_index(f"ix_heldportfolioimport_{column}", "heldportfolioimport", [column])


def downgrade() -> None:
    op.drop_table("heldportfolioimport")

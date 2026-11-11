"""Suggestions: the event log the engine learns from, and each life-plan phase's Library list

Revision ID: x8r9e0c1o2m3
Revises: x1n2t3f4y5e6
Create Date: 2026-11-11
"""

from alembic import op
import sqlalchemy as sa

revision = "x8r9e0c1o2m3"
down_revision = "x1n2t3f4y5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recommendationevent",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resource.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("context", sa.String(80), nullable=False, server_default=""),
        sa.Column("shelf", sa.String(80), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_recommendationevent_user_id", "recommendationevent", ["user_id"])
    op.create_index("ix_recommendationevent_resource_id", "recommendationevent", ["resource_id"])
    op.create_index("ix_recommendationevent_context", "recommendationevent", ["context"])
    op.create_table(
        "phaseresourcelist",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phase_id", sa.String(40), nullable=False),
        sa.Column("user_channel_id", sa.Integer(), sa.ForeignKey("userresourcechannel.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("user_id", "phase_id", name="uq_phase_resource_list"),
    )
    op.create_index("ix_phaseresourcelist_user_id", "phaseresourcelist", ["user_id"])


def downgrade():
    op.drop_index("ix_phaseresourcelist_user_id", table_name="phaseresourcelist")
    op.drop_table("phaseresourcelist")
    op.drop_index("ix_recommendationevent_context", table_name="recommendationevent")
    op.drop_index("ix_recommendationevent_resource_id", table_name="recommendationevent")
    op.drop_index("ix_recommendationevent_user_id", table_name="recommendationevent")
    op.drop_table("recommendationevent")

"""add plan collaborator requests

Revision ID: n6o7p8q9r0s1
Revises: m5n6o7p8q9r0
"""

from alembic import op
import sqlalchemy as sa


revision = "n6o7p8q9r0s1"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plancollaboratorrequest",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("email_normalized", sa.String(), nullable=False),
        sa.Column("role_key", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("resolved_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("request_uuid"),
    )
    for column in ("request_uuid", "plan_id", "requested_by_user_id", "email_normalized", "status"):
        op.create_index(f"ix_plancollaboratorrequest_{column}", "plancollaboratorrequest", [column])


def downgrade() -> None:
    op.drop_table("plancollaboratorrequest")

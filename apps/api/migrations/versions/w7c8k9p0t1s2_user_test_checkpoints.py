"""User tests: checkpoints of a run's world per stage, publishable as the demo

Revision ID: w7c8k9p0t1s2
Revises: v6s7t8o9r0y1
Create Date: 2026-11-10
"""

from alembic import op
import sqlalchemy as sa

revision = "w7c8k9p0t1s2"
down_revision = "v6s7t8o9r0y1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "test_checkpoint",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), nullable=False),
        sa.Column("stage_key", sa.String(), nullable=True),
        sa.Column("label", sa.String(), nullable=False, server_default=""),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("schema_signature", sa.String(), nullable=False, server_default=""),
        sa.Column("pilots", sa.JSON(), nullable=False),
        sa.Column("portraits", sa.JSON(), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_index("ix_test_checkpoint_cohort_id", "test_checkpoint", ["cohort_id"])


def downgrade():
    op.drop_table("test_checkpoint")

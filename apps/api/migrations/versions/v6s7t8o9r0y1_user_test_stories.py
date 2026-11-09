"""User tests: a cohort's stages, each persona's place in them, and run events

Revision ID: v6s7t8o9r0y1
Revises: u5e6r7t8e9s0
Create Date: 2026-11-09
"""

from alembic import op
import sqlalchemy as sa

revision = "v6s7t8o9r0y1"
down_revision = "u5e6r7t8e9s0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("test_cohort", sa.Column("stages", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("test_persona", sa.Column("stage_state", sa.JSON(), nullable=False, server_default="{}"))
    op.create_table(
        "test_event",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), nullable=False),
        sa.Column("persona_user_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("stage_key", sa.String(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_test_event_cohort_id", "test_event", ["cohort_id"])
    op.create_index("ix_test_event_persona_user_id", "test_event", ["persona_user_id"])
    op.create_index("ix_test_event_created_at", "test_event", ["created_at"])


def downgrade():
    op.drop_table("test_event")
    op.drop_column("test_persona", "stage_state")
    op.drop_column("test_cohort", "stages")

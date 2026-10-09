"""add restricted objective completion

Revision ID: q9r0s1t2u3v4
Revises: p8q9r0s1t2u3
"""

from alembic import op
import sqlalchemy as sa


revision = "q9r0s1t2u3v4"
down_revision = "p8q9r0s1t2u3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planobjective", sa.Column("completion_restricted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute(
        "UPDATE planobjective SET completion_restricted = true "
        "WHERE kind = 'badge' OR source_objective_id IN "
        "(SELECT id FROM objective WHERE allow_learner_confirmation = false)"
    )
    op.alter_column("planobjective", "completion_restricted", server_default=None)


def downgrade() -> None:
    op.drop_column("planobjective", "completion_restricted")

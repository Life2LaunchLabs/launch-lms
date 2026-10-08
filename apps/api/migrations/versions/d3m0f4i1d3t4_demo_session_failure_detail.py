"""Keep the cause of a failed demo workspace preparation for operators.

Revision ID: d3m0f4i1d3t4
Revises: d3m0u5e7g1d2
"""

from alembic import op
import sqlalchemy as sa

revision = "d3m0f4i1d3t4"
down_revision = "d3m0u5e7g1d2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("demosession", sa.Column("failure_detail", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("demosession", "failure_detail")

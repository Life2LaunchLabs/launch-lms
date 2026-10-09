"""Persist typed, learner-controlled Hub action proposals."""
from alembic import op
import sqlalchemy as sa

revision = "r8s9t0u1v2w3"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hubconversationmessage", sa.Column("suggested_actions", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("hubconversationmessage", "suggested_actions")

"""Persist bounded Hub page source receipts (never page contents)."""
from alembic import op
import sqlalchemy as sa

revision = "q7r8s9t0u1v2"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hubconversationmessage", sa.Column("page_context", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("hubconversationmessage", "page_context")

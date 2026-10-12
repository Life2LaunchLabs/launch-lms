"""badge collection marketing metadata

Revision ID: v6z7a8b9c0d1
Revises: u5y6z7a8b9c0

``badgecollection.metadata`` holds the collection's Marketing story: a
credibility statement and its endorsers, shown on the badge and collection pages.
"""

import sqlalchemy as sa
from alembic import op

revision = "v6z7a8b9c0d1"
down_revision = "u5y6z7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("badgecollection", sa.Column("metadata", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("badgecollection", "metadata")

"""Keep the date of birth given at sign-up on the account (DEV-139)

Revision ID: b1r7d4t3k3p7
Revises: w6s7c8h9o0o1
Create Date: 2026-11-17
"""

import sqlalchemy as sa
from alembic import op

revision = "b1r7d4t3k3p7"
down_revision = "w6s7c8h9o0o1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing accounts have none: the date was checked and dropped before, so there is nothing to backfill.
    op.add_column("user", sa.Column("birth_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "birth_date")

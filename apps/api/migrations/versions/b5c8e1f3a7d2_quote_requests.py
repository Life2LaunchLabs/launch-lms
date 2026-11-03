"""Asked-for quotes: the link a quote request sends, and the learner's note with it

Revision ID: b5c8e1f3a7d2
Revises: e2b7c4d9f1a3
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "b5c8e1f3a7d2"
down_revision = "e2b7c4d9f1a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("portfolioquote", sa.Column("request_token_hash", sa.String(), nullable=True))
    op.add_column("portfolioquote", sa.Column("request_note", sa.Text(), nullable=False, server_default=""))
    op.create_index("ix_portfolioquote_request_token_hash", "portfolioquote", ["request_token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_portfolioquote_request_token_hash", table_name="portfolioquote")
    op.drop_column("portfolioquote", "request_note")
    op.drop_column("portfolioquote", "request_token_hash")

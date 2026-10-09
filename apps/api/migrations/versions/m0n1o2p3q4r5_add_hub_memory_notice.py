"""add Hub memory disclosure acknowledgement

Revision ID: m0n1o2p3q4r5
Revises: l9m0n1o2p3q4
"""

from alembic import op
import sqlalchemy as sa


revision = "m0n1o2p3q4r5"
down_revision = "l9m0n1o2p3q4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hubmemorypreference",
        sa.Column(
            "notice_dismissed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column(
        "hubmemorypreference",
        "enabled",
        existing_type=sa.Boolean(),
        server_default=sa.true(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "hubmemorypreference",
        "enabled",
        existing_type=sa.Boolean(),
        server_default=sa.false(),
        existing_nullable=False,
    )
    op.drop_column("hubmemorypreference", "notice_dismissed")

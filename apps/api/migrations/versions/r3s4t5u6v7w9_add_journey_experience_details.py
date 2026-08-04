"""add structured experience details to journey entries

Revision ID: r3s4t5u6v7w9
Revises: q2r3s4t5u6v7
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "r3s4t5u6v7w9"
down_revision: Union[str, None] = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "journeyentry",
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("journeyentry", "details")

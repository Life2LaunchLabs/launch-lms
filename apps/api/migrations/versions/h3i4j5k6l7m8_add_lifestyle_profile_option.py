"""add lifestyle profile option

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-05-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h3i4j5k6l7m8"
down_revision: Union[str, None] = "g2h3i4j5k6l7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("userframeworkprofile", sa.Column("selected_lifestyle_option_key", sa.String(), nullable=True))
    op.create_index(
        "ix_userframeworkprofile_selected_lifestyle_option_key",
        "userframeworkprofile",
        ["selected_lifestyle_option_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_userframeworkprofile_selected_lifestyle_option_key", table_name="userframeworkprofile")
    op.drop_column("userframeworkprofile", "selected_lifestyle_option_key")

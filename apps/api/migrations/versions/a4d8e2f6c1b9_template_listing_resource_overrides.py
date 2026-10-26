"""plans in the marketplace: how a listing stands in for resources that aren't in the Library

Revision ID: a4d8e2f6c1b9
Revises: f2c6a8d4e1b7

A plan can't be listed while it points at resources other organizations can't open. The publisher
swaps each one for a Library resource or removes it, for other organizations only; their own plan
keeps it. ``resource_overrides`` holds those choices: {resource_uuid: {"resource_uuid", "title", "url"} or null}.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4d8e2f6c1b9"
down_revision: Union[str, None] = "f2c6a8d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("goal_template_listing", sa.Column("resource_overrides", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("goal_template_listing", "resource_overrides")

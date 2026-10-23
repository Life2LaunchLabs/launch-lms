"""template versions get a semver and templates an explicit draft

Revision ID: h3d4e5f6a7b8
Revises: g2c3d4e5f6a7

Plans now separate the live version from an open draft. Each public version
gets a semver ("2.1.0", strictly increasing per template); existing versions
become "<number>.0.0". ``goal_template.draft`` holds the open draft's version
and note, and stays empty for templates whose working copy is just the live
version.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h3d4e5f6a7b8'
down_revision: Union[str, None] = 'g2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("goal_template_version", sa.Column("semver", sa.String(), nullable=True))
    op.add_column("goal_template", sa.Column("draft", sa.JSON(), nullable=True))
    op.execute("UPDATE goal_template_version SET semver = CAST(number AS VARCHAR) || '.0.0' WHERE private = false")


def downgrade() -> None:
    op.drop_column("goal_template", "draft")
    op.drop_column("goal_template_version", "semver")

"""Keep what the version 3 activity migration replaces, for one release

Revision ID: b8e3f1a6c2d9
Revises: b5e8c2d4f6a1
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "b8e3f1a6c2d9"
down_revision = "b5e8c2d4f6a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learningcontentbackup",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("ref_uuid", sa.String(), nullable=False),
        sa.Column("migration", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.UniqueConstraint("kind", "ref_uuid", "migration"),
    )
    op.create_index("ix_learningcontentbackup_ref_uuid", "learningcontentbackup", ["ref_uuid"])


def downgrade() -> None:
    op.drop_index("ix_learningcontentbackup_ref_uuid", table_name="learningcontentbackup")
    op.drop_table("learningcontentbackup")

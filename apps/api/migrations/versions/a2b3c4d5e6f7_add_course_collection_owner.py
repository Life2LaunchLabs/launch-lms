"""add course collection owner

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5e6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "z1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("course", sa.Column("collection_id", sa.Integer(), nullable=True))
    op.create_index("ix_course_collection_id", "course", ["collection_id"], unique=False)
    op.create_foreign_key(
        "fk_course_collection_id_collection",
        "course",
        "collection",
        ["collection_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Only unambiguous legacy links can be promoted automatically. Everything
    # else remains null and is surfaced by the dashboard repair helper.
    op.execute(
        """
        UPDATE course
        SET collection_id = ownership.collection_id
        FROM (
            SELECT course_id, MIN(collection_id) AS collection_id
            FROM collectioncourse
            GROUP BY course_id
            HAVING COUNT(DISTINCT collection_id) = 1
        ) AS ownership
        WHERE course.id = ownership.course_id
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_course_collection_id_collection", "course", type_="foreignkey")
    op.drop_index("ix_course_collection_id", table_name="course")
    op.drop_column("course", "collection_id")

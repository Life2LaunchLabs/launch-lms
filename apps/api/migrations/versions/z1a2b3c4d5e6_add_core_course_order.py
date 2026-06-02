"""add core course order

Revision ID: z1a2b3c4d5e6
Revises: x5y6z7a8b9c0
Create Date: 2026-06-02
"""

from alembic import op
import sqlalchemy as sa


revision = "z1a2b3c4d5e6"
down_revision = "x5y6z7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("course", sa.Column("core_course_order", sa.Integer(), nullable=True))
    op.execute(
        """
        WITH ordered_core_courses AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY creation_date ASC, id ASC) AS core_order
            FROM course
            WHERE core_course IS TRUE
        )
        UPDATE course
        SET core_course_order = ordered_core_courses.core_order
        FROM ordered_core_courses
        WHERE course.id = ordered_core_courses.id
        """
    )


def downgrade() -> None:
    op.drop_column("course", "core_course_order")

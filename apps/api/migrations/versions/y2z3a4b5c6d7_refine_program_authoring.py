"""refine program authoring

Revision ID: y2z3a4b5c6d7
Revises: x0y1z2a3b4c5
"""

from alembic import op
import sqlalchemy as sa


revision = "y2z3a4b5c6d7"
down_revision = "x0y1z2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "program",
        sa.Column("thumbnail_image", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "programphase",
        sa.Column("suggested_duration_weeks", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("programphase", "suggested_duration_weeks")
    op.drop_column("program", "thumbnail_image")

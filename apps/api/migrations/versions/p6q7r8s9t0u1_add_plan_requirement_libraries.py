"""add plan and requirement template libraries

Revision ID: p6q7r8s9t0u1
Revises: m0n1o2p3q4r5
"""

from alembic import op
import sqlalchemy as sa


revision = "p6q7r8s9t0u1"
down_revision = "m0n1o2p3q4r5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("program", sa.Column("source_program_uuid", sa.String(), nullable=True))
    op.add_column("program", sa.Column("source_version", sa.Integer(), nullable=True))
    op.add_column("program", sa.Column("library_snapshot", sa.JSON(), nullable=True))
    op.add_column("program", sa.Column("library_published_at", sa.DateTime(), nullable=True))
    op.create_index("ix_program_source_program_uuid", "program", ["source_program_uuid"])
    op.create_index("ix_program_library_published_at", "program", ["library_published_at"])
    op.add_column("requirementframework", sa.Column("library_published_version", sa.Integer(), nullable=True))
    op.add_column("requirementframework", sa.Column("library_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("requirementframework", "library_snapshot")
    op.drop_column("requirementframework", "library_published_version")
    op.drop_index("ix_program_library_published_at", table_name="program")
    op.drop_index("ix_program_source_program_uuid", table_name="program")
    op.drop_column("program", "library_published_at")
    op.drop_column("program", "library_snapshot")
    op.drop_column("program", "source_version")
    op.drop_column("program", "source_program_uuid")

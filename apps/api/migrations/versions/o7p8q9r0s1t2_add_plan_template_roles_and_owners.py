"""add plan template roles and explicit assignment owners

Revision ID: o7p8q9r0s1t2
Revises: n6o7p8q9r0s1
"""

from alembic import op
import sqlalchemy as sa


revision = "o7p8q9r0s1t2"
down_revision = "n6o7p8q9r0s1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("program", sa.Column("role_definitions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("program", sa.Column("default_subject_role_key", sa.String(), nullable=False, server_default="subject"))
    op.add_column("program", sa.Column("default_staff_role_key", sa.String(), nullable=False, server_default="reviewer"))
    op.add_column("programassignment", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.add_column("programassignment", sa.Column("subject_email", sa.String(), nullable=True))
    op.create_foreign_key("fk_programassignment_owner", "programassignment", "user", ["owner_user_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_programassignment_owner_user_id", "programassignment", ["owner_user_id"])
    op.create_index("ix_programassignment_subject_email", "programassignment", ["subject_email"])
    op.execute("UPDATE programassignment SET owner_user_id = created_by_user_id WHERE owner_user_id IS NULL")


def downgrade() -> None:
    op.drop_index("ix_programassignment_subject_email", table_name="programassignment")
    op.drop_column("programassignment", "subject_email")
    op.drop_index("ix_programassignment_owner_user_id", table_name="programassignment")
    op.drop_constraint("fk_programassignment_owner", "programassignment", type_="foreignkey")
    op.drop_column("programassignment", "owner_user_id")
    op.drop_column("program", "default_staff_role_key")
    op.drop_column("program", "default_subject_role_key")
    op.drop_column("program", "role_definitions")

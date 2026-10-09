"""add reusable organization plan roles

Revision ID: p8q9r0s1t2u3
Revises: o7p8q9r0s1t2
"""

from alembic import op
import sqlalchemy as sa


revision = "p8q9r0s1t2u3"
down_revision = "o7p8q9r0s1t2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizationplanrole",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("role_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "key"),
        sa.UniqueConstraint("role_uuid"),
    )
    op.create_index("ix_organizationplanrole_org_id", "organizationplanrole", ["org_id"])
    op.create_index("ix_organizationplanrole_role_uuid", "organizationplanrole", ["role_uuid"])
    op.execute("UPDATE planrole SET name = 'Learner' WHERE key = 'subject'")


def downgrade() -> None:
    op.execute("UPDATE planrole SET name = 'Subject' WHERE key = 'subject'")
    op.drop_index("ix_organizationplanrole_role_uuid", table_name="organizationplanrole")
    op.drop_index("ix_organizationplanrole_org_id", table_name="organizationplanrole")
    op.drop_table("organizationplanrole")

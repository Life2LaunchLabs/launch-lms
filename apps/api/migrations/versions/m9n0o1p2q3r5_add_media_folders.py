"""add media folders

Revision ID: m9n0o1p2q3r5
Revises: m9n0o1p2q3r4
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "m9n0o1p2q3r5"
down_revision: Union[str, None] = "m9n0o1p2q3r4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    owner_type_enum = postgresql.ENUM("user", "org", name="mediaownertype", create_type=False)

    op.create_table(
        "mediafolder",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("folder_uuid", sa.String(), nullable=False),
        sa.Column("owner_type", owner_type_enum, nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=True),
        sa.Column("owner_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("folder_uuid"),
    )
    op.create_index("ix_mediafolder_folder_uuid", "mediafolder", ["folder_uuid"])
    op.create_index("ix_mediafolder_owner_user_id", "mediafolder", ["owner_user_id"])
    op.create_index("ix_mediafolder_owner_org_id", "mediafolder", ["owner_org_id"])
    op.create_index("ix_mediafolder_created_by_user_id", "mediafolder", ["created_by_user_id"])
    op.create_index("ix_mediafolder_owner_type_name", "mediafolder", ["owner_type", "name"])


def downgrade() -> None:
    op.drop_index("ix_mediafolder_owner_type_name", table_name="mediafolder")
    op.drop_index("ix_mediafolder_created_by_user_id", table_name="mediafolder")
    op.drop_index("ix_mediafolder_owner_org_id", table_name="mediafolder")
    op.drop_index("ix_mediafolder_owner_user_id", table_name="mediafolder")
    op.drop_index("ix_mediafolder_folder_uuid", table_name="mediafolder")
    op.drop_table("mediafolder")

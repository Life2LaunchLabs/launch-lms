"""resources: channel audience, the Library, org saves and comment moderation

Revision ID: f2c6a8d4e1b7
Revises: e7a2c9d4b1f6

A channel's ``public``/``shared``/``is_starred`` flags become ``audience`` (org, groups, staff) and
``listed`` (in the Library). Private channels with linked groups keep those groups; private ones
without groups were open to every member, so they become ``org``. Channels also carry who may comment
and whether comments with links wait for review. Comments get a ``status`` and reports, and
organizations can save Library channels and resources (``db/resources.py``).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2c6a8d4e1b7"
down_revision: Union[str, None] = "e7a2c9d4b1f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("resourcechannel", sa.Column("audience", sa.String(), nullable=False, server_default="org"))
    op.add_column("resourcechannel", sa.Column("comment_rule", sa.String(), nullable=False, server_default="all"))
    op.add_column("resourcechannel", sa.Column("hold_links", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("resourcechannel", sa.Column("listed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("resourcechannel", sa.Column("listed_at", sa.String(), nullable=True))
    op.create_index("ix_resourcechannel_listed", "resourcechannel", ["listed"])
    op.execute("UPDATE resourcechannel SET listed = shared, listed_at = CASE WHEN shared THEN update_date END")
    op.execute(
        "UPDATE resourcechannel SET audience = 'groups' WHERE public = false "
        "AND channel_uuid IN (SELECT resource_uuid FROM usergroupresource)"
    )
    op.drop_column("resourcechannel", "public")
    op.drop_column("resourcechannel", "shared")
    op.drop_column("resourcechannel", "is_starred")

    op.add_column("resourcecomment", sa.Column("status", sa.String(), nullable=False, server_default="live"))
    op.create_index("ix_resourcecomment_status", "resourcecomment", ["status"])
    op.drop_column("resourcecomment", "is_locked")

    op.create_table(
        "resourcecommentreport",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("comment_id", sa.Integer(), sa.ForeignKey("resourcecomment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("comment_id", "user_id", name="uq_resourcecommentreport_comment_user"),
    )
    op.create_index("ix_resourcecommentreport_comment_id", "resourcecommentreport", ["comment_id"])
    op.create_index("ix_resourcecommentreport_user_id", "resourcecommentreport", ["user_id"])

    for table, column, target in (("orgsavedchannel", "channel_id", "resourcechannel"), ("orgsavedresource", "resource_id", "resource")):
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
            sa.Column(column, sa.Integer(), sa.ForeignKey(f"{target}.id", ondelete="CASCADE"), nullable=False),
            sa.Column("saved_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
            sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
            sa.UniqueConstraint("org_id", column, name=f"uq_{table}_org_{column.removesuffix('_id')}"),
        )
        op.create_index(f"ix_{table}_org_id", table, ["org_id"])
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table, column in (("orgsavedresource", "resource_id"), ("orgsavedchannel", "channel_id")):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
        op.drop_index(f"ix_{table}_org_id", table_name=table)
        op.drop_table(table)
    op.drop_index("ix_resourcecommentreport_user_id", table_name="resourcecommentreport")
    op.drop_index("ix_resourcecommentreport_comment_id", table_name="resourcecommentreport")
    op.drop_table("resourcecommentreport")

    op.add_column("resourcecomment", sa.Column("is_locked", sa.Boolean(), nullable=True, server_default=sa.false()))
    op.drop_index("ix_resourcecomment_status", table_name="resourcecomment")
    op.drop_column("resourcecomment", "status")

    op.add_column("resourcechannel", sa.Column("is_starred", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("resourcechannel", sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("resourcechannel", sa.Column("public", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE resourcechannel SET shared = listed, public = (audience = 'org')")
    op.drop_index("ix_resourcechannel_listed", table_name="resourcechannel")
    for column in ("listed_at", "listed", "hold_links", "comment_rule", "audience"):
        op.drop_column("resourcechannel", column)

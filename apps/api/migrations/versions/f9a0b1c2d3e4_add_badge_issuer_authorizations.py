"""add badge issuer authorizations and issuing org context

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-07-08 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return table_name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    return column_name in [col["name"] for col in inspect(op.get_bind()).get_columns(table_name)]


def upgrade() -> None:
    if not _table_exists("badgeissuerauthorization"):
        op.create_table(
            "badgeissuerauthorization",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("authorization_uuid", sa.String(), nullable=False),
            sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
            sa.Column("creator_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
            sa.Column("issuer_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("open_to_all", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("message", sa.String(), nullable=True),
            sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
            sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("creation_date", sa.String(), nullable=False),
            sa.Column("update_date", sa.String(), nullable=False),
            sa.UniqueConstraint("badge_id", "issuer_org_id"),
            sa.UniqueConstraint("authorization_uuid"),
        )
        op.create_index("ix_badgeissuerauthorization_authorization_uuid", "badgeissuerauthorization", ["authorization_uuid"])
        op.create_index("ix_badgeissuerauthorization_badge_id", "badgeissuerauthorization", ["badge_id"])
        op.create_index("ix_badgeissuerauthorization_creator_org_id", "badgeissuerauthorization", ["creator_org_id"])
        op.create_index("ix_badgeissuerauthorization_issuer_org_id", "badgeissuerauthorization", ["issuer_org_id"])

    if not _table_exists("badgeissuerlearnerlink"):
        op.create_table(
            "badgeissuerlearnerlink",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("link_uuid", sa.String(), nullable=False),
            sa.Column("authorization_id", sa.Integer(), sa.ForeignKey("badgeissuerauthorization.id", ondelete="CASCADE"), nullable=False),
            sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
            sa.Column("issuer_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
            sa.Column("note", sa.String(), nullable=True),
            sa.Column("creation_date", sa.String(), nullable=False),
            sa.Column("update_date", sa.String(), nullable=False),
            sa.UniqueConstraint("authorization_id", "user_id"),
            sa.UniqueConstraint("link_uuid"),
        )
        op.create_index("ix_badgeissuerlearnerlink_link_uuid", "badgeissuerlearnerlink", ["link_uuid"])
        op.create_index("ix_badgeissuerlearnerlink_authorization_id", "badgeissuerlearnerlink", ["authorization_id"])
        op.create_index("ix_badgeissuerlearnerlink_badge_id", "badgeissuerlearnerlink", ["badge_id"])
        op.create_index("ix_badgeissuerlearnerlink_issuer_org_id", "badgeissuerlearnerlink", ["issuer_org_id"])
        op.create_index("ix_badgeissuerlearnerlink_user_id", "badgeissuerlearnerlink", ["user_id"])

    if not _column_exists("learningbadge", "marketplace_listed"):
        op.add_column("learningbadge", sa.Column("marketplace_listed", sa.Boolean(), nullable=False, server_default=sa.false()))

    if not _column_exists("learningrun", "issuing_org_id"):
        op.add_column("learningrun", sa.Column("issuing_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="SET NULL"), nullable=True))
        op.create_index("ix_learningrun_issuing_org_id", "learningrun", ["issuing_org_id"])

    if not _column_exists("learningbadgeaward", "issuing_org_id"):
        op.add_column("learningbadgeaward", sa.Column("issuing_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="SET NULL"), nullable=True))
        op.create_index("ix_learningbadgeaward_issuing_org_id", "learningbadgeaward", ["issuing_org_id"])


def downgrade() -> None:
    if _column_exists("learningbadgeaward", "issuing_org_id"):
        op.drop_index("ix_learningbadgeaward_issuing_org_id", table_name="learningbadgeaward")
        op.drop_column("learningbadgeaward", "issuing_org_id")

    if _column_exists("learningrun", "issuing_org_id"):
        op.drop_index("ix_learningrun_issuing_org_id", table_name="learningrun")
        op.drop_column("learningrun", "issuing_org_id")

    if _column_exists("learningbadge", "marketplace_listed"):
        op.drop_column("learningbadge", "marketplace_listed")

    if _table_exists("badgeissuerlearnerlink"):
        op.drop_index("ix_badgeissuerlearnerlink_user_id", table_name="badgeissuerlearnerlink")
        op.drop_index("ix_badgeissuerlearnerlink_issuer_org_id", table_name="badgeissuerlearnerlink")
        op.drop_index("ix_badgeissuerlearnerlink_badge_id", table_name="badgeissuerlearnerlink")
        op.drop_index("ix_badgeissuerlearnerlink_authorization_id", table_name="badgeissuerlearnerlink")
        op.drop_index("ix_badgeissuerlearnerlink_link_uuid", table_name="badgeissuerlearnerlink")
        op.drop_table("badgeissuerlearnerlink")

    if _table_exists("badgeissuerauthorization"):
        op.drop_index("ix_badgeissuerauthorization_issuer_org_id", table_name="badgeissuerauthorization")
        op.drop_index("ix_badgeissuerauthorization_creator_org_id", table_name="badgeissuerauthorization")
        op.drop_index("ix_badgeissuerauthorization_badge_id", table_name="badgeissuerauthorization")
        op.drop_index("ix_badgeissuerauthorization_authorization_uuid", table_name="badgeissuerauthorization")
        op.drop_table("badgeissuerauthorization")

"""add portfolio journey domain

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "p2q3r4s5t6u7"
down_revision: Union[str, None] = "o1p2q3r4s5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table("journeyentry",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("journey_uuid", sa.String(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_type", sa.String(), nullable=False), sa.Column("title", sa.String(), nullable=False),
        sa.Column("organization", sa.String(), nullable=False), sa.Column("location_label", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False), sa.Column("start_date", sa.String()), sa.Column("end_date", sa.String()),
        sa.Column("start_precision", sa.String(), nullable=False), sa.Column("end_precision", sa.String()),
        sa.Column("is_current", sa.Boolean(), nullable=False), sa.Column("status", sa.String(), nullable=False),
        sa.Column("cover_asset_id", sa.Integer(), sa.ForeignKey("mediaasset.id", ondelete="SET NULL")),
        sa.Column("visibility", sa.String(), nullable=False), sa.Column("slug", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False), sa.Column("source_reference", sa.String()),
        sa.Column("revision", sa.Integer(), nullable=False), sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False), sa.UniqueConstraint("journey_uuid"), sa.UniqueConstraint("portfolio_id", "slug"))
    for column in ("journey_uuid", "portfolio_id", "entry_type", "status", "slug"):
        op.create_index(f"ix_journeyentry_{column}", "journeyentry", [column])
    op.create_table("journeyentryblock",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("block_uuid", sa.String(), nullable=False),
        sa.Column("journey_entry_id", sa.Integer(), sa.ForeignKey("journeyentry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("block_type", sa.String(), nullable=False), sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False), sa.Column("visibility", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False), sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("block_uuid"))
    op.create_index("ix_journeyentryblock_block_uuid", "journeyentryblock", ["block_uuid"])
    op.create_index("ix_journeyentryblock_journey_entry_id", "journeyentryblock", ["journey_entry_id"])
    op.create_table("journeyworklink",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("link_uuid", sa.String(), nullable=False),
        sa.Column("journey_entry_id", sa.Integer(), sa.ForeignKey("journeyentry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_item_id", sa.Integer(), sa.ForeignKey("workitem.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relationship_label", sa.String(), nullable=False), sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False), sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("link_uuid"), sa.UniqueConstraint("journey_entry_id", "work_item_id"))
    for column in ("link_uuid", "journey_entry_id", "work_item_id"):
        op.create_index(f"ix_journeyworklink_{column}", "journeyworklink", [column])

def downgrade() -> None:
    op.drop_table("journeyworklink")
    op.drop_table("journeyentryblock")
    op.drop_table("journeyentry")

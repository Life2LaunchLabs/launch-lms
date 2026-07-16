"""add normalized portfolio domain

Revision ID: n0p1q2r3s4t5
Revises: m9n0o1p2q3r5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n0p1q2r3s4t5"
down_revision: Union[str, None] = "m9n0o1p2q3r5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps():
    return (
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "portfolio",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("portfolio_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("headline", sa.String(), nullable=False),
        sa.Column("short_bio", sa.Text(), nullable=False),
        sa.Column("location_label", sa.String(), nullable=False),
        sa.Column("avatar_asset_id", sa.Integer(), sa.ForeignKey("mediaasset.id", ondelete="SET NULL")),
        sa.Column("cover_asset_id", sa.Integer(), sa.ForeignKey("mediaasset.id", ondelete="SET NULL")),
        sa.Column("visibility", sa.String(), nullable=False),
        sa.Column("moderation_status", sa.String(), nullable=False),
        sa.Column("theme_id", sa.String(), nullable=False),
        sa.Column("theme_settings", sa.JSON(), nullable=False),
        sa.Column("privacy_confirmed_at", sa.String()),
        sa.Column("previewed_at", sa.String()),
        sa.Column("first_published_at", sa.String()),
        sa.Column("published_at", sa.String()),
        sa.Column("revision", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("portfolio_uuid"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_portfolio_portfolio_uuid", "portfolio", ["portfolio_uuid"])
    op.create_index("ix_portfolio_user_id", "portfolio", ["user_id"])

    op.create_table(
        "portfoliosection",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("section_uuid", sa.String(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_type", sa.String(), nullable=False),
        sa.Column("title_override", sa.String()),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("visibility", sa.String(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("section_uuid"),
        sa.UniqueConstraint("portfolio_id", "section_type"),
    )
    op.create_index("ix_portfoliosection_portfolio_id", "portfoliosection", ["portfolio_id"])

    op.create_table(
        "workitem",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("work_uuid", sa.String(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
        sa.Column("story_kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("subtitle", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("role_label", sa.String(), nullable=False),
        sa.Column("start_date", sa.String()),
        sa.Column("end_date", sa.String()),
        sa.Column("date_precision", sa.String()),
        sa.Column("is_ongoing", sa.Boolean(), nullable=False),
        sa.Column("cover_asset_id", sa.Integer(), sa.ForeignKey("mediaasset.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("visibility", sa.String(), nullable=False),
        sa.Column("featured", sa.Boolean(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_reference", sa.String()),
        sa.Column("revision", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("work_uuid"),
        sa.UniqueConstraint("portfolio_id", "slug"),
    )
    op.create_index("ix_workitem_work_uuid", "workitem", ["work_uuid"])
    op.create_index("ix_workitem_portfolio_id", "workitem", ["portfolio_id"])
    op.create_index("ix_workitem_status", "workitem", ["status"])
    op.create_index("ix_workitem_slug", "workitem", ["slug"])

    op.create_table(
        "workitemblock",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("block_uuid", sa.String(), nullable=False),
        sa.Column("work_item_id", sa.Integer(), sa.ForeignKey("workitem.id", ondelete="CASCADE"), nullable=False),
        sa.Column("block_type", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("visibility", sa.String(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("block_uuid"),
    )
    op.create_index("ix_workitemblock_work_item_id", "workitemblock", ["work_item_id"])

    for table, uuid_column, columns in (
        ("portfoliolink", "link_uuid", [sa.Column("link_type", sa.String(), nullable=False), sa.Column("platform", sa.String()), sa.Column("label", sa.String(), nullable=False), sa.Column("url", sa.Text(), nullable=False), sa.Column("safety_status", sa.String(), nullable=False)]),
        ("profiletrait", "trait_uuid", [sa.Column("trait_type", sa.String(), nullable=False), sa.Column("label", sa.String(), nullable=False), sa.Column("description", sa.String(), nullable=False), sa.Column("source", sa.String(), nullable=False), sa.Column("source_reference", sa.String()), sa.Column("verification_status", sa.String(), nullable=False)]),
    ):
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(uuid_column, sa.String(), nullable=False, unique=True),
            sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
            *columns,
            sa.Column("visibility", sa.String(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            *_timestamps(),
        )
        op.create_index(f"ix_{table}_{uuid_column}", table, [uuid_column])
        op.create_index(f"ix_{table}_portfolio_id", table, ["portfolio_id"])


def downgrade() -> None:
    for table in ("profiletrait", "portfoliolink", "workitemblock", "workitem", "portfoliosection", "portfolio"):
        op.drop_table(table)

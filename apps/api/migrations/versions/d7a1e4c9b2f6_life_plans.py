"""Life plans: the learner's plan document, plus estimate sources and facts

Revision ID: d7a1e4c9b2f6
Revises: c6f9d3e5a7b2
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "d7a1e4c9b2f6"
down_revision = "c6f9d3e5a7b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lifeplan",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plan_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("plan_uuid"),
    )
    op.create_index("ix_lifeplan_plan_uuid", "lifeplan", ["plan_uuid"])
    op.create_index("ix_lifeplan_user_id", "lifeplan", ["user_id"])

    op.create_table(
        "estimatesource",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("publisher", sa.String(), nullable=False, server_default=""),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column("dataset", sa.String(), nullable=False, server_default=""),
        sa.Column("url", sa.String(), nullable=False, server_default=""),
        sa.Column("released", sa.String(), nullable=False, server_default=""),
        sa.Column("retrieved", sa.String(), nullable=False, server_default=""),
        sa.Column("license", sa.String(), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("key"),
    )
    op.create_index("ix_estimatesource_key", "estimatesource", ["key"])

    op.create_table(
        "estimatefact",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("metric", sa.String(length=64), nullable=False),
        sa.Column("place", sa.String(length=64), nullable=False),
        sa.Column("dims", sa.JSON(), nullable=False),
        sa.Column("dims_key", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("label", sa.String(), nullable=False, server_default=""),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("percentiles", sa.JSON(), nullable=True),
        sa.Column("period", sa.String(), nullable=False, server_default="mo"),
        sa.Column("stat", sa.String(), nullable=False, server_default=""),
        sa.Column("dollar_year", sa.Integer(), nullable=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("estimatesource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.String(), nullable=True),
        sa.Column("note", sa.String(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_estimatefact_metric", "estimatefact", ["metric"])
    op.create_index("ix_estimatefact_place", "estimatefact", ["place"])
    op.create_index("ix_estimatefact_dims_key", "estimatefact", ["dims_key"])
    op.create_index("ix_estimatefact_status", "estimatefact", ["status"])
    op.create_index("ix_estimatefact_source_id", "estimatefact", ["source_id"])


def downgrade() -> None:
    op.drop_table("estimatefact")
    op.drop_table("estimatesource")
    op.drop_table("lifeplan")

"""add featured to news articles

Revision ID: c7d8e9f0a1b2
Revises: p7q8r9s0t1u2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "p7q8r9s0t1u2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if "newsarticle" not in tables:
        status_enum = postgresql.ENUM(
            "draft",
            "published",
            name="newsarticlestatus",
            create_type=False,
        )
        status_enum.create(bind, checkfirst=True)

        op.create_table(
            "newsarticle",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("article_uuid", sa.String(), nullable=False),
            sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("external_url", sa.String(), nullable=True),
            sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("status", status_enum, nullable=False, server_default="draft"),
            sa.Column("published_at", sa.String(), nullable=True),
            sa.Column("creation_date", sa.String(), nullable=False),
            sa.Column("update_date", sa.String(), nullable=False),
            sa.UniqueConstraint("article_uuid"),
            sa.UniqueConstraint("org_id", "slug", name="uq_newsarticle_org_slug"),
        )
        op.create_index("ix_newsarticle_article_uuid", "newsarticle", ["article_uuid"])
        op.create_index("ix_newsarticle_org_id", "newsarticle", ["org_id"])
        op.create_index("ix_newsarticle_author_user_id", "newsarticle", ["author_user_id"])
        return

    columns = {column["name"] for column in inspector.get_columns("newsarticle")}
    if "featured" in columns:
        return

    op.add_column(
        "newsarticle",
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if "newsarticle" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("newsarticle")}
    if "featured" in columns:
        op.drop_column("newsarticle", "featured")

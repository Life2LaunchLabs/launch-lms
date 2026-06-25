"""add news articles

Revision ID: b3c4d5e6f7g8
Revises: a2b3c4d5e6f7
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b3c4d5e6f7g8"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    status_enum = postgresql.ENUM(
        "draft",
        "published",
        name="newsarticlestatus",
        create_type=False,
    )
    status_enum.create(op.get_bind(), checkfirst=True)

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


def downgrade() -> None:
    op.drop_index("ix_newsarticle_author_user_id", table_name="newsarticle")
    op.drop_index("ix_newsarticle_org_id", table_name="newsarticle")
    op.drop_index("ix_newsarticle_article_uuid", table_name="newsarticle")
    op.drop_table("newsarticle")
    status_enum = postgresql.ENUM(
        "draft",
        "published",
        name="newsarticlestatus",
        create_type=False,
    )
    status_enum.drop(op.get_bind(), checkfirst=True)

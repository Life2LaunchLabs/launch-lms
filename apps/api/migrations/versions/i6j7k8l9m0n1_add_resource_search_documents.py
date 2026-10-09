"""add versioned resource search documents

Revision ID: i6j7k8l9m0n1
Revises: h5i6j7k8l9m0
"""

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa


revision = "i6j7k8l9m0n1"
down_revision = "h5i6j7k8l9m0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "resourcesearchdocument",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_version", sa.String(length=50), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("provider", sa.String(), nullable=False, server_default=""),
        sa.Column("resource_type", sa.String(), nullable=False, server_default=""),
        sa.Column("tags_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("search_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("embedding_model", sa.String(length=100), nullable=True),
        sa.Column("embedding_version", sa.String(length=100), nullable=True),
        sa.Column("embedding_updated_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("resource_id", name="uq_resourcesearchdocument_resource_id"),
    )
    op.create_index("ix_resourcesearchdocument_resource_id", "resourcesearchdocument", ["resource_id"])
    op.create_index("ix_resourcesearchdocument_org_id", "resourcesearchdocument", ["org_id"])
    op.create_index("ix_resourcesearchdocument_content_hash", "resourcesearchdocument", ["content_hash"])
    if bind.dialect.name == "postgresql":
        op.create_index(
            "ix_resourcesearchdocument_embedding_hnsw",
            "resourcesearchdocument",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_where=sa.text("embedding IS NOT NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_index("ix_resourcesearchdocument_embedding_hnsw", table_name="resourcesearchdocument")
    op.drop_index("ix_resourcesearchdocument_content_hash", table_name="resourcesearchdocument")
    op.drop_index("ix_resourcesearchdocument_org_id", table_name="resourcesearchdocument")
    op.drop_index("ix_resourcesearchdocument_resource_id", table_name="resourcesearchdocument")
    op.drop_table("resourcesearchdocument")

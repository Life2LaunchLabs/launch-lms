"""add OAuth authorization server tables for connected apps

Revision ID: k2o3a4u5t6h7
Revises: k1p2r3v4w5x6
"""

from alembic import op
import sqlalchemy as sa


revision = "k2o3a4u5t6h7"
down_revision = "k1p2r3v4w5x6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauthclient",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("client_secret_hash", sa.String(length=64), nullable=True),
        sa.Column("client_name", sa.String(length=200), nullable=False),
        sa.Column("client_uri", sa.String(length=500), nullable=True),
        sa.Column("logo_uri", sa.String(length=500), nullable=True),
        sa.Column("redirect_uris", sa.JSON(), nullable=True),
        sa.Column("token_endpoint_auth_method", sa.String(length=32), nullable=False),
        sa.Column("scope", sa.String(length=500), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_oauthclient_client_id", "oauthclient", ["client_id"], unique=True)

    op.create_table(
        "oauthauthorizationcode",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("redirect_uri", sa.String(length=500), nullable=False),
        sa.Column("code_challenge", sa.String(length=128), nullable=False),
        sa.Column("scope", sa.String(length=500), nullable=False),
        sa.Column("resource", sa.String(length=500), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_oauthauthorizationcode_code_hash", "oauthauthorizationcode", ["code_hash"], unique=True)

    op.create_table(
        "oauthgrant",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.String(length=64), nullable=False),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(length=500), nullable=False),
        sa.Column("resource", sa.String(length=500), nullable=False),
        sa.Column("access_expires_at", sa.DateTime(), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(), nullable=False),
        sa.Column("rotated_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_oauthgrant_family_id", "oauthgrant", ["family_id"])
    op.create_index("ix_oauthgrant_access_token_hash", "oauthgrant", ["access_token_hash"], unique=True)
    op.create_index("ix_oauthgrant_refresh_token_hash", "oauthgrant", ["refresh_token_hash"], unique=True)
    op.create_index("ix_oauthgrant_client_id", "oauthgrant", ["client_id"])
    op.create_index("ix_oauthgrant_user_id", "oauthgrant", ["user_id"])


def downgrade() -> None:
    op.drop_table("oauthgrant")
    op.drop_table("oauthauthorizationcode")
    op.drop_table("oauthclient")

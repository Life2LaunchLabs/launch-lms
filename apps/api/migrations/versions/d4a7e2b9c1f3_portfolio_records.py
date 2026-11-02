"""Portfolio records: credentials, people and quotes, résumé versions, documents; the name you go by

Revision ID: d4a7e2b9c1f3
Revises: c6f9d3e5a7b2
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "d4a7e2b9c1f3"
down_revision = "c6f9d3e5a7b2"
branch_labels = None
depends_on = None


def _common(name: str) -> list:
    return [
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(f"{name}_uuid", sa.String(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolio.id", ondelete="CASCADE"), nullable=False),
    ]


def _dates() -> list:
    return [
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    ]


def _fk(name: str, target: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey(target, ondelete="SET NULL"), nullable=True)


TABLES = (
    ("portfoliocredential", "credential"),
    ("portfoliocontact", "contact"),
    ("portfolioquote", "quote"),
    ("resumeversion", "version"),
    ("portfoliodocument", "document"),
)


def upgrade() -> None:
    op.add_column("user", sa.Column("preferred_name", sa.String(), nullable=True, server_default=""))

    op.create_table(
        "portfoliocredential", *_common("credential"),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("issuer", sa.String(), nullable=False, server_default=""),
        sa.Column("issued_on", sa.String(), nullable=True),
        sa.Column("expires_on", sa.String(), nullable=True),
        sa.Column("expected_on", sa.String(), nullable=True),
        sa.Column("score", sa.String(), nullable=False, server_default=""),
        sa.Column("verification_status", sa.String(), nullable=False, server_default="self_reported"),
        _fk("photo_asset_id", "mediaasset.id"),
        _fk("timeline_entry_id", "timelineentry.id"),
        sa.Column("visibility", sa.String(), nullable=False, server_default="public"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("source_reference", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_dates(),
    )
    op.create_table(
        "portfoliocontact", *_common("contact"),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role_label", sa.String(), nullable=False, server_default=""),
        sa.Column("email", sa.String(), nullable=False, server_default=""),
        sa.Column("phone", sa.String(), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_reference", sa.Boolean(), nullable=False, server_default=sa.false()),
        _fk("linked_user_id", "user.id"),
        _fk("timeline_entry_id", "timelineentry.id"),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("source_reference", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_dates(),
    )
    op.create_table(
        "portfolioquote", *_common("quote"),
        sa.Column("contact_id", sa.Integer(), sa.ForeignKey("portfoliocontact.id", ondelete="CASCADE"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="self_reported"),
        _fk("timeline_entry_id", "timelineentry.id"),
        _fk("project_item_id", "projectitem.id"),
        sa.Column("visibility", sa.String(), nullable=False, server_default="public"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requested_at", sa.String(), nullable=True),
        sa.Column("confirmed_at", sa.String(), nullable=True),
        *_dates(),
    )
    op.create_index("ix_portfolioquote_contact_id", "portfolioquote", ["contact_id"])
    op.create_table(
        "resumeversion", *_common("version"),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("layout", sa.String(), nullable=False, server_default="classic"),
        sa.Column("accent", sa.String(), nullable=False, server_default="blue"),
        sa.Column("excluded", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_dates(),
    )
    op.create_table(
        "portfoliodocument", *_common("document"),
        sa.Column("kind", sa.String(), nullable=False, server_default="upload"),
        sa.Column("title", sa.String(), nullable=False),
        _fk("media_asset_id", "mediaasset.id"),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("visibility", sa.String(), nullable=False, server_default="private"),
        *_dates(),
    )
    for table, name in TABLES:
        op.create_index(f"ix_{table}_{name}_uuid", table, [f"{name}_uuid"], unique=True)
        op.create_index(f"ix_{table}_portfolio_id", table, ["portfolio_id"])

    # A portfolio display name that isn't just the legal name becomes the name they go by.
    op.execute(
        """
        UPDATE "user" SET preferred_name = TRIM(p.display_name)
        FROM portfolio p
        WHERE p.user_id = "user".id
          AND TRIM(COALESCE(p.display_name, '')) <> ''
          AND TRIM(p.display_name) <> TRIM(CONCAT_WS(' ', NULLIF("user".first_name, ''), NULLIF("user".last_name, '')))
          AND TRIM(p.display_name) <> TRIM(COALESCE("user".first_name, ''))
        """
    )
    # One bio: the account bio fills an empty portfolio bio.
    op.execute(
        """
        UPDATE portfolio SET short_bio = u.bio
        FROM "user" u
        WHERE portfolio.user_id = u.id AND COALESCE(portfolio.short_bio, '') = '' AND COALESCE(u.bio, '') <> ''
        """
    )


def downgrade() -> None:
    for table, name in reversed(TABLES):
        op.drop_index(f"ix_{table}_portfolio_id", table_name=table)
        op.drop_index(f"ix_{table}_{name}_uuid", table_name=table)
    op.drop_index("ix_portfolioquote_contact_id", table_name="portfolioquote")
    for table, _ in reversed(TABLES):
        op.drop_table(table)
    op.drop_column("user", "preferred_name")

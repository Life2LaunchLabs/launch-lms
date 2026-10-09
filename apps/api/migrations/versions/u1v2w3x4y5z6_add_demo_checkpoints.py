"""Add demo control state, immutable checkpoints and disposable session registry.

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
"""

from alembic import op
import sqlalchemy as sa

revision = "u1v2w3x4y5z6"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "democonfiguration",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("source_user_id", sa.Integer()),
        sa.Column("entry_org_id", sa.Integer()),
        *[
            sa.Column(name, sa.Integer(), nullable=False)
            for name in (
                "capacity",
                "session_minutes",
                "extension_minutes",
                "ai_requests_per_minute",
                "ai_tokens_per_visitor",
                "ai_tokens_per_day",
                "revision",
            )
        ],
        sa.Column("checkpoint_id", sa.String()),
    )
    op.execute(
        sa.text("""INSERT INTO democonfiguration
        (id, enabled, capacity, session_minutes, extension_minutes, ai_requests_per_minute,
         ai_tokens_per_visitor, ai_tokens_per_day, revision)
        VALUES (1, false, 200, 60, 30, 10, 100000, 2000000, 1)""")
    )
    op.create_table(
        "democheckpoint",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("schema_signature", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("source_user_id", sa.Integer(), nullable=False),
        sa.Column("entry_org_slug", sa.String(), nullable=False),
        sa.Column("source_email", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_table(
        "demosession",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("checkpoint_id", sa.String(), nullable=False),
        sa.Column("visitor_id", sa.String(), nullable=False),
        sa.Column("namespace", sa.String(), nullable=False),
        sa.Column("schema_signature", sa.String(), nullable=False, server_default=""),
        sa.Column(
            "duration_minutes", sa.Integer(), nullable=False, server_default="60"
        ),
        sa.Column("aliases", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime()),
        sa.Column("cleaned_at", sa.DateTime()),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("error", sa.Text()),
    )
    op.create_index(
        "ix_demosession_namespace", "demosession", ["namespace"], unique=True
    )
    for name in ("visitor_id", "expires_at", "state"):
        op.create_index(f"ix_demosession_{name}", "demosession", [name])
    op.create_table(
        "demousage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("tokens", sa.Integer(), nullable=False),
        sa.Column("requests", sa.Integer(), nullable=False),
    )


def downgrade():
    # Never drop an active visitor schema as a side effect of a control migration.
    op.drop_table("demousage")
    op.drop_table("demosession")
    op.drop_table("democheckpoint")
    op.drop_table("democonfiguration")

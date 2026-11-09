"""User tests: cohorts, test personas, their orgs, captured test mail and login links

Revision ID: u5e6r7t8e9s0
Revises: t1j2o3b4t5i6
Create Date: 2026-11-09
"""

from alembic import op
import sqlalchemy as sa

revision = "u5e6r7t8e9s0"
down_revision = "t1j2o3b4t5i6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "test_cohort",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_uuid", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.String(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.DateTime(), nullable=False),
        sa.Column("update_date", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_test_cohort_cohort_uuid", "test_cohort", ["cohort_uuid"], unique=True)
    op.create_index("ix_test_cohort_slug", "test_cohort", ["slug"], unique=True)

    op.create_table(
        "test_persona",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("test_cohort.id", ondelete="CASCADE"), nullable=False),
        sa.Column("handle", sa.String(), nullable=False),
        sa.Column("brief", sa.Text(), nullable=False, server_default=""),
        sa.Column("start_state", sa.String(), nullable=False, server_default="has_account"),
        sa.Column("last_active_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_test_persona_cohort_id", "test_persona", ["cohort_id"])

    op.create_table(
        "test_cohort_org",
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("test_cohort.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("creation_date", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_test_cohort_org_cohort_id", "test_cohort_org", ["cohort_id"])

    op.create_table(
        "test_mail",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), nullable=True),
        sa.Column("to_address", sa.String(), nullable=False),
        sa.Column("to_user_id", sa.Integer(), nullable=True),
        sa.Column("from_user_id", sa.Integer(), nullable=True),
        sa.Column("subject", sa.String(), nullable=False, server_default=""),
        sa.Column("html", sa.Text(), nullable=False, server_default=""),
        sa.Column("links", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False, server_default="test_address"),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_test_mail_cohort_id", "test_mail", ["cohort_id"])
    op.create_index("ix_test_mail_to_address", "test_mail", ["to_address"])
    op.create_index("ix_test_mail_to_user_id", "test_mail", ["to_user_id"])
    op.create_index("ix_test_mail_captured_at", "test_mail", ["captured_at"])

    op.create_table(
        "test_login_ticket",
        sa.Column("token_hash", sa.String(), primary_key=True),
        sa.Column("persona_user_id", sa.Integer(), nullable=False),
        sa.Column("operator_user_id", sa.Integer(), nullable=False),
        sa.Column("target_path", sa.String(), nullable=False, server_default="/"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_test_login_ticket_persona_user_id", "test_login_ticket", ["persona_user_id"])


def downgrade():
    op.drop_table("test_login_ticket")
    op.drop_table("test_mail")
    op.drop_table("test_cohort_org")
    op.drop_table("test_persona")
    op.drop_table("test_cohort")

"""Public catalog: careers from O*NET and schools from the College Scorecard

Revision ID: a5c3e7f9b1d2
Revises: d4e8a2c6f1b9
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "a5c3e7f9b1d2"
down_revision = "d4e8a2c6f1b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "careerentry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("soc", sa.String(length=8), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("job_zone", sa.Integer(), nullable=True),
        sa.Column("interests", sa.JSON(), nullable=False),
        sa.Column("alt_titles", sa.JSON(), nullable=False),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("estimatesource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_careerentry_code", "careerentry", ["code"])
    op.create_index("ix_careerentry_soc", "careerentry", ["soc"])
    op.create_index("ix_careerentry_source_id", "careerentry", ["source_id"])
    op.create_index("ix_careerentry_status", "careerentry", ["status"])

    op.create_table(
        "schoolentry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("unitid", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(), nullable=False, server_default=""),
        sa.Column("city", sa.String(), nullable=False, server_default=""),
        sa.Column("state", sa.String(length=4), nullable=False, server_default=""),
        sa.Column("url", sa.String(), nullable=False, server_default=""),
        sa.Column("control", sa.String(), nullable=False, server_default=""),
        sa.Column("degree", sa.String(), nullable=False, server_default=""),
        sa.Column("students", sa.Integer(), nullable=True),
        sa.Column("admission_rate", sa.Float(), nullable=True),
        sa.Column("completion_rate", sa.Float(), nullable=True),
        sa.Column("median_earnings", sa.Float(), nullable=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("estimatesource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("unitid"),
    )
    op.create_index("ix_schoolentry_unitid", "schoolentry", ["unitid"])
    op.create_index("ix_schoolentry_state", "schoolentry", ["state"])
    op.create_index("ix_schoolentry_source_id", "schoolentry", ["source_id"])
    op.create_index("ix_schoolentry_status", "schoolentry", ["status"])


def downgrade() -> None:
    op.drop_table("schoolentry")
    op.drop_table("careerentry")

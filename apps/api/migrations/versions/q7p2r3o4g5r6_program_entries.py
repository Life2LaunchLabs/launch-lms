"""Programs at schools, from the College Scorecard's field-of-study file

Revision ID: q7p2r3o4g5r6
Revises: p6c2a7r3e4e5
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "q7p2r3o4g5r6"
down_revision = "p6c2a7r3e4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("programentry"):
        return
    op.create_table(
        "programentry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("unitid", sa.String(12), nullable=False),
        sa.Column("school", sa.String(), nullable=False, server_default=""),
        sa.Column("cip", sa.String(8), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column("credential", sa.Integer(), nullable=False),
        sa.Column("graduates", sa.Integer(), nullable=True),
        sa.Column("earnings_1yr", sa.Float(), nullable=True),
        sa.Column("earnings_5yr", sa.Float(), nullable=True),
        sa.Column("in_state", sa.Float(), nullable=True),
        sa.Column("debt", sa.Float(), nullable=True),
        sa.Column("online", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("estimatesource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("unitid", "cip", "credential", "source_id"),
    )
    for column in ("unitid", "cip", "credential", "source_id", "status"):
        op.create_index(f"ix_programentry_{column}", "programentry", [column])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("programentry"):
        op.drop_table("programentry")

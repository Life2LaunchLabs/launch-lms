"""career explorer: career resource type, career tasks, swipe skips, saved-career interest and EPP flags

Revision ID: k7c3a9r5e1e2
Revises: s7c8h9o0o1l2
"""

import sqlalchemy as sa
from alembic import op


revision = "k7c3a9r5e1e2"
down_revision = "s7c8h9o0o1l2"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE resourcetypeenum ADD VALUE IF NOT EXISTS 'career'")

    if "tasks" not in _columns("careerentry"):
        op.add_column("careerentry", sa.Column("tasks", sa.JSON(), nullable=False, server_default="[]"))

    saved = _columns("usersavedresource")
    if "interest_level" not in saved:
        op.add_column("usersavedresource", sa.Column("interest_level", sa.Integer(), nullable=True))
    if "show_on_epp" not in saved:
        op.add_column("usersavedresource", sa.Column("show_on_epp", sa.Boolean(), nullable=False, server_default=sa.false()))

    if not sa.inspect(bind).has_table("careerskip"):
        op.create_table(
            "careerskip",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
            sa.Column("code", sa.String(16), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("update_date", sa.String(), nullable=False, server_default=""),
            sa.UniqueConstraint("user_id", "code"),
        )
        op.create_index("ix_careerskip_user_id", "careerskip", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_careerskip_user_id", table_name="careerskip")
    op.drop_table("careerskip")
    op.drop_column("usersavedresource", "show_on_epp")
    op.drop_column("usersavedresource", "interest_level")
    op.drop_column("careerentry", "tasks")
    # PostgreSQL enum values cannot be removed safely while rows may use them.

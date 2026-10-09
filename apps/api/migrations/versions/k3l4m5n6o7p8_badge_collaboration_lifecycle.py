"""preserve badge collaboration lifecycle

Revision ID: k3l4m5n6o7p8
Revises: j2k3l4m5n6o7
"""

from alembic import op
import sqlalchemy as sa

revision = "k3l4m5n6o7p8"
down_revision = "j2k3l4m5n6o7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("badgeissuerlearnerlink", sa.Column("end_reason", sa.String(), nullable=True))
    op.add_column(
        "badgeissuerlearnerlink",
        sa.Column("ended_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("badgeissuerlearnerlink", sa.Column("ended_at", sa.DateTime(), nullable=True))
    op.add_column(
        "programobjective",
        sa.Column("accept_previous_major_versions", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("programobjective", "accept_previous_major_versions")
    op.drop_column("badgeissuerlearnerlink", "ended_at")
    op.drop_column("badgeissuerlearnerlink", "ended_by_user_id")
    op.drop_column("badgeissuerlearnerlink", "end_reason")

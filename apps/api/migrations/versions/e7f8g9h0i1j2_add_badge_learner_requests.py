"""add badge learner request workflow

Revision ID: e7f8g9h0i1j2
Revises: d6e7f8g9h0i1
"""

from alembic import op
import sqlalchemy as sa


revision = "e7f8g9h0i1j2"
down_revision = "d6e7f8g9h0i1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("badgeissuerlearnerlink", sa.Column("status", sa.String(), nullable=False, server_default="accepted"))
    op.add_column("badgeissuerlearnerlink", sa.Column("requested_by_user_id", sa.Integer(), nullable=True))
    op.add_column("badgeissuerlearnerlink", sa.Column("decided_by_user_id", sa.Integer(), nullable=True))
    op.add_column("badgeissuerlearnerlink", sa.Column("decided_at", sa.DateTime(), nullable=True))
    op.add_column("badgeissuerlearnerlink", sa.Column("staff_user_ids", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("badgeissuerlearnerlink", sa.Column("message", sa.String(), nullable=True))
    op.create_index("ix_badgeissuerlearnerlink_status", "badgeissuerlearnerlink", ["status"])
    op.create_foreign_key("fk_issuer_link_requested_by", "badgeissuerlearnerlink", "user", ["requested_by_user_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_issuer_link_decided_by", "badgeissuerlearnerlink", "user", ["decided_by_user_id"], ["id"], ondelete="SET NULL")

    op.add_column("learningrun", sa.Column("issuer_learner_link_id", sa.Integer(), nullable=True))
    op.create_index("ix_learningrun_issuer_learner_link_id", "learningrun", ["issuer_learner_link_id"])
    op.create_foreign_key("fk_learningrun_issuer_learner_link", "learningrun", "badgeissuerlearnerlink", ["issuer_learner_link_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_learningrun_issuer_learner_link", "learningrun", type_="foreignkey")
    op.drop_index("ix_learningrun_issuer_learner_link_id", table_name="learningrun")
    op.drop_column("learningrun", "issuer_learner_link_id")

    op.drop_constraint("fk_issuer_link_decided_by", "badgeissuerlearnerlink", type_="foreignkey")
    op.drop_constraint("fk_issuer_link_requested_by", "badgeissuerlearnerlink", type_="foreignkey")
    op.drop_index("ix_badgeissuerlearnerlink_status", table_name="badgeissuerlearnerlink")
    op.drop_column("badgeissuerlearnerlink", "message")
    op.drop_column("badgeissuerlearnerlink", "staff_user_ids")
    op.drop_column("badgeissuerlearnerlink", "decided_at")
    op.drop_column("badgeissuerlearnerlink", "decided_by_user_id")
    op.drop_column("badgeissuerlearnerlink", "requested_by_user_id")
    op.drop_column("badgeissuerlearnerlink", "status")

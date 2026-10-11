"""badges earned through plan templates

Revision ID: u5y6z7a8b9c0
Revises: t4x5y6z7a8b9

``badgeroute`` lists the plan templates a badge's creator publishes as ways to
earn it; ``badgerouteoffer`` records which routes an issuer offers (an issuer
with none offers every route). Plans started from a badge point back at it
(``plan.source_badge_id``).
"""

import sqlalchemy as sa
from alembic import op

revision = "u5y6z7a8b9c0"
down_revision = "t4x5y6z7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "badgeroute",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("route_uuid", sa.String(), nullable=False, server_default=""),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("program.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recommended", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("route_uuid"),
        sa.UniqueConstraint("badge_id", "program_id"),
    )
    op.create_index("ix_badgeroute_route_uuid", "badgeroute", ["route_uuid"])
    op.create_index("ix_badgeroute_badge_id", "badgeroute", ["badge_id"])
    op.create_index("ix_badgeroute_program_id", "badgeroute", ["program_id"])
    op.create_table(
        "badgerouteoffer",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("badgeroute.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issuer_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("route_id", "issuer_org_id"),
    )
    op.create_index("ix_badgerouteoffer_route_id", "badgerouteoffer", ["route_id"])
    op.create_index("ix_badgerouteoffer_issuer_org_id", "badgerouteoffer", ["issuer_org_id"])
    op.add_column("plan", sa.Column("source_badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_plan_source_badge_id", "plan", ["source_badge_id"])


def downgrade() -> None:
    op.drop_index("ix_plan_source_badge_id", table_name="plan")
    op.drop_column("plan", "source_badge_id")
    op.drop_index("ix_badgerouteoffer_issuer_org_id", table_name="badgerouteoffer")
    op.drop_index("ix_badgerouteoffer_route_id", table_name="badgerouteoffer")
    op.drop_table("badgerouteoffer")
    op.drop_index("ix_badgeroute_program_id", table_name="badgeroute")
    op.drop_index("ix_badgeroute_badge_id", table_name="badgeroute")
    op.drop_index("ix_badgeroute_route_uuid", table_name="badgeroute")
    op.drop_table("badgeroute")

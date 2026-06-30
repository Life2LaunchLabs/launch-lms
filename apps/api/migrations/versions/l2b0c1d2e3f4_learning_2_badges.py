"""Learning 2.0 badges

Revision ID: l2b0c1d2e3f4
Revises: a0b1c2d3e4f6
Create Date: 2026-06-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


revision: str = "l2b0c1d2e3f4"
down_revision: Union[str, None] = "a0b1c2d3e4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "badgecollection",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("thumbnail_image", sa.String(), nullable=True),
        sa.Column("public", sa.Boolean(), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False),
        sa.Column("collection_uuid", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("collection_uuid"),
    )
    op.create_index("ix_badgecollection_org_id", "badgecollection", ["org_id"])
    op.create_index("ix_badgecollection_collection_uuid", "badgecollection", ["collection_uuid"])

    op.create_table(
        "learningbadge",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("collection_id", sa.Integer(), sa.ForeignKey("badgecollection.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("about", sa.String(), nullable=True),
        sa.Column("criteria", sa.String(), nullable=True),
        sa.Column("thumbnail_image", sa.String(), nullable=True),
        sa.Column("public", sa.Boolean(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("direct_conferral_enabled", sa.Boolean(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("badge_uuid", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("badge_uuid"),
    )
    op.create_index("ix_learningbadge_org_id", "learningbadge", ["org_id"])
    op.create_index("ix_learningbadge_collection_id", "learningbadge", ["collection_id"])
    op.create_index("ix_learningbadge_badge_uuid", "learningbadge", ["badge_uuid"])

    op.create_table(
        "learningpath",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("path_uuid", sa.String(), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("badge_id"),
        sa.UniqueConstraint("path_uuid"),
    )
    op.create_index("ix_learningpath_badge_id", "learningpath", ["badge_id"])
    op.create_index("ix_learningpath_org_id", "learningpath", ["org_id"])
    op.create_index("ix_learningpath_path_uuid", "learningpath", ["path_uuid"])

    op.create_table(
        "learningactivity",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("path_id", sa.Integer(), sa.ForeignKey("learningpath.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("thumbnail_image", sa.String(), nullable=True),
        sa.Column("icon", sa.String(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=True),
        sa.Column("activity_uuid", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("activity_uuid"),
    )
    op.create_index("ix_learningactivity_path_id", "learningactivity", ["path_id"])
    op.create_index("ix_learningactivity_badge_id", "learningactivity", ["badge_id"])
    op.create_index("ix_learningactivity_org_id", "learningactivity", ["org_id"])
    op.create_index("ix_learningactivity_activity_uuid", "learningactivity", ["activity_uuid"])

    op.create_table(
        "learningpage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=True),
        sa.Column("design", sa.JSON(), nullable=True),
        sa.Column("scoring", sa.JSON(), nullable=True),
        sa.Column("completion", sa.JSON(), nullable=True),
        sa.Column("page_uuid", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("page_uuid"),
    )
    op.create_index("ix_learningpage_activity_id", "learningpage", ["activity_id"])
    op.create_index("ix_learningpage_badge_id", "learningpage", ["badge_id"])
    op.create_index("ix_learningpage_org_id", "learningpage", ["org_id"])
    op.create_index("ix_learningpage_page_uuid", "learningpage", ["page_uuid"])

    op.create_table(
        "learningrun",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_uuid", sa.String(), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("path_id", sa.Integer(), sa.ForeignKey("learningpath.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=True),
        sa.Column("guest_session_id", sa.Integer(), sa.ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("run_uuid"),
    )
    op.create_index("ix_learningrun_run_uuid", "learningrun", ["run_uuid"])
    op.create_index("ix_learningrun_badge_id", "learningrun", ["badge_id"])
    op.create_index("ix_learningrun_path_id", "learningrun", ["path_id"])
    op.create_index("ix_learningrun_org_id", "learningrun", ["org_id"])
    op.create_index("ix_learningrun_user_id", "learningrun", ["user_id"])
    op.create_index("ix_learningrun_guest_session_id", "learningrun", ["guest_session_id"])

    op.create_table(
        "learningactivityrun",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("learningrun.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.UniqueConstraint("run_id", "activity_id"),
    )
    op.create_index("ix_learningactivityrun_run_id", "learningactivityrun", ["run_id"])
    op.create_index("ix_learningactivityrun_activity_id", "learningactivityrun", ["activity_id"])

    op.create_table(
        "learningpageprogress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("learningrun.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_run_id", sa.Integer(), sa.ForeignKey("learningactivityrun.id", ondelete="CASCADE"), nullable=True),
        sa.Column("page_id", sa.Integer(), sa.ForeignKey("learningpage.id", ondelete="CASCADE"), nullable=False),
        sa.Column("complete", sa.Boolean(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("run_id", "page_id"),
    )
    op.create_index("ix_learningpageprogress_run_id", "learningpageprogress", ["run_id"])
    op.create_index("ix_learningpageprogress_activity_run_id", "learningpageprogress", ["activity_run_id"])
    op.create_index("ix_learningpageprogress_page_id", "learningpageprogress", ["page_id"])

    op.create_table(
        "learningresponseattempt",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("attempt_uuid", sa.String(), nullable=False),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("learningrun.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_id", sa.Integer(), sa.ForeignKey("learningpage.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=True),
        sa.Column("guest_session_id", sa.Integer(), sa.ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True),
        sa.Column("answer", sa.JSON(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback_key", sa.String(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=False),
        sa.Column("graded_at", sa.DateTime(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
    )
    op.create_index("ix_learningresponseattempt_attempt_uuid", "learningresponseattempt", ["attempt_uuid"])
    op.create_index("ix_learningresponseattempt_run_id", "learningresponseattempt", ["run_id"])
    op.create_index("ix_learningresponseattempt_page_id", "learningresponseattempt", ["page_id"])
    op.create_index("ix_learningresponseattempt_user_id", "learningresponseattempt", ["user_id"])
    op.create_index("ix_learningresponseattempt_guest_session_id", "learningresponseattempt", ["guest_session_id"])

    op.create_table(
        "learningbadgeaward",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("award_uuid", sa.String(), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("learningrun.id", ondelete="SET NULL"), nullable=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("conferred_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("award_uuid"),
        sa.UniqueConstraint("badge_id", "user_id"),
    )
    op.create_index("ix_learningbadgeaward_award_uuid", "learningbadgeaward", ["award_uuid"])
    op.create_index("ix_learningbadgeaward_badge_id", "learningbadgeaward", ["badge_id"])
    op.create_index("ix_learningbadgeaward_run_id", "learningbadgeaward", ["run_id"])
    op.create_index("ix_learningbadgeaward_org_id", "learningbadgeaward", ["org_id"])
    op.create_index("ix_learningbadgeaward_user_id", "learningbadgeaward", ["user_id"])


def downgrade() -> None:
    op.drop_table("learningbadgeaward")
    op.drop_table("learningresponseattempt")
    op.drop_table("learningpageprogress")
    op.drop_table("learningactivityrun")
    op.drop_table("learningrun")
    op.drop_table("learningpage")
    op.drop_table("learningactivity")
    op.drop_table("learningpath")
    op.drop_table("learningbadge")
    op.drop_table("badgecollection")

"""add organization requirement frameworks

Revision ID: b942a83d0f5e
Revises: a831f72c9e4d
"""

from alembic import op
import sqlalchemy as sa


revision = "b942a83d0f5e"
down_revision = "a831f72c9e4d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("requirementframework",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("framework_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False), sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("source_framework_uuid", sa.String(), nullable=True), sa.Column("source_version", sa.Integer(), nullable=True),
        sa.Column("source_metadata", sa.JSON(), nullable=False, server_default="{}"), sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("published_version", sa.Integer(), nullable=True), sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""), sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("framework_uuid"))
    op.create_index("ix_requirementframework_org_id", "requirementframework", ["org_id"])
    op.create_index("ix_requirementframework_framework_uuid", "requirementframework", ["framework_uuid"])
    op.create_table("requirementframeworkversion",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("version_uuid", sa.String(), nullable=False),
        sa.Column("framework_id", sa.Integer(), sa.ForeignKey("requirementframework.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False), sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("published_at", sa.DateTime(), nullable=True), sa.Column("published_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""), sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("version_uuid"), sa.UniqueConstraint("framework_id", "version_number"))
    op.create_index("ix_requirementframeworkversion_framework_id", "requirementframeworkversion", ["framework_id"])
    op.create_table("requirementnode",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("node_version_uuid", sa.String(), nullable=False), sa.Column("node_uuid", sa.String(), nullable=False),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("requirementframeworkversion.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_node_uuid", sa.String(), nullable=True), sa.Column("code", sa.String(), nullable=False, server_default=""),
        sa.Column("title", sa.String(), nullable=False), sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"), sa.Column("metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""), sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("node_version_uuid"), sa.UniqueConstraint("version_id", "node_uuid"))
    op.create_index("ix_requirementnode_version_id", "requirementnode", ["version_id"])
    op.create_index("ix_requirementnode_node_uuid", "requirementnode", ["node_uuid"])
    op.create_table("programobjectiverequirement",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("mapping_uuid", sa.String(), nullable=False, unique=True),
        sa.Column("program_objective_id", sa.Integer(), sa.ForeignKey("programobjective.id", ondelete="CASCADE"), nullable=False),
        sa.Column("framework_id", sa.Integer(), sa.ForeignKey("requirementframework.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_uuid", sa.String(), nullable=False), sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("program_objective_id", "framework_id", "node_uuid"))
    op.create_index("ix_programobjectiverequirement_program_objective_id", "programobjectiverequirement", ["program_objective_id"])
    op.create_table("requirementassignmentbatch",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("batch_uuid", sa.String(), nullable=False), sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("framework_id", sa.Integer(), sa.ForeignKey("requirementframework.id", ondelete="CASCADE"), nullable=False), sa.Column("version_id", sa.Integer(), sa.ForeignKey("requirementframeworkversion.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("usergroup_id", sa.Integer(), sa.ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""), sa.Column("update_date", sa.String(), nullable=False, server_default=""), sa.UniqueConstraint("batch_uuid"))
    op.create_index("ix_requirementassignmentbatch_org_id", "requirementassignmentbatch", ["org_id"])
    op.create_table("requirementenrollment",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("enrollment_uuid", sa.String(), nullable=False), sa.Column("batch_id", sa.Integer(), sa.ForeignKey("requirementassignmentbatch.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False), sa.Column("framework_id", sa.Integer(), sa.ForeignKey("requirementframework.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("requirementframeworkversion.id", ondelete="RESTRICT"), nullable=False), sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"), sa.Column("framework_snapshot", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("completed_at", sa.DateTime(), nullable=True), sa.Column("creation_date", sa.String(), nullable=False, server_default=""), sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("enrollment_uuid"), sa.UniqueConstraint("batch_id", "user_id"))
    op.create_index("ix_requirementenrollment_org_id", "requirementenrollment", ["org_id"])
    op.create_index("ix_requirementenrollment_user_id", "requirementenrollment", ["user_id"])
    op.create_table("requirementattainmentsource",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("source_uuid", sa.String(), nullable=False), sa.Column("enrollment_id", sa.Integer(), sa.ForeignKey("requirementenrollment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_uuid", sa.String(), nullable=False), sa.Column("plan_objective_progress_id", sa.Integer(), sa.ForeignKey("planobjectiveprogress.id", ondelete="CASCADE"), nullable=True),
        sa.Column("objective_progress_id", sa.Integer(), sa.ForeignKey("objectiveprogress.id", ondelete="CASCADE"), nullable=True), sa.Column("objective_title", sa.String(), nullable=False, server_default=""),
        sa.Column("evidence_snapshot", sa.JSON(), nullable=False, server_default="{}"), sa.Column("verified_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True), sa.Column("revoked_at", sa.DateTime(), nullable=True), sa.Column("creation_date", sa.String(), nullable=False, server_default=""), sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("source_uuid"), sa.UniqueConstraint("enrollment_id", "node_uuid", "plan_objective_progress_id"), sa.UniqueConstraint("enrollment_id", "node_uuid", "objective_progress_id"))
    op.create_index("ix_requirementattainmentsource_enrollment_id", "requirementattainmentsource", ["enrollment_id"])


def downgrade() -> None:
    for table in ["requirementattainmentsource", "requirementenrollment", "requirementassignmentbatch", "programobjectiverequirement", "requirementnode", "requirementframeworkversion", "requirementframework"]:
        op.drop_table(table)

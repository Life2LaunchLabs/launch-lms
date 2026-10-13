"""plan template versions

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2

Plan templates gain published versions. A version is an immutable snapshot of
the template (settings, phases, objectives) whose activities are frozen
copies; new plans are issued from the template's published version and pin
it, so learners' runs and answers stay with the version they were issued.

No data moves here: a template publishes its first version the first time a
plan is issued from it (or when an admin publishes), and an activity that
plans already play becomes that version's frozen copy in place.
"""

from alembic import op
import sqlalchemy as sa


revision = "x8y9z0a1b2c3"
down_revision = "w7x8y9z0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "programtemplateversion",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version_uuid", sa.String(), nullable=False),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("program.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=False, server_default=""),
        sa.Column("note", sa.String(), nullable=False, server_default=""),
        sa.Column("restored_from_number", sa.Integer(), nullable=True),
        sa.Column("published_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("version_uuid"),
        sa.UniqueConstraint("program_id", "number"),
    )
    for column in ("version_uuid", "program_id", "org_id"):
        op.create_index(f"ix_programtemplateversion_{column}", "programtemplateversion", [column])

    op.add_column("program", sa.Column("published_version_id", sa.Integer(), nullable=True))
    op.add_column(
        "programassignment",
        sa.Column("template_version_id", sa.Integer(), sa.ForeignKey("programtemplateversion.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_programassignment_template_version_id", "programassignment", ["template_version_id"])

    op.create_table(
        "frozenactivity",
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("source_activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_hash", sa.String(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_frozenactivity_source_activity_id", "frozenactivity", ["source_activity_id"])
    op.create_index("ix_frozenactivity_source_hash", "frozenactivity", ["source_hash"])


def downgrade() -> None:
    op.drop_table("frozenactivity")
    op.drop_index("ix_programassignment_template_version_id", table_name="programassignment")
    op.drop_column("programassignment", "template_version_id")
    op.drop_column("program", "published_version_id")
    op.drop_table("programtemplateversion")

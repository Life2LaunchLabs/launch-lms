"""Add learner-granted Hub editing runs and activity events."""

from alembic import op
import sqlalchemy as sa

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hubeditrun",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_uuid", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("scope_kind", sa.String(length=32), nullable=False),
        sa.Column("target_uuid", sa.String(length=120), nullable=True),
        sa.Column("target_label", sa.String(length=240), nullable=False),
        sa.Column("route", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("started_from_action_id", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["hubconversation.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("started_from_action_id", name="uq_hubeditrun_started_action"),
        sa.UniqueConstraint("run_uuid"),
    )
    op.create_index("ix_hubeditrun_run_uuid", "hubeditrun", ["run_uuid"], unique=True)
    op.create_index("ix_hubeditrun_conversation_id", "hubeditrun", ["conversation_id"])
    op.create_index("ix_hubeditrun_org_id", "hubeditrun", ["org_id"])
    op.create_index("ix_hubeditrun_user_id", "hubeditrun", ["user_id"])
    op.create_index("ix_hubeditrun_status", "hubeditrun", ["status"])
    op.create_index("ix_hubeditrun_target_uuid", "hubeditrun", ["target_uuid"])
    op.create_index("ix_hubeditrun_created_at", "hubeditrun", ["created_at"])
    op.create_index("ix_hubeditrun_updated_at", "hubeditrun", ["updated_at"])
    op.create_index("ix_hubeditrun_ended_at", "hubeditrun", ["ended_at"])
    op.create_index("ix_hubeditrun_owner_status", "hubeditrun", ["org_id", "user_id", "status", "updated_at"])

    op.create_table(
        "hubeditrunevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_uuid", sa.String(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("object_type", sa.String(length=40), nullable=True),
        sa.Column("object_uuid", sa.String(length=120), nullable=True),
        sa.Column("object_label", sa.String(length=240), nullable=True),
        sa.Column("transient", sa.Boolean(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["hubeditrun.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_uuid"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_hubeditrunevent_sequence"),
    )
    op.create_index("ix_hubeditrunevent_event_uuid", "hubeditrunevent", ["event_uuid"], unique=True)
    op.create_index("ix_hubeditrunevent_run_id", "hubeditrunevent", ["run_id"])
    op.create_index("ix_hubeditrunevent_sequence", "hubeditrunevent", ["sequence"])
    op.create_index("ix_hubeditrunevent_object_uuid", "hubeditrunevent", ["object_uuid"])
    op.create_index("ix_hubeditrunevent_created_at", "hubeditrunevent", ["created_at"])

def downgrade():
    op.drop_table("hubeditrunevent")
    op.drop_table("hubeditrun")

"""Add private recovery state for native Hub object editors.

The existence check repairs an early development database that received this table
while the preceding, already-applied migration was still being edited.
"""

from alembic import op
import sqlalchemy as sa


revision = "t0u1v2w3x4y5"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("hubeditobjectstate"):
        return
    op.create_table(
        "hubeditobjectstate",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("object_key", sa.String(length=160), nullable=False),
        sa.Column("object_type", sa.String(length=40), nullable=False),
        sa.Column("object_uuid", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("current_fields", sa.JSON(), nullable=False),
        sa.Column("proposal_fields", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["hubeditrun.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "object_key", name="uq_hubeditobjectstate_run_object"),
    )
    op.create_index("ix_hubeditobjectstate_run_id", "hubeditobjectstate", ["run_id"])
    op.create_index("ix_hubeditobjectstate_object_uuid", "hubeditobjectstate", ["object_uuid"])
    op.create_index("ix_hubeditobjectstate_status", "hubeditobjectstate", ["status"])
    op.create_index("ix_hubeditobjectstate_updated_at", "hubeditobjectstate", ["updated_at"])


def downgrade():
    if sa.inspect(op.get_bind()).has_table("hubeditobjectstate"):
        op.drop_table("hubeditobjectstate")

"""add phases and learner-facing objective controls

Revision ID: x0y1z2a3b4c5
Revises: w9x0y1z2a3b4
"""

from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "x0y1z2a3b4c5"
down_revision = "w9x0y1z2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "programphase",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phase_uuid", sa.String(), nullable=False),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("program.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_days", sa.Integer(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("phase_uuid"),
    )
    op.create_index("ix_programphase_phase_uuid", "programphase", ["phase_uuid"])
    op.create_index("ix_programphase_program_id", "programphase", ["program_id"])
    op.add_column("programobjective", sa.Column("phase_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_programobjective_phase_id",
        "programobjective",
        "programphase",
        ["phase_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_programobjective_phase_id", "programobjective", ["phase_id"])
    op.add_column(
        "objective",
        sa.Column("allow_learner_confirmation", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    connection = op.get_bind()
    connection.execute(sa.text("UPDATE program SET status = 'active' WHERE status = 'draft'"))
    programs = connection.execute(sa.text("SELECT id, creation_date, update_date FROM program")).mappings().all()
    for program in programs:
        phase_uuid = f"program_phase_{uuid4()}"
        phase_id = connection.execute(
            sa.text(
                "INSERT INTO programphase "
                "(phase_uuid, program_id, name, description, position, creation_date, update_date) "
                "VALUES (:uuid, :program_id, 'Phase 1', '', 0, :created, :updated) RETURNING id"
            ),
            {
                "uuid": phase_uuid,
                "program_id": program["id"],
                "created": program["creation_date"] or "",
                "updated": program["update_date"] or "",
            },
        ).scalar_one()
        connection.execute(
            sa.text("UPDATE programobjective SET phase_id = :phase_id WHERE program_id = :program_id"),
            {"phase_id": phase_id, "program_id": program["id"]},
        )


def downgrade() -> None:
    op.drop_column("objective", "allow_learner_confirmation")
    op.drop_index("ix_programobjective_phase_id", table_name="programobjective")
    op.drop_constraint("fk_programobjective_phase_id", "programobjective", type_="foreignkey")
    op.drop_column("programobjective", "phase_id")
    op.drop_index("ix_programphase_program_id", table_name="programphase")
    op.drop_index("ix_programphase_phase_uuid", table_name="programphase")
    op.drop_table("programphase")

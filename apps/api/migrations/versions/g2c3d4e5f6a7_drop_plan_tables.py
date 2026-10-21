"""drop the plan and program tables, and the columns that pointed at them

Revision ID: g2c3d4e5f6a7
Revises: f9a3c6d8e2b4

Plans moved to goals in g1b2c3d4e5f6 and have been read-only since. This drops
the legacy tables (programs, their phases, objectives, assignments,
participants, versions and frozen activities; plans, their phases, objectives
and progress; legacy objective progress and objective requirement mappings)
and the columns that pointed at them: plan_id on the re-keyed sharing tables
(roles, collaborators, invitations, requests, attachments, activity log),
whose goal_id becomes required; plan_id and plan_objective_id on activity
runs; the plan and legacy progress ids on requirement sources (sources kept
from legacy progress stay as completion records); objective_id on activities;
and program_id on badge routes, whose goal_template_id becomes required.

Rows on those tables that never reached a goal (no goal_id or
goal_template_id) are deleted first: nothing reads them any more.

Downgrade raises: the dropped rows can't come back. Restore the pre-release
database backup instead.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g2c3d4e5f6a7'
down_revision: Union[str, None] = 'f9a3c6d8e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REKEYED = ("planrole", "plancollaborator", "planinvitation", "plancollaboratorrequest", "planattachment", "planactivity")
LEGACY_COLUMNS = {
    "learningrun": ("plan_id", "plan_objective_id"),
    "requirementattainmentsource": ("plan_objective_progress_id", "objective_progress_id"),
    "learningactivity": ("objective_id",),
    "badgeroute": ("program_id",),
    **{table: ("plan_id",) for table in REKEYED},
}
# Children before parents.
LEGACY_TABLES = (
    "planobjectiveprogress", "planobjective", "planphase", "plan",
    "programparticipant", "programassignment", "programtemplateversion",
    "objectiveprogress", "programobjectiverequirement", "programobjective", "programphase",
    "frozenactivity", "objective", "program",
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table in REKEYED:
        op.execute(f"DELETE FROM {table} WHERE goal_id IS NULL")
    op.execute("DELETE FROM badgeroute WHERE goal_template_id IS NULL")
    for table, columns in LEGACY_COLUMNS.items():
        present = {column["name"] for column in inspector.get_columns(table)}
        with op.batch_alter_table(table) as batch:
            for column in columns:
                if column in present:
                    batch.drop_column(column)
            if table in REKEYED:
                batch.alter_column("goal_id", existing_type=sa.Integer(), nullable=False)
            if table == "badgeroute":
                batch.alter_column("goal_template_id", existing_type=sa.Integer(), nullable=False)
    for table in LEGACY_TABLES:
        if table in tables:
            op.drop_table(table)


def downgrade() -> None:
    raise RuntimeError("The plan and program tables were dropped with their rows; restore the pre-release database backup to go back.")

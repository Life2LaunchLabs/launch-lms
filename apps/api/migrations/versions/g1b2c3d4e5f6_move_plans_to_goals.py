"""move plans to goals: copy every template, version, assignment and live plan into the goal tables

Revision ID: g1b2c3d4e5f6
Revises: g0c1d2e3f4a5

Runs ``src.services.goals.migration.run`` in the migration's transaction. It
checks its own result and raises if any template, assignment, plan, progress
status or requirement source didn't carry over, which rolls the whole move
back. Badge routes are then pointed at the templates they earn through. The plan tables stay as they are (read-only from the cutover release on)
until the cleanup release drops them; that release also turns this migration
into a no-op, since the code it runs goes with the plan tables.

Downgrade empties the goal tables and clears the goal columns on shared
tables. Goals created after the move are lost, so a real rollback restores the
pre-release database backup instead.
"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'g1b2c3d4e5f6'
down_revision: Union[str, None] = 'g0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")

# Same statement as g0c1d2e3f4a5: routes whose program now has a goal template (same uuid) point at it.
LINK_ROUTES = (
    "UPDATE badgeroute SET goal_template_id = (SELECT goal_template.id FROM goal_template JOIN program ON program.program_uuid = goal_template.template_uuid "
    "WHERE program.id = badgeroute.program_id) WHERE goal_template_id IS NULL AND program_id IS NOT NULL"
)


def upgrade() -> None:
    from sqlmodel import Session

    from src.services.goals.migration import run

    session = Session(bind=op.get_bind())
    result = run(session)
    session.flush()
    op.execute(LINK_ROUTES)
    log.info("Moved plans to goals: %s", ", ".join(f"{key} {value}" for key, value in result.counts.items()))
    for warning in result.warnings:
        log.warning("plans to goals: %s", warning)


def downgrade() -> None:
    op.execute("UPDATE learningrun SET goal_id = NULL, goal_step_id = NULL WHERE plan_id IS NOT NULL")
    op.execute("UPDATE requirementattainmentsource SET step_progress_id = NULL WHERE plan_objective_progress_id IS NOT NULL")
    op.execute("UPDATE learningactivity SET goal_template_id = NULL, frozen_from_id = NULL, frozen_hash = NULL")
    for table in ("planrole", "plancollaborator", "planinvitation", "plancollaboratorrequest", "planattachment", "planactivity"):
        op.execute(f"UPDATE {table} SET goal_id = NULL WHERE plan_id IS NOT NULL")
    for table in ("step_entry", "step_progress", "goal_story", "goal_step", "goal_stage", "goal", "goal_assignment"):
        op.execute(f"DELETE FROM {table}")
    # Unlink badge routes first, or deleting the templates would delete the routes with them.
    op.execute("UPDATE badgeroute SET goal_template_id = NULL WHERE program_id IS NOT NULL")
    op.execute("UPDATE goal_template SET published_version_id = NULL")
    op.execute("DELETE FROM goal_template_version")
    op.execute("DELETE FROM goal_template")

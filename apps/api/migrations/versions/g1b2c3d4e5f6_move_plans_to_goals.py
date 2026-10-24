"""move plans to goals: copy every template, version, assignment and live plan into the goal tables

Revision ID: g1b2c3d4e5f6
Revises: g0c1d2e3f4a5

The move itself ran in earlier releases (``services/goals/migration``), which
the badge refactor retired along with the models it wrote. An install that
still has plans to move here must upgrade through an earlier release first;
this revision checks and stops it, and is a no-op everywhere else.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'g1b2c3d4e5f6'
down_revision: Union[str, None] = 'g0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    bind = op.get_bind()
    if "program" not in sa.inspect(bind).get_table_names():
        return
    if bind.execute(sa.text("SELECT 1 FROM program LIMIT 1")).first() is not None:
        raise RuntimeError(
            "This database still has plans to move to goals. Upgrade through a release from before the badge "
            "refactor first (it runs the move), then upgrade to this one."
        )


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

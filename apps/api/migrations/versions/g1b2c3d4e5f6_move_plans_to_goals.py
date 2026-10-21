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


# Columns this revision's tables still have that today's models dropped, so the move
# doesn't set them: a value to hold while it runs, and how to fill them after it.
DROPPED_LATER = {
    ("goal_assignment", "active"): ("true", "UPDATE goal_assignment SET active = (status <> 'ended')"),
    ("goal_step", "allow_late"): ("false", None),
}


def _schema_drift() -> tuple[dict[str, list[sa.Column]], list[tuple[str, str]]]:
    """Columns today's models have that later revisions add (goal_assignment.status, ...), and
    required columns the models no longer have (goal_assignment.active), on existing tables.

    The move runs today's models, so it reads and writes every column they map. On a database
    upgrading through this revision in one go, the schema is still this revision's.
    """
    from sqlmodel import SQLModel

    from src.core.events.database import import_all_models

    import_all_models()
    inspector = sa.inspect(op.get_bind())
    existing = set(inspector.get_table_names())
    missing: dict[str, list[sa.Column]] = {}
    dropped: list[tuple[str, str]] = []
    for table in SQLModel.metadata.sorted_tables:
        if table.name not in existing:
            continue
        present = {column["name"]: column for column in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name not in present:
                kind = sa.String() if isinstance(column.type, sa.Enum) else column.type.copy()
                missing.setdefault(table.name, []).append(sa.Column(column.name, kind, nullable=True))
        for name, column in present.items():
            if name not in table.columns and not column["nullable"] and column.get("default") is None:
                if (table.name, name) not in DROPPED_LATER:
                    raise RuntimeError(f"{table.name}.{name} is required here but today's models don't set it")
                dropped.append((table.name, name))
    return missing, dropped


def upgrade() -> None:
    from sqlmodel import Session

    from src.services.goals.migration import run

    # Bridge the schema for the move only: later columns as plain nullable columns, dropped
    # after (the revisions that own them add and fill them, as on a database that ran this
    # revision before they existed), and dropped columns held at a default, then filled.
    later, dropped = _schema_drift()
    for table, columns in later.items():
        for column in columns:
            op.add_column(table, column)
    for table, name in dropped:
        op.alter_column(table, name, server_default=sa.text(DROPPED_LATER[(table, name)][0]))
    session = Session(bind=op.get_bind())
    result = run(session)
    session.flush()
    session.expunge_all()
    for table, name in dropped:
        fill = DROPPED_LATER[(table, name)][1]
        if fill:
            op.execute(fill)
        op.alter_column(table, name, server_default=None)
    for table, columns in later.items():
        for column in columns:
            op.drop_column(table, column.name)
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

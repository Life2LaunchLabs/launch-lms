"""Goals no learner should see any more.

Launch Ready (the starter, template ``program_starter``, ``system_type`` "starter")
is retired. Its goals stay in the database, but they are left out of every
learner surface: the goals list, This week, celebrations and Coach. That covers
goals created by the starter itself (source "starter") and goals an organization
assigned from the starter template (source "assignment"), which is how it was
still showing up on prod.
"""

from __future__ import annotations

from sqlalchemy import and_, not_, or_
from sqlmodel import select

from src.db.goals import Goal, GoalSource, GoalTemplate

STARTER_SYSTEM_TYPE = "starter"
STARTER_TEMPLATE_UUID = "program_starter"


def _starter_template_ids():
    return select(GoalTemplate.id).where(or_(
        GoalTemplate.system_type == STARTER_SYSTEM_TYPE,
        GoalTemplate.template_uuid == STARTER_TEMPLATE_UUID,
        GoalTemplate.source_template_uuid == STARTER_TEMPLATE_UUID,  # type: ignore[arg-type]
    ))


def is_retired():
    """A SQL condition true for a Launch Ready goal."""
    return or_(
        Goal.source == GoalSource.STARTER,
        and_(Goal.template_id.is_not(None), Goal.template_id.in_(_starter_template_ids())),  # type: ignore[union-attr]
    )


def shown():
    """A SQL condition true for every goal a learner may still see."""
    return not_(is_retired())

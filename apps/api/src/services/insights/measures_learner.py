"""Measures for following people one step at a time: steps done, how far each running plan is, and, on a
learner's dashboard, the days they were active and the check-ins staff wrote to them.

Steps done and plan progress read the same steps as ``measures_steps``. Days active and check-ins are about
one person, so they only make sense on a learner dashboard.
"""

from __future__ import annotations

from datetime import date

from sqlmodel import col, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.goals import DONE_STEP_STATUSES, GoalStatus, StepProgress
from src.db.user_organizations import UserOrganization
from src.services.insights.context import Ctx, as_date
from src.services.insights.measures import ALL_SCOPES, Fact, Measure, _active, _goal_dims, _iso
from src.services.insights.measures_steps import _events, _step_dims, _steps

LEARNER_ROLE_ID = 4


def _completed_at(ctx: Ctx) -> dict[int, object]:
    """When each done step was finished, from its progress row."""
    def load():
        ids = [int(step.id) for _, _, _, step, status in _steps(ctx) if status in DONE_STEP_STATUSES]  # type: ignore[arg-type]
        if not ids:
            return {}
        return dict(ctx.db.exec(select(StepProgress.step_id, StepProgress.completed_at).where(col(StepProgress.step_id).in_(ids))).all())
    return ctx.once("steps_completed_at", load)


def _steps_done(ctx: Ctx, since: date | None) -> list[Fact]:
    """Each done step, placed on the day it was finished (or, for older steps, its last move to done)."""
    events, completed = _events(ctx), _completed_at(ctx)
    out = []
    for goal, plan, version, step, status in _steps(ctx):
        if status not in DONE_STEP_STATUSES:
            continue
        moves = [when for when, _, to, _ in events.get(step.step_uuid, []) if to in DONE_STEP_STATUSES]
        stamp = completed.get(int(step.id)) or (moves[-1] if moves else None)  # type: ignore[arg-type]
        if stamp and (day := as_date(stamp)):
            out.append(Fact(int(goal.subject_user_id), day, _step_dims(ctx, goal, plan, version, step)))
    return out


def _progress(ctx: Ctx, since: date | None) -> list[Fact]:
    """Today, each running plan's steps: num 1 for each one done."""
    return [Fact(int(goal.subject_user_id), ctx.today, _goal_dims(ctx, goal, plan, version), num=1.0 if status in DONE_STEP_STATUSES else 0.0)
            for goal, plan, version, step, status in _steps(ctx) if goal.status == GoalStatus.ACTIVE.value]


def _days_active(ctx: Ctx, since: date | None) -> list[Fact]:
    return _active(ctx, since) if ctx.scope.kind == "learner" else []


def _check_ins(ctx: Ctx, since: date | None) -> list[Fact]:
    """Messages staff wrote in conversations the learner is in, that the learner can read."""
    if ctx.scope.kind != "learner":
        return []
    learner = int(ctx.scope.id)  # type: ignore[arg-type]
    staff = select(UserOrganization.user_id).where(UserOrganization.org_id == ctx.org_id, UserOrganization.role_id != LEARNER_ROLE_ID)
    rows = ctx.db.exec(
        select(ConversationMessage.creation_date).join(Conversation, Conversation.id == ConversationMessage.conversation_id)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(Conversation.org_id == ctx.org_id, ConversationMember.user_id == learner, ConversationMessage.visibility == "all",
               col(ConversationMessage.sender_user_id).in_(staff), ConversationMessage.sender_user_id != learner,
               ConversationMessage.creation_date >= _iso(since))
    ).all()
    return [Fact(learner, day, {}) for stamp in rows if (day := as_date(stamp))]


MEASURES: dict[str, Measure] = {measure.key: measure for measure in (
    Measure(
        "steps_done", "Steps done", "Steps finished in the range: done by the learner, or approved after they handed it in.",
        kind="count", unit="count", direction="up", load=_steps_done, dims=("time", "plan", "step", "group"), scopes=ALL_SCOPES,
        phrase=("{v} step done", "{v} steps done"), base=("step", "steps"), rank="{a} had the most steps done ({av}); {b} the fewest ({bv})",
        keywords=("progress", "finished", "work"),
    ),
    Measure(
        "plan_progress", "Plan progress", "Today, of the steps in plans still running, the share done.",
        kind="rate", unit="percent", direction="up", load=_progress, dims=("plan", "group"), scopes=ALL_SCOPES,
        phrase=("{v} of steps are done", "{v} of steps are done"), base=("step", "steps"), snapshot=True,
        rank="{a} is furthest along ({av}); {b} least ({bv})", keywords=("how far", "progress", "percent complete"),
    ),
    Measure(
        "days_active", "Days active", "Days the learner did something: worked on a step of their own plan or wrote in a conversation with the organization.",
        kind="count", unit="count", direction="up", load=_days_active, dims=("time",), scopes=("learner",),
        phrase=("Active on {v} day", "Active on {v} days"), base=("day", "days"), keywords=("engagement", "activity", "logged in"),
    ),
    Measure(
        "check_ins", "Check-ins", "Messages staff wrote to the learner in the range, in conversations the learner is in. Staff-only notes are left out.",
        kind="count", unit="count", direction="up", load=_check_ins, dims=("time",), scopes=("learner",),
        phrase=("Staff wrote {v} message", "Staff wrote {v} messages"), base=("message", "messages"), keywords=("messages", "contact", "touchpoints"),
    ),
)}

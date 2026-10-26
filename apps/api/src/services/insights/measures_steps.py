"""Measures about steps, reviews, staying active, and a plan's reach beyond this organization.

Steps are matched across learners by their template key, so "Draft your résumé" is one row however many
learners have it. Review timing reads ``PlanActivity``: every step status change, with who made it and when.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlmodel import col, select

from src.db.goal_sharing import PlanActivity
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStatus, GoalStep, GoalTemplateVersion, StepProgress, StepStatus
from src.services.insights.context import Ctx, as_date
from src.services.insights.measures import TEAM_SCOPES, Fact, Measure, _activity_days, _goal_dims, _goal_rows, _new_learners, started_on

SUBMITTED = StepStatus.SUBMITTED.value
SENT_BACK = StepStatus.CHANGES_REQUESTED.value
# Retention: active again in the month after a learner's first month.
RETAIN_FROM, RETAIN_TO = 30, 60


def _steps(ctx: Ctx) -> list[tuple]:
    """(goal, plan, version, step, status) for every templated step of the counted goals."""
    def load():
        rows = _goal_rows(ctx)
        goals = {int(goal.id): (goal, plan, version) for goal, plan, version in rows}  # type: ignore[arg-type]
        if not goals:
            return []
        steps = ctx.db.exec(select(GoalStep, StepProgress.status).join(StepProgress, StepProgress.step_id == GoalStep.id, isouter=True)
                            .where(col(GoalStep.goal_id).in_(list(goals)), col(GoalStep.template_key).is_not(None))).all()
        return [(*goals[int(step.goal_id)], step, getattr(status, "value", status) or StepStatus.NOT_STARTED.value) for step, status in steps]
    return ctx.once("steps", load)


def _events(ctx: Ctx) -> dict[str, list[tuple]]:
    """Each step's status changes in time order: step uuid -> [(when, from, to, actor)]."""
    def load():
        goal_ids = [int(goal.id) for goal, _, _ in _goal_rows(ctx)]  # type: ignore[arg-type]
        if not goal_ids:
            return {}
        out: dict[str, list[tuple]] = {}
        rows = ctx.db.exec(select(PlanActivity).where(col(PlanActivity.goal_id).in_(goal_ids), PlanActivity.action == "step.status")
                           .order_by(col(PlanActivity.creation_date))).all()
        for row in rows:
            payload = row.payload or {}
            if payload.get("step_uuid"):
                out.setdefault(payload["step_uuid"], []).append((row.creation_date, payload.get("from"), payload.get("to"), row.actor_user_id))
        return out
    return ctx.once("step_events", load)


def _step_dims(ctx: Ctx, goal: Goal, plan: str, version: str | None, step: GoalStep) -> dict:
    return {**_goal_dims(ctx, goal, plan, version), "step": step.template_key}


def _hours(start: str, end: str) -> float | None:
    try:
        return max(0.0, (datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds() / 3600)
    except ValueError:
        return None


def _step_reach(ctx: Ctx, since: date | None) -> list[Fact]:
    return [Fact(int(goal.subject_user_id), started_on(goal), _step_dims(ctx, goal, plan, version, step), num=1.0 if status in DONE_STEP_STATUSES else 0.0)
            for goal, plan, version, step, status in _steps(ctx)]


def _sent_back(ctx: Ctx, since: date | None) -> list[Fact]:
    """One fact per step handed in for review: placed on its first hand-in, num 1 when it was ever sent back."""
    events = _events(ctx)
    out = []
    for goal, plan, version, step, _ in _steps(ctx):
        history = events.get(step.step_uuid, [])
        handed = [when for when, _, to, _ in history if to == SUBMITTED]
        if handed and (day := as_date(handed[0])):
            out.append(Fact(int(goal.subject_user_id), day, _step_dims(ctx, goal, plan, version, step), num=1.0 if any(to == SENT_BACK for _, _, to, _ in history) else 0.0))
    return out


def _turnaround(ctx: Ctx, since: date | None) -> list[Fact]:
    """Hours from each hand-in to the decision on it (approved or sent back), placed on the decision."""
    events = _events(ctx)
    out = []
    for goal, plan, version, step, _ in _steps(ctx):
        waiting_since = None
        for when, _, to, _actor in events.get(step.step_uuid, []):
            if to == SUBMITTED:
                waiting_since = when
            elif waiting_since and to in (SENT_BACK, StepStatus.COMPLETED.value):
                hours, day = _hours(waiting_since, when), as_date(when)
                if hours is not None and day:
                    out.append(Fact(int(goal.subject_user_id), day, _step_dims(ctx, goal, plan, version, step), value=hours))
                waiting_since = None
    return out


def _waiting(ctx: Ctx, since: date | None) -> list[Fact]:
    """Today: steps handed in and not yet decided, on running goals."""
    return [Fact(int(goal.subject_user_id), ctx.today, _step_dims(ctx, goal, plan, version, step))
            for goal, plan, version, step, status in _steps(ctx) if status == SUBMITTED and goal.status == GoalStatus.ACTIVE.value]


def _retention(ctx: Ctx, since: date | None) -> list[Fact]:
    """Learners who joined in the range, num 1 when they were active in their second month."""
    days = _activity_days(ctx, None)
    out = []
    for fact in _new_learners(ctx, since):
        window = (fact.at + timedelta(days=RETAIN_FROM), fact.at + timedelta(days=RETAIN_TO))
        kept = any(window[0] <= day < window[1] for day in days.get(fact.user_id, ()))
        out.append(Fact(fact.user_id, fact.at, fact.dims, num=1.0 if kept else 0.0))
    return out


def _reach(ctx: Ctx, since: date | None) -> list[Fact]:
    """Every organization's learners who started this plan: counts only, never names (see ``cross_org``)."""
    if ctx.scope.kind != "plan":
        return []
    goals = ctx.db.exec(select(Goal).where(Goal.template_id == ctx.scope.id, col(Goal.status).in_(("active", "finished")), col(Goal.subject_user_id).is_not(None))).all()
    versions = dict(ctx.db.exec(select(GoalTemplateVersion.id, GoalTemplateVersion.version_uuid).where(GoalTemplateVersion.template_id == ctx.scope.id)).all())
    return [Fact(int(goal.subject_user_id), started_on(goal), {"plan": ctx.scope.key, "version": versions.get(goal.version_id), "org": str(goal.org_id)})  # type: ignore[arg-type]
            for goal in goals]


STEP_DIMS = ("time", "step", "version", "group")
REVIEW_DIMS = ("time", "plan", "step", "group")

MEASURES: dict[str, Measure] = {measure.key: measure for measure in (
    Measure(
        "step_reach", "Step reach", "Of learners who started the plan in the range, the share who finished each step.",
        kind="rate", unit="percent", direction="up", load=_step_reach, dims=("step", "version", "group"), scopes=("plan",),
        phrase=("{v} of steps are finished", "{v} of steps are finished"), base=("learner", "learners"), funnel=True,
        keywords=("drop off", "funnel", "where", "stuck"),
    ),
    Measure(
        "sent_back_rate", "Sent back", "Of steps handed in for review in the range, the share sent back for changes at least once.",
        kind="rate", unit="percent", direction="down", load=_sent_back, dims=REVIEW_DIMS, scopes=TEAM_SCOPES,
        phrase=("{v} of hand-ins were sent back", "{v} of hand-ins were sent back"), base=("hand-in", "hand-ins"),
        rank="{a} is sent back least ({av}); {b} most ({bv})", keywords=("changes requested", "revisions", "review"),
    ),
    Measure(
        "review_turnaround", "Review turnaround", "For reviews decided in the range, the median hours from hand-in to approval or sending back.",
        kind="median", unit="hours", direction="down", load=_turnaround, dims=REVIEW_DIMS, scopes=TEAM_SCOPES,
        phrase=("Reviews take {v}", "Reviews take {v}"), base=("review", "reviews"), rank="{a} is reviewed quickest ({av}); {b} slowest ({bv})",
        keywords=("review time", "feedback", "waiting"),
    ),
    Measure(
        "waiting_for_review", "Waiting for review", "Today, steps handed in that no one has approved or sent back yet.",
        kind="count", unit="count", direction="down", load=_waiting, dims=("plan", "step", "group"), scopes=TEAM_SCOPES,
        phrase=("{v} step is waiting for review", "{v} steps are waiting for review"), base=("step", "steps"), snapshot=True,
        rank="{a} has the most waiting ({av}); {b} the fewest ({bv})", keywords=("queue", "to review", "backlog"),
    ),
    Measure(
        "retention", "Still active a month on", f"Of learners who joined in the range, the share active again {RETAIN_FROM} to {RETAIN_TO} days after joining.",
        kind="rate", unit="percent", direction="up", load=_retention, dims=("time", "group"), scopes=("org", "group"),
        phrase=("{v} were still active a month on", "{v} were still active a month on"), base=("learner joined", "learners joined"),
        rank="{a} keeps the most ({av}); {b} the fewest ({bv})", settle_days=RETAIN_TO, keywords=("retention", "stay", "churn", "came back"),
    ),
    Measure(
        "plan_reach", "Reach", "Learners at every organization who started this plan in the range. Other organizations' learners are counted, never named.",
        kind="distinct", unit="count", direction="up", load=_reach, dims=("time", "version", "org"), scopes=("plan",),
        phrase=("{v} learner started it", "{v} learners started it"), base=("learner", "learners"),
        rank="{a} reaches the most learners ({av}); {b} the fewest ({bv})", drill=False, cross_org=True,
        keywords=("issuing orgs", "partners", "adoption", "who uses"),
    ),
)}

"""The measure registry: what every number on a card means.

A measure loads **facts**, one row per thing it counts (a goal started, a learner active on a day, a badge
awarded), each with the date that places it in a range, its dimension keys, and its contribution
(``num``/``den`` for rates, ``value`` for durations). The engine filters, groups and compares facts the
same way for every measure, so a measure is only its definition and its query.

Each definition here is the one the card shows when someone asks what a number means. Change one only
with the people who read the cards; ``test_insights`` pins each to exact numbers.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlmodel import col, select

from src.db.badges import AwardStatus, BadgeAward
from src.db.conversations import Conversation, ConversationMessage
from src.db.goal_sharing import PlanActivity
from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStatus, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress, StepStatus
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.services.insights.context import Ctx, as_date
from src.services.insights.dimensions import PERSONAL

# A learner with no activity for this many days has gone quiet.
QUIET_DAYS = 14
# Goals younger than this are still running: rates leave them out rather than count them as unfinished.
SETTLE_DAYS = 14


@dataclass(slots=True)
class Fact:
    user_id: int
    at: date
    dims: dict[str, str | list[str] | None]
    num: float = 1.0
    den: float = 1.0
    value: float | None = None


@dataclass(frozen=True)
class Measure:
    key: str
    label: str
    definition: str
    # count: sum of facts; distinct: learners; rate: sum(num)/sum(den); median: of values; snapshot: a count of today.
    kind: str
    unit: str  # count, percent, days, hours
    direction: str  # up (higher is better), down, none
    load: Callable[[Ctx, date | None], list[Fact]]
    dims: tuple[str, ...]
    scopes: tuple[str, ...]
    # How the number reads: ("{v} plan finished", "{v} plans finished"); one form when it never changes.
    phrase: tuple[str, str]
    # What the denominator (rates) or rows (medians) count, for "too few to say yet (4 plans started)".
    base: tuple[str, str] = ("", "")
    # Leader and laggard: "{a} finishes most often ({av}); {b} least ({bv})".
    rank: str = ""
    needs: str | None = None
    settle_days: int = 0
    snapshot: bool = False
    drill: bool = True
    # The breakdown always applied (a snapshot's statuses), on top of any the card asks for.
    implicit_by: str | None = None
    # Broken down by step, rows read as a funnel: the headline names the biggest drop.
    funnel: bool = False
    # Counts learners at every organization (a plan's reach): totals only, never the viewer's population or names.
    cross_org: bool = False
    keywords: tuple[str, ...] = field(default_factory=tuple)


# Shared loading ------------------------------------------------------------------------------------

LIVE_GOALS = (GoalStatus.ACTIVE.value, GoalStatus.FINISHED.value)


def _narrow(ctx: Ctx, statement, user_column):
    """Load only the scope's rows (the engine applies the scope again to every fact)."""
    if ctx.scope.kind == "learner":
        return statement.where(user_column == ctx.scope.id)
    if ctx.scope.kind == "group":
        return statement.where(col(user_column).in_(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == ctx.scope.id)))
    return statement


def _goal_rows(ctx: Ctx) -> list[tuple]:
    """The organization's started goals of learners the viewer counts: (goal, template uuid, version uuid)."""
    def load():
        people = ctx.everyone()
        if not people:
            return []
        statement = select(Goal).where(Goal.org_id == ctx.org_id, col(Goal.subject_user_id).in_(people), col(Goal.status).in_(LIVE_GOALS))
        if ctx.scope.kind == "plan":
            statement = statement.where(Goal.template_id == ctx.scope.id)
        goals = ctx.db.exec(_narrow(ctx, statement, Goal.subject_user_id)).all()
        template_ids = {goal.template_id for goal in goals if goal.template_id}
        version_ids = {goal.version_id for goal in goals if goal.version_id}
        templates = dict(ctx.db.exec(select(GoalTemplate.id, GoalTemplate.template_uuid).where(col(GoalTemplate.id).in_(template_ids))).all()) if template_ids else {}
        versions = dict(ctx.db.exec(select(GoalTemplateVersion.id, GoalTemplateVersion.version_uuid).where(col(GoalTemplateVersion.id).in_(version_ids))).all()) if version_ids else {}
        return [(goal, templates.get(goal.template_id, PERSONAL), versions.get(goal.version_id)) for goal in goals]
    return ctx.once("goal_rows", load)


def started_on(goal: Goal) -> date:
    return goal.start_date or as_date(goal.creation_date) or date.min


def _goal_dims(ctx: Ctx, goal: Goal, plan: str, version: str | None) -> dict:
    return {"plan": plan, "version": version, "group": ctx.groups_of().get(int(goal.subject_user_id), [])}  # type: ignore[arg-type]


def _iso(day: date | None) -> str:
    return day.isoformat() if day else ""


# Plans --------------------------------------------------------------------------------------------

def _plan_starts(ctx: Ctx, since: date | None) -> list[Fact]:
    return [Fact(int(goal.subject_user_id), started_on(goal), _goal_dims(ctx, goal, plan, version)) for goal, plan, version in _goal_rows(ctx)]


def _plans_finished(ctx: Ctx, since: date | None) -> list[Fact]:
    return [Fact(int(goal.subject_user_id), goal.finished_at.date(), _goal_dims(ctx, goal, plan, version))
            for goal, plan, version in _goal_rows(ctx) if goal.finished_at]


def _completion(ctx: Ctx, since: date | None) -> list[Fact]:
    return [Fact(int(goal.subject_user_id), started_on(goal), _goal_dims(ctx, goal, plan, version), num=1.0 if goal.finished_at else 0.0)
            for goal, plan, version in _goal_rows(ctx)]


def _time_to_finish(ctx: Ctx, since: date | None) -> list[Fact]:
    return [Fact(int(goal.subject_user_id), goal.finished_at.date(), _goal_dims(ctx, goal, plan, version), value=float(max(0, (goal.finished_at.date() - started_on(goal)).days)))
            for goal, plan, version in _goal_rows(ctx) if goal.finished_at]


# Learners -----------------------------------------------------------------------------------------

def _activity_days(ctx: Ctx, since: date | None) -> dict[int, set[date]]:
    """The days each counted learner did something: worked on their own goal, or wrote in a conversation here."""
    def load():
        people = ctx.everyone()
        if not people:
            return {}
        floor = _iso(since)
        acted = select(PlanActivity.actor_user_id, PlanActivity.creation_date).join(Goal, Goal.id == PlanActivity.goal_id).where(
            Goal.org_id == ctx.org_id, PlanActivity.actor_user_id == Goal.subject_user_id, col(PlanActivity.actor_user_id).in_(people),
            PlanActivity.creation_date >= floor)
        wrote = select(ConversationMessage.sender_user_id, ConversationMessage.creation_date).join(Conversation, Conversation.id == ConversationMessage.conversation_id).where(
            Conversation.org_id == ctx.org_id, col(ConversationMessage.sender_user_id).in_(people), ConversationMessage.creation_date >= floor)
        days: dict[int, set[date]] = {}
        for statement in (_narrow(ctx, acted, PlanActivity.actor_user_id), _narrow(ctx, wrote, ConversationMessage.sender_user_id)):
            for user_id, stamp in ctx.db.exec(statement).all():
                day = as_date(stamp)
                if user_id is not None and day:
                    days.setdefault(int(user_id), set()).add(day)
        return days
    return ctx.once(f"activity_days:{since}", load)


def _active(ctx: Ctx, since: date | None) -> list[Fact]:
    groups = ctx.groups_of()
    return [Fact(user_id, day, {"group": groups.get(user_id, [])}) for user_id, days in _activity_days(ctx, since).items() for day in days]


def _new_learners(ctx: Ctx, since: date | None) -> list[Fact]:
    people = ctx.everyone()
    if not people:
        return []
    statement = _narrow(ctx, select(UserOrganization).where(UserOrganization.org_id == ctx.org_id, col(UserOrganization.user_id).in_(people)), UserOrganization.user_id)
    groups = ctx.groups_of()
    return [Fact(int(row.user_id), day, {"group": groups.get(int(row.user_id), [])})
            for row in ctx.db.exec(statement).all() if (day := as_date(row.creation_date))]


def learner_statuses(ctx: Ctx) -> dict[int, str]:
    """Today, for each counted learner with a plan: finished (nothing left running), quiet (nothing done in
    QUIET_DAYS days), behind (a step past due or sent back), or on track."""
    def load():
        rows = _goal_rows(ctx)
        running = [goal for goal, _, _ in rows if goal.status == GoalStatus.ACTIVE.value]
        by_learner: dict[int, list[Goal]] = {}
        for goal, _, _ in rows:
            by_learner.setdefault(int(goal.subject_user_id), []).append(goal)  # type: ignore[arg-type]
        behind: set[int] = set()
        if running:
            owner = {int(goal.id): int(goal.subject_user_id) for goal in running}  # type: ignore[arg-type]
            steps = ctx.db.exec(select(GoalStep.goal_id, GoalStep.due_date, StepProgress.status).join(StepProgress, StepProgress.step_id == GoalStep.id, isouter=True)
                                .where(col(GoalStep.goal_id).in_(list(owner)))).all()
            for goal_id, due, status in steps:
                status = getattr(status, "value", status) or StepStatus.NOT_STARTED.value
                if status == StepStatus.CHANGES_REQUESTED.value or (due and due < ctx.today and status not in DONE_STEP_STATUSES):
                    behind.add(owner[int(goal_id)])
        recent = _activity_days(ctx, ctx.today - timedelta(days=QUIET_DAYS - 1))
        out: dict[int, str] = {}
        for user_id, goals in by_learner.items():
            if all(goal.status == GoalStatus.FINISHED.value for goal in goals):
                out[user_id] = "finished"
            elif not recent.get(user_id):
                out[user_id] = "quiet"
            elif user_id in behind:
                out[user_id] = "behind"
            else:
                out[user_id] = "on_track"
        return out
    return ctx.once("learner_statuses", load)


def _status(ctx: Ctx, since: date | None) -> list[Fact]:
    groups = ctx.groups_of()
    return [Fact(user_id, ctx.today, {"status": status, "group": groups.get(user_id, [])}) for user_id, status in learner_statuses(ctx).items()]


# Badges -------------------------------------------------------------------------------------------

def _badges(ctx: Ctx, since: date | None) -> list[Fact]:
    people = ctx.everyone()
    if not people:
        return []
    statement = select(BadgeAward).where(BadgeAward.issuing_org_id == ctx.org_id, col(BadgeAward.user_id).in_(people), BadgeAward.status == AwardStatus.ACTIVE.value)
    if ctx.scope.kind == "plan":
        statement = statement.where(BadgeAward.template_id == ctx.scope.id)
    awards = ctx.db.exec(_narrow(ctx, statement, BadgeAward.user_id)).all()
    template_ids = {award.template_id for award in awards if award.template_id}
    templates = dict(ctx.db.exec(select(GoalTemplate.id, GoalTemplate.template_uuid).where(col(GoalTemplate.id).in_(template_ids))).all()) if template_ids else {}
    groups = ctx.groups_of()
    return [Fact(int(award.user_id), award.issued_at.date() if isinstance(award.issued_at, datetime) else award.earned_on,
                 {"plan": templates.get(award.template_id, PERSONAL), "route": getattr(award.source, "value", award.source), "group": groups.get(int(award.user_id), [])})
            for award in awards]


# The registry -------------------------------------------------------------------------------------

GOAL_DIMS = ("time", "plan", "version", "group")
ALL_SCOPES = ("org", "plan", "group", "learner")
TEAM_SCOPES = ("org", "plan", "group")

MEASURES: dict[str, Measure] = {measure.key: measure for measure in (
    Measure(
        "active_learners", "Active learners",
        "Learners who did something in the range: worked on a step of their own plan or wrote in a conversation with the organization.",
        kind="distinct", unit="count", direction="up", load=_active, dims=("time", "group"), scopes=TEAM_SCOPES,
        phrase=("{v} learner was active", "{v} learners were active"), base=("learner", "learners"), rank="{a} has the most active learners ({av}); {b} the fewest ({bv})",
        keywords=("engagement", "activity", "using"),
    ),
    Measure(
        "new_learners", "New learners", "Learners who joined the organization in the range.",
        kind="count", unit="count", direction="up", load=_new_learners, dims=("time", "group"), scopes=("org", "group"),
        phrase=("{v} new learner joined", "{v} new learners joined"), base=("learner", "learners"), rank="{a} gained the most learners ({av}); {b} the fewest ({bv})",
        keywords=("signups", "joined", "growth"),
    ),
    Measure(
        "learner_status", "Learner status",
        f"Today, for each learner with a plan: finished (every plan done), quiet (nothing done in {QUIET_DAYS} days), "
        "behind (a step past due or sent back), or on track.",
        kind="snapshot", unit="count", direction="none", load=_status, dims=("group",), scopes=TEAM_SCOPES,
        phrase=("{v} learner", "{v} learners"), base=("learner", "learners"), snapshot=True, implicit_by="status",
        keywords=("on track", "behind", "quiet", "progress"),
    ),
    Measure(
        "plan_starts", "Plan starts", "Plans started in the range: assigned and accepted, or joined.",
        kind="count", unit="count", direction="up", load=_plan_starts, dims=GOAL_DIMS, scopes=ALL_SCOPES,
        phrase=("{v} plan started", "{v} plans started"), base=("plan", "plans"), rank="{a} had the most starts ({av}); {b} the fewest ({bv})",
        keywords=("started", "enrolled", "assigned"),
    ),
    Measure(
        "plans_finished", "Plans finished", "Plans finished in the range.",
        kind="count", unit="count", direction="up", load=_plans_finished, dims=GOAL_DIMS, scopes=ALL_SCOPES,
        phrase=("{v} plan finished", "{v} plans finished"), base=("plan", "plans"), rank="{a} had the most finished ({av}); {b} the fewest ({bv})",
        keywords=("completed", "done"),
    ),
    Measure(
        "completion_rate", "Completion rate",
        f"Of plans started in the range, the share finished. Plans younger than {SETTLE_DAYS} days are still running and left out.",
        kind="rate", unit="percent", direction="up", load=_completion, dims=GOAL_DIMS, scopes=ALL_SCOPES,
        phrase=("Completion is {v}", "Completion is {v}"), base=("plan started", "plans started"), rank="{a} finishes most often ({av}); {b} least ({bv})",
        settle_days=SETTLE_DAYS, keywords=("finish", "completed"),
    ),
    Measure(
        "time_to_finish", "Time to finish", "For plans finished in the range, the median days from starting to finishing.",
        kind="median", unit="days", direction="down", load=_time_to_finish, dims=GOAL_DIMS, scopes=ALL_SCOPES,
        phrase=("Plans take {v} to finish", "Plans take {v} to finish"), base=("plan finished", "plans finished"), rank="{a} is quickest ({av}); {b} slowest ({bv})",
        keywords=("duration", "how long"),
    ),
    Measure(
        "badges_awarded", "Badges awarded", "Badges this organization awarded in the range, by finishing a plan or directly. Revoked awards are left out.",
        kind="count", unit="count", direction="up", load=_badges, dims=("time", "plan", "route", "group"), scopes=ALL_SCOPES,
        phrase=("{v} badge awarded", "{v} badges awarded"), base=("badge", "badges"), rank="{a} awarded the most ({av}); {b} the fewest ({bv})",
        keywords=("credentials", "issued"),
    ),
)}

# Steps, reviews, retention, reach, the learner and the requirement measures live beside these; importing them here keeps one registry.
from src.services.insights.measures_learner import MEASURES as _LEARNER  # noqa: E402
from src.services.insights.measures_requirements import MEASURES as _REQUIREMENTS  # noqa: E402
from src.services.insights.measures_steps import MEASURES as _MORE  # noqa: E402

MEASURES.update(_MORE)
MEASURES.update(_LEARNER)
MEASURES.update(_REQUIREMENTS)

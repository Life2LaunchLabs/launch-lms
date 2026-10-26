"""Measures for requirement frameworks: who is tracked, which requirements their plans have credited, and who
has met a whole framework.

A learner is tracked on a framework once a plan of theirs has a step that counts toward it. A requirement is
met when a finished step credits it; when several steps credit the same one it is met once, on the earliest
day, and its ``plan`` lists every plan that credited it. Categories are a framework's top-level nodes.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlmodel import col, select

from src.db.goals import Goal, GoalStep, GoalTemplate, StepProgress
from src.db.requirements import RequirementAttainmentSource, RequirementEnrollment, RequirementEnrollmentStatus, RequirementFramework
from src.services.insights.context import Ctx, as_date
from src.services.insights.dimensions import PERSONAL
from src.services.insights.measures import Fact, Measure, _narrow

SCOPES = ("org", "group", "learner", "framework")


def _enrollments(ctx: Ctx) -> list[tuple[RequirementEnrollment, str]]:
    """Each counted learner's tracking on each framework (the newest when there are several): (enrollment, framework uuid)."""
    def load():
        people = ctx.everyone()
        if not people:
            return []
        statement = (select(RequirementEnrollment, RequirementFramework.framework_uuid)
                     .join(RequirementFramework, RequirementFramework.id == RequirementEnrollment.framework_id)
                     .where(RequirementEnrollment.org_id == ctx.org_id, RequirementEnrollment.status != RequirementEnrollmentStatus.WITHDRAWN,
                            RequirementFramework.archived == False, col(RequirementEnrollment.user_id).in_(people)))  # noqa: E712
        if ctx.scope.kind == "framework":
            statement = statement.where(RequirementEnrollment.framework_id == ctx.scope.id)
        newest: dict[tuple[int, str], tuple[RequirementEnrollment, str]] = {}
        for enrollment, uuid in ctx.db.exec(_narrow(ctx, statement, RequirementEnrollment.user_id)).all():
            key = (int(enrollment.user_id), uuid)
            if key not in newest or int(enrollment.id) > int(newest[key][0].id):  # type: ignore[arg-type]
                newest[key] = (enrollment, uuid)
        return list(newest.values())
    return ctx.once("requirement_enrollments", load)


def categories_of(snapshot: dict) -> dict[str, str]:
    """Each node's top-level ancestor (itself at the top), from a framework snapshot."""
    parent = {node["node_uuid"]: node.get("parent_node_uuid") for node in snapshot.get("nodes") or []}
    out = {}
    for uuid in parent:
        top, hops = uuid, 0
        while parent.get(top) and parent[top] in parent and hops < 64:
            top, hops = parent[top], hops + 1
        out[uuid] = top
    return out


def _sources(ctx: Ctx) -> dict[int, list[RequirementAttainmentSource]]:
    """The credits still standing on each loaded enrollment."""
    def load():
        ids = [int(enrollment.id) for enrollment, _ in _enrollments(ctx)]  # type: ignore[arg-type]
        out: dict[int, list[RequirementAttainmentSource]] = {}
        if ids:
            for source in ctx.db.exec(select(RequirementAttainmentSource).where(col(RequirementAttainmentSource.enrollment_id).in_(ids),
                                                                                RequirementAttainmentSource.revoked_at.is_(None))).all():  # type: ignore[union-attr]
                out.setdefault(int(source.enrollment_id), []).append(source)
        return out
    return ctx.once("requirement_sources", load)


def source_plans(ctx: Ctx) -> dict[int, str]:
    """The plan (template uuid, or personal) each credited step belongs to, by step progress id."""
    def load():
        ids = {int(source.step_progress_id) for sources in _sources(ctx).values() for source in sources if source.step_progress_id}
        if not ids:
            return {}
        rows = ctx.db.exec(select(StepProgress.id, GoalTemplate.template_uuid).join(GoalStep, GoalStep.id == StepProgress.step_id)
                           .join(Goal, Goal.id == GoalStep.goal_id).join(GoalTemplate, GoalTemplate.id == Goal.template_id, isouter=True)
                           .where(col(StepProgress.id).in_(ids))).all()
        return {int(progress_id): uuid or PERSONAL for progress_id, uuid in rows}
    return ctx.once("requirement_source_plans", load)


def credited_on(source: RequirementAttainmentSource) -> date | None:
    stamp = source.verified_at or source.creation_date
    return stamp.date() if isinstance(stamp, datetime) else as_date(stamp)


def _met(ctx: Ctx, since: date | None) -> list[Fact]:
    groups, plans, sources = ctx.groups_of(), source_plans(ctx), _sources(ctx)
    out = []
    for enrollment, framework in _enrollments(ctx):
        snapshot = enrollment.framework_snapshot or {}
        leaves, category = set(snapshot.get("leaf_node_uuids") or []), categories_of(snapshot)
        by_node: dict[str, list[RequirementAttainmentSource]] = {}
        for source in sources.get(int(enrollment.id), []):  # type: ignore[arg-type]
            if source.node_uuid in leaves:
                by_node.setdefault(source.node_uuid, []).append(source)
        for node, credits in by_node.items():
            days = [day for source in credits if (day := credited_on(source))]
            if not days:
                continue
            credited = sorted({plans.get(int(source.step_progress_id), PERSONAL) for source in credits if source.step_progress_id})
            out.append(Fact(int(enrollment.user_id), min(days), {"framework": framework, "category": category.get(node), "plan": credited,
                                                                 "group": groups.get(int(enrollment.user_id), [])}))
    return out


def _progress(ctx: Ctx, since: date | None) -> list[Fact]:
    """Today, each tracked learner's requirements: num 1 for each one met."""
    groups, sources = ctx.groups_of(), _sources(ctx)
    out = []
    for enrollment, framework in _enrollments(ctx):
        snapshot = enrollment.framework_snapshot or {}
        met = {source.node_uuid for source in sources.get(int(enrollment.id), [])}  # type: ignore[arg-type]
        category = categories_of(snapshot)
        for leaf in snapshot.get("leaf_node_uuids") or []:
            out.append(Fact(int(enrollment.user_id), ctx.today, {"framework": framework, "category": category.get(leaf), "group": groups.get(int(enrollment.user_id), [])},
                            num=1.0 if leaf in met else 0.0))
    return out


def _completed(ctx: Ctx, since: date | None) -> list[Fact]:
    groups = ctx.groups_of()
    return [Fact(int(enrollment.user_id), enrollment.completed_at.date(), {"framework": framework, "group": groups.get(int(enrollment.user_id), [])})
            for enrollment, framework in _enrollments(ctx) if enrollment.status == RequirementEnrollmentStatus.COMPLETED and enrollment.completed_at]


def _tracked(ctx: Ctx, since: date | None) -> list[Fact]:
    groups = ctx.groups_of()
    return [Fact(int(enrollment.user_id), ctx.today, {"framework": framework, "group": groups.get(int(enrollment.user_id), [])}) for enrollment, framework in _enrollments(ctx)]


MEASURES: dict[str, Measure] = {measure.key: measure for measure in (
    Measure(
        "learners_tracked", "Learners tracked", "Today, learners with a plan that counts toward a requirement framework.",
        kind="distinct", unit="count", direction="up", load=_tracked, dims=("framework", "group"), scopes=SCOPES, snapshot=True,
        phrase=("{v} learner is tracked", "{v} learners are tracked"), base=("learner", "learners"), rank="{a} tracks the most learners ({av}); {b} the fewest ({bv})",
        keywords=("requirements", "enrolled", "graduation"),
    ),
    Measure(
        "requirements_met", "Requirements met",
        "Requirements a finished step credited in the range, once per learner on the earliest day; several plans can credit the same one.",
        kind="count", unit="count", direction="up", load=_met, dims=("time", "framework", "category", "plan", "group"), scopes=(*SCOPES, "plan"),
        phrase=("{v} requirement met", "{v} requirements met"), base=("requirement", "requirements"), rank="{a} met the most ({av}); {b} the fewest ({bv})",
        keywords=("requirements", "standards", "credited", "evidence", "graduation"),
    ),
    Measure(
        "requirement_progress", "Requirement progress", "Today, of the requirements tracked learners need, the share their plans have credited.",
        kind="rate", unit="percent", direction="up", load=_progress, dims=("framework", "category", "group"), scopes=SCOPES, snapshot=True,
        phrase=("{v} of requirements are met", "{v} of requirements are met"), base=("requirement", "requirements"),
        rank="{a} is furthest along ({av}); {b} least ({bv})", keywords=("requirements", "how far", "on track", "graduation"),
    ),
    Measure(
        "frameworks_completed", "Frameworks completed", "Learners who met every requirement of a framework in the range.",
        kind="count", unit="count", direction="up", load=_completed, dims=("time", "framework", "group"), scopes=SCOPES,
        phrase=("{v} learner met every requirement", "{v} learners met every requirement"), base=("learner", "learners"),
        rank="{a} had the most finish ({av}); {b} the fewest ({bv})", keywords=("requirements", "graduation", "complete"),
    ),
)}

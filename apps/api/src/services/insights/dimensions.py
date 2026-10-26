"""What a card can be broken down or filtered by.

A measure's facts carry dimension keys (a plan's template uuid, a learner's group uuids, a version), and a
dimension turns those keys into labels, says how rows sort, and whether a row opens another dashboard.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlmodel import col, select

from src.db.goals import Goal, GoalStage, GoalStep, GoalTemplate, GoalTemplateVersion
from src.db.organizations import Organization
from src.db.requirements import RequirementFramework, RequirementNode
from src.db.usergroups import UserGroup
from src.services.insights.context import Ctx

STATUS_LABELS = {"on_track": "On track", "behind": "Behind", "quiet": "Quiet", "finished": "Finished"}
ROUTE_LABELS = {"plan_completion": "Finished a plan", "direct_award": "Awarded directly"}
PERSONAL = "personal"


@dataclass(frozen=True)
class Dimension:
    key: str
    label: str
    plural: str
    # "value": rows sort by their number; "natural": by the keys' own order (time, versions, a fixed list).
    order: str = "value"
    needs: str | None = None
    # A row of this dimension opens that object's dashboard.
    links_to: str | None = None
    labels: Callable[[Ctx, list[str]], dict[str, str]] | None = None
    # For "natural" order: the keys in their own order (steps in plan order); else NATURAL_ORDER or the keys sorted.
    sort: Callable[[Ctx, list[str]], list[str]] | None = None
    # The dashboards it makes sense on (steps belong to one plan); None for every scope.
    scopes: tuple[str, ...] | None = None


def _plans(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    rows = ctx.db.exec(select(GoalTemplate.template_uuid, GoalTemplate.title).where(col(GoalTemplate.template_uuid).in_(keys))).all() if keys else []
    return {PERSONAL: "Personal goals", **dict(rows)}


def _groups(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    rows = ctx.db.exec(select(UserGroup.usergroup_uuid, UserGroup.name).where(col(UserGroup.usergroup_uuid).in_(keys), UserGroup.org_id == ctx.org_id)).all() if keys else []
    return dict(rows)


def _versions(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    rows = ctx.db.exec(select(GoalTemplateVersion.version_uuid, GoalTemplateVersion.semver, GoalTemplateVersion.number)
                       .where(col(GoalTemplateVersion.version_uuid).in_(keys))).all() if keys else []
    return {uuid: f"v{semver or number}" for uuid, semver, number in rows}


def _plan_steps(ctx: Ctx) -> dict[str, tuple[tuple[int, int], str]]:
    """The scope plan's steps by template key: (stage position, step position) and the latest title."""
    def load() -> dict[str, tuple[tuple[int, int], str]]:
        rows = ctx.db.exec(select(GoalStep.template_key, GoalStep.title, GoalStep.position, GoalStage.position, GoalStep.id)
                           .join(Goal, Goal.id == GoalStep.goal_id).join(GoalStage, GoalStage.id == GoalStep.stage_id, isouter=True)
                           .where(Goal.template_id == ctx.scope.id, col(GoalStep.template_key).is_not(None))).all() if ctx.scope.kind == "plan" else []
        out: dict[str, tuple[tuple[int, int], str, int]] = {}
        for key, title, position, stage, step_id in rows:
            if key not in out or step_id > out[key][2]:
                out[key] = ((stage or 0, position or 0), title, step_id)
        return {key: (place, title) for key, (place, title, _) in out.items()}
    return ctx.once("plan_steps", load)


def _steps(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    steps = _plan_steps(ctx)
    return {key: steps[key][1] for key in keys if key in steps}


def _step_order(ctx: Ctx, keys: list[str]) -> list[str]:
    steps = _plan_steps(ctx)
    return sorted(keys, key=lambda key: steps[key][0] if key in steps else (10**6, 0))


def _orgs(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    ids = [int(key) for key in keys if key.isdigit()]
    return {str(org_id): name for org_id, name in ctx.db.exec(select(Organization.id, Organization.name).where(col(Organization.id).in_(ids))).all()} if ids else {}


def _frameworks(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    rows = ctx.db.exec(select(RequirementFramework.framework_uuid, RequirementFramework.name)
                       .where(col(RequirementFramework.framework_uuid).in_(keys), RequirementFramework.org_id == ctx.org_id)).all() if keys else []
    return dict(rows)


def _category_nodes(ctx: Ctx, keys: list[str]) -> dict[str, tuple[int, str]]:
    """A framework's top-level nodes by uuid: their position and "code title", from the newest version that has them."""
    rows = ctx.db.exec(select(RequirementNode.node_uuid, RequirementNode.position, RequirementNode.code, RequirementNode.title, RequirementNode.id)
                       .where(col(RequirementNode.node_uuid).in_(keys))).all() if keys else []
    out: dict[str, tuple[int, str, int]] = {}
    for uuid, position, code, title, node_id in rows:
        if uuid not in out or node_id > out[uuid][2]:
            out[uuid] = (position or 0, f"{code} {title}".strip() if code else title, node_id)
    return {uuid: (position, label) for uuid, (position, label, _) in out.items()}


def _categories(ctx: Ctx, keys: list[str]) -> dict[str, str]:
    return {uuid: label for uuid, (_, label) in _category_nodes(ctx, keys).items()}


def _category_order(ctx: Ctx, keys: list[str]) -> list[str]:
    nodes = _category_nodes(ctx, keys)
    return sorted(keys, key=lambda key: nodes[key][0] if key in nodes else 10**6)


def _fixed(labels: dict[str, str]) -> Callable[[Ctx, list[str]], dict[str, str]]:
    return lambda ctx, keys: labels


DIMENSIONS: dict[str, Dimension] = {dimension.key: dimension for dimension in (
    Dimension("time", "Time", "periods", order="natural"),
    Dimension("plan", "Plan", "plans", links_to="plan", labels=_plans),
    Dimension("group", "Group", "groups", links_to="group", labels=_groups),
    Dimension("version", "Version", "versions", order="natural", labels=_versions),
    Dimension("status", "Status", "statuses", order="natural", labels=_fixed(STATUS_LABELS)),
    Dimension("route", "How it was earned", "routes", labels=_fixed(ROUTE_LABELS)),
    Dimension("step", "Step", "steps", order="natural", labels=_steps, sort=_step_order, scopes=("plan",)),
    Dimension("org", "Organization", "organizations", labels=_orgs, scopes=("plan",)),
    Dimension("framework", "Requirement framework", "frameworks", links_to="framework", labels=_frameworks),
    # A framework's top-level categories; a requirement counts toward the category it sits under.
    Dimension("category", "Category", "categories", order="natural", labels=_categories, sort=_category_order, scopes=("framework",)),
)}

# The order fixed-list dimensions show in.
NATURAL_ORDER = {"status": list(STATUS_LABELS), "route": list(ROUTE_LABELS)}

"""What a card can be broken down or filtered by.

A measure's facts carry dimension keys (a plan's template uuid, a learner's group uuids, a version), and a
dimension turns those keys into labels, says how rows sort, and whether a row opens another dashboard.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlmodel import col, select

from src.db.goals import GoalTemplate, GoalTemplateVersion
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


def _fixed(labels: dict[str, str]) -> Callable[[Ctx, list[str]], dict[str, str]]:
    return lambda ctx, keys: labels


DIMENSIONS: dict[str, Dimension] = {dimension.key: dimension for dimension in (
    Dimension("time", "Time", "periods", order="natural"),
    Dimension("plan", "Plan", "plans", links_to="plan", labels=_plans),
    Dimension("group", "Group", "groups", links_to="group", labels=_groups),
    Dimension("version", "Version", "versions", order="natural", labels=_versions),
    Dimension("status", "Status", "statuses", order="natural", labels=_fixed(STATUS_LABELS)),
    Dimension("route", "How it was earned", "routes", labels=_fixed(ROUTE_LABELS)),
)}

# The order fixed-list dimensions show in.
NATURAL_ORDER = {"status": list(STATUS_LABELS), "route": list(ROUTE_LABELS)}

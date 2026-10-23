"""Starter plans: the New plan picker's ready-to-edit plans.

The platform's own organization curates them as ordinary plans in collections it marks as starters;
each starter collection is a category in the picker. Starting from one copies its live version into
the organization as a new draft plan, activities and all (library.copy_into), so nothing is shared.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import GoalTemplate
from src.db.plan_collections import PlanCollection
from src.db.users import PublicUser
from src.security.access.access import owner_org_id
from src.security.org_auth import require_org_admin
from src.services.goals import collections, library, templates
from src.services.goals.document import iter_steps

PREVIEW_STEPS = 3


def _starter_collections(db: Session) -> list[PlanCollection]:
    owner = owner_org_id(db)
    if owner is None:
        return []
    return list(db.exec(select(PlanCollection).where(PlanCollection.org_id == owner, PlanCollection.starter == True)  # noqa: E712
                        .order_by(col(PlanCollection.name))).all())


def _card(template: GoalTemplate, document: dict, badges: list[dict], categories: list[str]) -> dict:
    steps = [step for _, step in iter_steps(document)]
    return {
        "template_uuid": template.template_uuid, "title": template.title, "description": template.description or "", **templates.cover(template),
        "stage_count": len(document.get("stages") or []), "step_count": len(steps),
        "types": list(dict.fromkeys(str(step.get("type") or "task") for step in steps)),
        "preview": [{"type": step.get("type") or "task", "title": step.get("title") or ""} for step in steps[:PREVIEW_STEPS]],
        "earns_badge": bool(badges), "categories": categories,
    }


def list_starters(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Every starter (live versions only), and the categories they're grouped in."""
    templates.require_reader(db, current_user, org_id)
    rows = _starter_collections(db)
    items = collections._items(db, [int(row.id) for row in rows if row.id])
    categories: dict[int, list[str]] = {}
    plans: dict[int, GoalTemplate] = {}
    for row in rows:
        for plan in items.get(int(row.id or 0), []):
            if plan.published_version_id is None:
                continue
            plans[int(plan.id or 0)] = plan
            categories.setdefault(int(plan.id or 0), []).append(row.collection_uuid)
    badges = templates._badges_by_template(db, list(plans))
    starters = []
    for plan_id, plan in sorted(plans.items(), key=lambda item: item[1].title.lower()):
        live = templates.published_version(db, plan)
        starters.append(_card(plan, (live.document if live else {}) or {}, badges.get(plan_id, []), categories[plan_id]))
    return {
        "categories": [{"collection_uuid": row.collection_uuid, "name": row.name, "count": sum(row.collection_uuid in starter["categories"] for starter in starters)}
                       for row in rows],
        "starters": starters,
    }


def use_starter(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """A new draft plan of the organization's own from a starter's live version."""
    require_org_admin(current_user.id, org_id, db, "build_plans")
    source = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid)).first()
    starter_ids = {int(plan.id or 0) for plans in collections._items(db, [int(row.id) for row in _starter_collections(db) if row.id]).values() for plan in plans}
    live = templates.published_version(db, source) if source is not None else None
    if source is None or live is None or int(source.id or 0) not in starter_ids:
        raise HTTPException(status_code=404, detail="Starter not found")
    copied = library.copy_into(db, current_user, org_id, source, live.document, live.number)
    copied.draft = {"semver": "1.0.0", "note": "", "base_version_uuid": None, "started_at": copied.creation_date, "started_by_user_id": current_user.id}
    db.add(copied)
    db.commit()
    db.refresh(copied)
    return templates.template_dict(db, copied)

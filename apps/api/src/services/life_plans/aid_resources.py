"""Resources that help a learner fill in a budget line they can't guess, like how much grant aid they'd get.

The links live in Resources (so learners can open, save and note them like any other), tagged by topic. A
budget item that names topics pulls the resources carrying them: the organization's own and the Library's.
Each matching topic adds its weight; a resource tagged for a state counts only in that state, and the
phase's state lifts its own. The learner's saved ones lead ties.
"""

from __future__ import annotations

from sqlalchemy import func
from sqlmodel import Session, col, select

from src.db.resources import Resource, ResourceChannel, ResourceChannelResource, ResourceTag, ResourceTagLink

from .catalog import ITEMS
from .places import STATES, ladder

STATE_TAGS = {name.lower(): code for code, name in STATES.items()}
STATE_WEIGHT = 2
LIMIT = 4


def topics_for(item_key: str) -> dict[str, int]:
    """The resource tags a budget item asks for, with their weights (lower-case names)."""
    item = next((i for i in ITEMS if i["key"] == item_key), None)
    return {name.lower(): weight for name, weight in (item or {}).get("resources", {}).items()}


def state_of(place: str | None) -> str | None:
    """The two-letter state a phase's place sits in, if it has one."""
    if not place:
        return None
    for key in ladder(place):
        if key.startswith("state:"):
            return key.split(":", 1)[1]
    return None


def _library_ids(resource_ids: set[int], db: Session) -> set[int]:
    if not resource_ids:
        return set()
    return set(db.exec(
        select(ResourceChannelResource.resource_id)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(col(ResourceChannelResource.resource_id).in_(list(resource_ids)), ResourceChannel.listed == True)  # noqa: E712
    ).all())


def ranked(db: Session, user, org_id: int | None, item_key: str, place: str | None = None, limit: int = LIMIT) -> list[Resource]:
    """The resources to show on a budget line, best first."""
    from src.services.resources import _org_resource_ids, _resource_user_state_map

    topics = topics_for(item_key)
    if not topics:
        return []
    rows = db.exec(
        select(ResourceTagLink.resource_id, ResourceTag.name)
        .join(ResourceTag, ResourceTag.id == ResourceTagLink.tag_id)
        .where(func.lower(ResourceTag.name).in_([*topics, *STATE_TAGS]))
    ).all()
    tags: dict[int, set[str]] = {}
    for resource_id, name in rows:
        tags.setdefault(resource_id, set()).add(name.strip().lower())
    candidates = {rid for rid, names in tags.items() if names & topics.keys()}
    if not candidates:
        return []
    visible = (_org_resource_ids(org_id, db, user) & candidates if org_id else set()) | _library_ids(candidates, db)
    if not visible:
        return []

    here = state_of(place)
    scores: dict[int, int] = {}
    for rid in visible:
        names = tags[rid]
        states = {STATE_TAGS[n] for n in names if n in STATE_TAGS}
        if states and here and here not in states:
            continue
        scores[rid] = sum(weight for name, weight in topics.items() if name in names) + (STATE_WEIGHT if here and here in states else 0)
    resources = list(db.exec(select(Resource).where(col(Resource.id).in_(list(scores)))).all())
    saved = _resource_user_state_map([r.id for r in resources], user, db)
    resources.sort(key=lambda r: (-scores[r.id], r.id not in saved, not r.is_featured, r.title.lower()))
    return resources[:limit]


def aid_resources(db: Session, user, org_id: int | None, item_key: str, place: str | None = None) -> dict:
    from src.services.resources import _serialize_resource

    here = state_of(place)
    return {
        "resources": [_serialize_resource(r, db, user, org_id) for r in ranked(db, user, org_id, item_key, place)],
        "state": STATES.get(here) if here else None,
    }

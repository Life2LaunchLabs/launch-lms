"""Save to this phase: each phase of a life plan fills one personal Library list, made the first time.

The list is an ordinary user channel (it shows with the person's other lists and can be renamed or deleted
there); ``PhaseResourceList`` remembers which phase it belongs to. Saving puts the resource in the Library too,
so notes stay one per resource. A deleted list is made again on the next save.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.recommendations import PhaseResourceList, RecommendationEvent
from src.db.resources import Resource, UserResourceChannel, UserSavedResource, UserSavedResourceChannel
from src.security.org_auth import require_org_membership

from .context import find_phase


def _now() -> str:
    return datetime.now(UTC).isoformat()


def phase_list(db: Session, user_id: int, phase_id: str) -> UserResourceChannel | None:
    link = db.exec(select(PhaseResourceList).where(PhaseResourceList.user_id == user_id, PhaseResourceList.phase_id == phase_id)).first()
    return db.get(UserResourceChannel, link.user_channel_id) if link else None


def list_ids(db: Session, user_id: int, channel: UserResourceChannel | None) -> set[int]:
    if channel is None:
        return set()
    return set(db.exec(
        select(UserSavedResource.resource_id)
        .join(UserSavedResourceChannel, UserSavedResourceChannel.saved_resource_id == UserSavedResource.id)
        .where(UserSavedResourceChannel.user_channel_id == channel.id, UserSavedResource.user_id == user_id)
    ).all())


def _ensure_list(db: Session, user_id: int, org_id: int, phase: dict) -> UserResourceChannel:
    channel = phase_list(db, user_id, phase["id"])
    if channel is not None:
        return channel
    channel = UserResourceChannel(
        user_id=user_id, org_id=org_id, user_channel_uuid=f"userchannel_{uuid4()}", name=(phase.get("title") or "My phase")[:120],
        description="Saved for this phase of your plan.", is_default=False, icon="map", creation_date=_now(), update_date=_now(),
    )
    db.add(channel)
    db.flush()
    stale = db.exec(select(PhaseResourceList).where(PhaseResourceList.user_id == user_id, PhaseResourceList.phase_id == phase["id"])).first()
    if stale:
        db.delete(stale)
        db.flush()
    db.add(PhaseResourceList(user_id=user_id, phase_id=phase["id"], user_channel_id=channel.id, creation_date=_now()))
    return channel


def _resource(db: Session, user, resource_uuid: str) -> Resource:
    from src.services.resources import _resource_in_accessible_channel

    resource = db.exec(select(Resource).where(Resource.resource_uuid == resource_uuid)).first()
    if resource is None or not _resource_in_accessible_channel(resource, db, user):
        raise HTTPException(status_code=404, detail={"message": "That resource isn't available."})
    return resource


def save_to_phase(db: Session, user, org_id: int, phase_id: str, resource_uuid: str, shelf: str = "") -> dict:
    require_org_membership(user.id, org_id, db)
    phase = find_phase(db, user.id, phase_id)
    resource = _resource(db, user, resource_uuid)
    channel = _ensure_list(db, user.id, org_id, phase)
    saved = db.exec(select(UserSavedResource).where(UserSavedResource.user_id == user.id, UserSavedResource.resource_id == resource.id)).first()
    if saved is None:
        saved = UserSavedResource(user_id=user.id, resource_id=resource.id, creation_date=_now(), update_date=_now())
        db.add(saved)
        db.flush()
    in_list = db.exec(select(UserSavedResourceChannel).where(UserSavedResourceChannel.saved_resource_id == saved.id, UserSavedResourceChannel.user_channel_id == channel.id)).first()
    if in_list is None:
        db.add(UserSavedResourceChannel(saved_resource_id=saved.id, user_channel_id=channel.id, creation_date=_now()))
    db.add(RecommendationEvent(user_id=user.id, org_id=org_id, resource_id=resource.id, kind="save", context=f"phase:{phase_id}", shelf=shelf[:80], creation_date=_now()))
    db.commit()
    return {"user_channel_uuid": channel.user_channel_uuid, "name": channel.name, "count": len(list_ids(db, user.id, channel))}


def remove_from_phase(db: Session, user, org_id: int, phase_id: str, resource_uuid: str) -> dict:
    """Take it out of the phase's list; it stays in the Library."""
    require_org_membership(user.id, org_id, db)
    channel = phase_list(db, user.id, phase_id)
    resource = db.exec(select(Resource).where(Resource.resource_uuid == resource_uuid)).first()
    if channel and resource:
        rows = db.exec(
            select(UserSavedResourceChannel)
            .join(UserSavedResource, UserSavedResource.id == UserSavedResourceChannel.saved_resource_id)
            .where(UserSavedResourceChannel.user_channel_id == channel.id, UserSavedResource.user_id == user.id, UserSavedResource.resource_id == resource.id)
        ).all()
        for row in rows:
            db.delete(row)
        db.add(RecommendationEvent(user_id=user.id, org_id=org_id, resource_id=resource.id, kind="unsave", context=f"phase:{phase_id}", creation_date=_now()))
        db.commit()
    return {"user_channel_uuid": channel.user_channel_uuid if channel else None, "count": len(list_ids(db, user.id, channel))}


KINDS = {"shown", "open", "hide", "unhide"}


def record(db: Session, user, org_id: int, events: list[dict]) -> dict:
    """Store what the person saw and did with suggestions (at most 50 a call)."""
    require_org_membership(user.id, org_id, db)
    uuids = [e.get("resource_uuid") for e in events[:50] if e.get("resource_uuid")]
    ids = dict(db.exec(select(Resource.resource_uuid, Resource.id).where(col(Resource.resource_uuid).in_(uuids))).all()) if uuids else {}
    stored = 0
    for event in events[:50]:
        if event.get("kind") not in KINDS or event.get("resource_uuid") not in ids:
            continue
        db.add(RecommendationEvent(
            user_id=user.id, org_id=org_id, resource_id=ids[event["resource_uuid"]], kind=event["kind"],
            context=str(event.get("context") or "")[:80], shelf=str(event.get("shelf") or "")[:80],
            position=event.get("position") if isinstance(event.get("position"), int) else None, creation_date=_now(),
        ))
        stored += 1
    db.commit()
    return {"stored": stored}

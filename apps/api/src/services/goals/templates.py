"""Goal templates: the draft document, published versions, and rolling back.

A template's ``document`` is its working draft. Publishing freezes it into an
immutable ``GoalTemplateVersion`` with every activity replaced by a frozen copy,
and new goals are issued from the published version. Goals already issued keep
the version they got. Restoring publishes an earlier version's document again.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, func, select

from src.db.goals import GoalTemplate, GoalTemplateVersion, TemplateStatus
from src.db.learning import LearningActivity
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals.document import empty_document, iter_steps, validate_document
from src.services.learning.activity_copy import activity_hash, content_hash, copy_activity


def _now() -> str:
    return datetime.now().isoformat()


def template_or_404(db: Session, org_id: int, template_uuid: str) -> GoalTemplate:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == template_uuid, GoalTemplate.org_id == org_id)).first()
    if not template:
        raise HTTPException(status_code=404, detail="Goal template not found")
    return template


def _requirement_nodes(db: Session, org_id: int) -> set[str]:
    from src.services.requirements import mappable_nodes, parent_node_uuids

    return set(mappable_nodes(db, org_id)) - parent_node_uuids(db, org_id)


def _working_activity(db: Session, template: GoalTemplate, activity_uuid: str) -> LearningActivity:
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).first()
    if not activity or activity.goal_template_id != template.id or activity.frozen_from_id is not None:
        raise HTTPException(status_code=422, detail=f"Activity {activity_uuid} doesn't belong to this template")
    return activity


def _attach_activities(db: Session, template: GoalTemplate, document: dict) -> None:
    """New activity steps get an empty activity of their own; existing ones must be this template's."""
    now = _now()
    for _, step in iter_steps(document):
        if step.get("type") != "activity":
            continue
        config = step.setdefault("config", {})
        if config.get("activity_uuid"):
            _working_activity(db, template, config["activity_uuid"])
            continue
        activity = LearningActivity(
            activity_uuid=f"learning_activity_{uuid4()}", goal_template_id=template.id, org_id=template.org_id,
            title=step.get("title") or "Activity", description=step.get("description") or "", settings={},
            creation_date=now, update_date=now,
        )
        db.add(activity)
        db.flush()
        config["activity_uuid"] = activity.activity_uuid


def _validated(db: Session, template: GoalTemplate, raw: dict) -> dict:
    document = deepcopy(raw)
    _attach_activities(db, template, document)
    return validate_document(db, document, template.org_id, requirement_nodes=_requirement_nodes(db, template.org_id))


def etag(template: GoalTemplate) -> str:
    return content_hash(template.document or {})


def fingerprint(db: Session, template: GoalTemplate) -> str:
    """Changes whenever publishing would produce a different version, including activity edits."""
    document = deepcopy(template.document or {})
    for _, step in iter_steps(document):
        if step.get("type") == "activity" and step.get("config", {}).get("activity_uuid"):
            activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).first()
            step["config"] = {"activity_hash": activity_hash(db, activity) if activity else None}
    return content_hash(document)


def published_version(db: Session, template: GoalTemplate) -> GoalTemplateVersion | None:
    return db.get(GoalTemplateVersion, template.published_version_id) if template.published_version_id else None


def _versions(db: Session, template: GoalTemplate) -> list[GoalTemplateVersion]:
    return list(db.exec(
        select(GoalTemplateVersion).where(GoalTemplateVersion.template_id == template.id, GoalTemplateVersion.private == False)  # noqa: E712
        .order_by(GoalTemplateVersion.number.desc())  # type: ignore[union-attr]
    ).all())


def _version_dict(version: GoalTemplateVersion, live_id: int | None) -> dict:
    return {
        "version_uuid": version.version_uuid, "number": version.number, "note": version.note,
        "restored_from_number": version.restored_from_number, "published_at": version.published_at,
        "published_by_user_id": version.published_by_user_id, "live": version.id == live_id,
    }


def template_dict(db: Session, template: GoalTemplate, *, with_document: bool = True) -> dict:
    live = published_version(db, template)
    result = {
        "template_uuid": template.template_uuid, "org_id": template.org_id, "title": template.title,
        "description": template.description, "thumbnail_image": template.thumbnail_image,
        "status": getattr(template.status, "value", template.status), "system_type": template.system_type,
        "etag": etag(template), "published_version": live.number if live else None,
        "has_unpublished_changes": (live is None) or live.content_hash != fingerprint(db, template),
        "update_date": template.update_date,
    }
    if with_document:
        result["document"] = template.document
        result["versions"] = [_version_dict(version, template.published_version_id) for version in _versions(db, template)]
    return result


def list_templates(db: Session, current_user: PublicUser, org_id: int, include_archived: bool = False) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    statement = select(GoalTemplate).where(GoalTemplate.org_id == org_id)
    if not include_archived:
        statement = statement.where(GoalTemplate.status != TemplateStatus.ARCHIVED)
    rows = db.exec(statement.order_by(GoalTemplate.title)).all()
    return [template_dict(db, row, with_document=False) for row in rows]


def create_template(db: Session, current_user: PublicUser, org_id: int, document: dict | None = None, title: str = "") -> dict:
    require_org_admin(current_user.id, org_id, db)
    raw = document or empty_document(title.strip() or "Untitled template")
    now = _now()
    template = GoalTemplate(
        template_uuid=f"goal_template_{uuid4()}", org_id=org_id, title="", document={},
        created_by_user_id=current_user.id, creation_date=now, update_date=now,
    )
    db.add(template)
    db.flush()
    _store(db, template, _validated(db, template, raw))
    db.commit()
    db.refresh(template)
    return template_dict(db, template)


def _store(db: Session, template: GoalTemplate, document: dict) -> None:
    template.document = document
    template.title = document["template"]["title"]
    template.description = document["template"].get("description") or ""
    template.update_date = _now()
    db.add(template)


def get_template(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return template_dict(db, template_or_404(db, org_id, template_uuid))


def save_template(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, document: dict, expected_etag: str | None = None) -> dict:
    """Replace the draft. With ``expected_etag``, refuse if someone saved since it was read."""
    require_org_admin(current_user.id, org_id, db)
    template = template_or_404(db, org_id, template_uuid)
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates are updated with each release")
    if expected_etag and expected_etag != etag(template):
        raise HTTPException(status_code=409, detail={"message": "The template changed since you read it", "document": template.document, "etag": etag(template)})
    _store(db, template, _validated(db, template, document))
    db.commit()
    db.refresh(template)
    return template_dict(db, template)


def set_status(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, status: TemplateStatus) -> dict:
    require_org_admin(current_user.id, org_id, db)
    template = template_or_404(db, org_id, template_uuid)
    template.status = status
    template.update_date = _now()
    db.add(template)
    db.commit()
    return template_dict(db, template, with_document=False)


def _freeze(db: Session, template: GoalTemplate, working: LearningActivity) -> LearningActivity:
    """The frozen copy of a working activity's current content, reusing an identical earlier copy."""
    content = activity_hash(db, working)
    existing = db.exec(select(LearningActivity).where(LearningActivity.frozen_from_id == working.id, LearningActivity.frozen_hash == content)).first()
    if existing:
        return existing
    return copy_activity(db, working, goal_template_id=template.id, frozen_from_id=working.id, frozen_hash=content)


def frozen_document(db: Session, template: GoalTemplate, document: dict) -> dict:
    """A copy of the document whose activity steps play frozen copies."""
    frozen = deepcopy(document)
    for _, step in iter_steps(frozen):
        if step.get("type") != "activity":
            continue
        working = _working_activity(db, template, step["config"]["activity_uuid"])
        step["config"]["activity_uuid"] = _freeze(db, template, working).activity_uuid
    return frozen


def new_version(db: Session, template: GoalTemplate, document: dict, user_id: int | None, note: str = "", *,
                restored_from: int | None = None, private: bool = False, content_fingerprint: str = "") -> GoalTemplateVersion:
    """Store a version (flushed, not committed). Public versions become the one new goals are issued from."""
    number = (db.exec(select(func.max(GoalTemplateVersion.number)).where(GoalTemplateVersion.template_id == template.id)).one() or 0) + 1
    version = GoalTemplateVersion(
        version_uuid=f"goal_template_version_{uuid4()}", template_id=int(template.id), org_id=template.org_id,  # type: ignore[arg-type]
        number=number, document=document, content_hash=content_fingerprint, note=note.strip(), restored_from_number=restored_from,
        private=private, published_by_user_id=user_id, published_at=datetime.utcnow(), creation_date=_now(),
    )
    db.add(version)
    db.flush()
    if not private:
        template.published_version_id = version.id
        db.add(template)
        db.flush()
    return version


def publish_draft(db: Session, template: GoalTemplate, user_id: int | None, note: str = "") -> GoalTemplateVersion:
    if not (template.document or {}).get("stages"):
        raise HTTPException(status_code=422, detail="Add a stage before publishing")
    return new_version(db, template, frozen_document(db, template, template.document), user_id, note, content_fingerprint=fingerprint(db, template))


def publish(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, note: str = "") -> dict:
    require_org_admin(current_user.id, org_id, db)
    template = template_or_404(db, org_id, template_uuid)
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates are published with each release")
    publish_draft(db, template, current_user.id, note)
    db.commit()
    db.refresh(template)
    return template_dict(db, template)


def restore(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, number: int, note: str = "") -> dict:
    """Publish an earlier version again, and make it the draft too."""
    require_org_admin(current_user.id, org_id, db)
    template = template_or_404(db, org_id, template_uuid)
    earlier = db.exec(select(GoalTemplateVersion).where(
        GoalTemplateVersion.template_id == template.id, GoalTemplateVersion.number == number, GoalTemplateVersion.private == False,  # noqa: E712
    )).first()
    if not earlier:
        raise HTTPException(status_code=404, detail="Version not found")
    draft = deepcopy(earlier.document)
    # The draft edits working activities, so point activity steps back at copies of the frozen ones.
    for _, step in iter_steps(draft):
        if step.get("type") == "activity":
            frozen = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).first()
            if frozen:
                step["config"]["activity_uuid"] = copy_activity(db, frozen, goal_template_id=template.id, frozen_from_id=None, frozen_hash=None).activity_uuid
    _store(db, template, draft)
    db.flush()
    new_version(db, template, deepcopy(earlier.document), current_user.id, note or f"Restored version {number}",
                restored_from=number, content_fingerprint=fingerprint(db, template))
    db.commit()
    db.refresh(template)
    return template_dict(db, template)


def issuable_version(db: Session, template: GoalTemplate) -> GoalTemplateVersion:
    if getattr(template.status, "value", template.status) == TemplateStatus.ARCHIVED.value:
        raise HTTPException(status_code=409, detail="This template is archived")
    version = published_version(db, template)
    if not version:
        raise HTTPException(status_code=409, detail="Publish the template before handing it out")
    return version

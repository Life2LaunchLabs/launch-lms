"""Goal templates: the draft document, published versions, and rolling back.

A template's ``document`` is its working draft. Publishing freezes it into an
immutable ``GoalTemplateVersion`` with every activity replaced by a frozen copy,
and new goals are issued from the published version. Goals already issued keep
the version they got. Restoring publishes an earlier version's document again.
Drafts, semvers and switching the live version are in ``drafts``.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, func, select

from src.db.goal_templates import TemplateCover
from src.db.goals import PLAN_COLORS, GoalTemplate, GoalTemplateVersion, TemplateStatus
from src.db.learning import LearningActivity
from src.db.users import PublicUser
from src.security.org_auth import is_org_admin, require_org_admin
from src.services.goals.document import empty_document, iter_steps, validate_document
from src.services.learning.activity_copy import activity_hash, content_hash, copy_activity


def _now() -> str:
    return datetime.now().isoformat()


# System plans written by code and synced each release; the page templates plan is edited in the app.
RELEASE_MANAGED = ("starter", "launch")


def release_managed(template: GoalTemplate) -> bool:
    return template.system_type in RELEASE_MANAGED


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
        "version_uuid": version.version_uuid, "number": version.number, "semver": version.semver, "note": version.note,
        "restored_from_number": version.restored_from_number, "published_at": version.published_at,
        "published_by_user_id": version.published_by_user_id, "live": version.id == live_id,
    }


def cover(template: GoalTemplate) -> dict:
    """What a plan card shows: the image, else the icon on the color (the web picks for a plan without them)."""
    return {"thumbnail_image": template.thumbnail_image or "", "icon": template.icon, "color": template.color}


def template_dict(db: Session, template: GoalTemplate, *, with_document: bool = True) -> dict:
    live = published_version(db, template)
    result = {
        "template_uuid": template.template_uuid, "org_id": template.org_id, "title": template.title,
        "description": template.description, **cover(template),
        "status": getattr(template.status, "value", template.status), "system_type": template.system_type,
        "etag": etag(template), "published_version": live.number if live else None,
        "live_version": _version_dict(live, live.id) if live else None,
        "has_unpublished_changes": (live is None) or live.content_hash != fingerprint(db, template),
        "update_date": template.update_date,
    }
    from src.services.goals import drafts

    result["draft"] = drafts.draft_meta(db, template, unpublished=result["has_unpublished_changes"])
    if with_document:
        result["document"] = template.document
        # The plan page shows the live version while a draft is open (activity steps play frozen copies).
        result["live_document"] = live.document if live else None
        result["versions"] = [_version_dict(version, template.published_version_id) for version in _versions(db, template)]
    return result


def set_cover(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: TemplateCover) -> dict:
    """Change the plan's image, icon or color. Covers aren't versioned: every version shows the current one."""
    require_org_admin(current_user.id, org_id, db, "build_plans")
    template = template_or_404(db, org_id, template_uuid)
    if template.system_type:
        raise HTTPException(status_code=409, detail="System templates keep their cover")
    image = (payload.thumbnail_image or "").strip()
    if image and not image.startswith(("https://", "/content/")):
        raise HTTPException(status_code=422, detail="thumbnail_image: use an uploaded image (/content/...) or an https address")
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        setattr(template, field, (value or "").strip() if field == "thumbnail_image" else value)
    template.update_date = _now()
    db.add(template)
    db.commit()
    db.refresh(template)
    return cover(template)


def can_edit(db: Session, current_user: PublicUser, org_id: int) -> bool:
    """Whether this person may change the organization's templates (admins and maintainers; staff only read them)."""
    return is_org_admin(current_user.id, org_id, db)


def require_reader(db: Session, current_user: PublicUser, org_id: int) -> None:
    """Template reads are for the organization's staff; every write keeps ``require_org_admin``."""
    from src.services.school.roles import is_staff

    if current_user.is_superadmin or is_org_admin(current_user.id, org_id, db) or is_staff(db, org_id, current_user.id):
        return
    raise HTTPException(status_code=403, detail="Only the organization's staff can see its plan templates")


def _frameworks_of(document: dict, nodes: dict) -> list[dict]:
    """The requirement frameworks a template's steps link to, with how many of each framework's requirements."""
    counts: dict[str, dict] = {}
    for _, step in iter_steps(document or {}):
        for node_uuid in step.get("requirement_node_uuids") or []:
            framework = nodes.get(node_uuid)
            if framework is None:
                continue
            entry = counts.setdefault(framework.framework_uuid, {"framework_uuid": framework.framework_uuid, "name": framework.name, "nodes": set()})
            entry["nodes"].add(node_uuid)
    return [{"framework_uuid": item["framework_uuid"], "name": item["name"], "node_count": len(item["nodes"])} for item in counts.values()]


def list_templates(db: Session, current_user: PublicUser, org_id: int, include_archived: bool = False) -> list[dict]:
    """The organization's templates, each with its size, the badge its draft earns and the frameworks it maps to."""
    from src.services.badges.definition import summary
    from src.services.requirements import mappable_nodes

    require_reader(db, current_user, org_id)
    statement = select(GoalTemplate).where(GoalTemplate.org_id == org_id)
    if not include_archived:
        statement = statement.where(GoalTemplate.status != TemplateStatus.ARCHIVED)
    rows = db.exec(statement.order_by(GoalTemplate.title)).all()
    read_only = not can_edit(db, current_user, org_id)
    from src.services.goals.collections import _listed_ids, collections_by_template

    listed = _listed_ids(db, [int(row.id) for row in rows if row.id])
    in_collections = collections_by_template(db, org_id, [int(row.id) for row in rows if row.id])
    nodes = mappable_nodes(db, org_id)
    return [{
        **template_dict(db, row, with_document=False), "read_only": read_only,
        "stage_count": len((row.document or {}).get("stages") or []), "step_count": sum(1 for _ in iter_steps(row.document or {})),
        "badge": summary(row, row.document), "frameworks": _frameworks_of(row.document, nodes),
        "collections": in_collections.get(int(row.id or 0), []), "listed": int(row.id or 0) in listed,
    } for row in rows]


def _next_color(db: Session, org_id: int) -> str:
    """New plans take the plan colors in turn, so a library reads as a mix."""
    count = db.exec(select(func.count()).select_from(GoalTemplate).where(GoalTemplate.org_id == org_id)).one()
    return PLAN_COLORS[int(count or 0) % len(PLAN_COLORS)]


def create_template(db: Session, current_user: PublicUser, org_id: int, document: dict | None = None, title: str = "",
                    icon: str | None = None, color: str | None = None) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    raw = document or empty_document(title.strip() or "Untitled template")
    now = _now()
    template = GoalTemplate(
        template_uuid=f"goal_template_{uuid4()}", org_id=org_id, title="", document={}, icon=icon or "target", color=color or _next_color(db, org_id),
        draft={"semver": "1.0.0", "note": "", "base_version_uuid": None, "started_at": now, "started_by_user_id": current_user.id},
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
    """One of the organization's templates with its draft; ``read_only`` for staff, who see it but can't change it."""
    require_reader(db, current_user, org_id)
    template = template_or_404(db, org_id, template_uuid)
    from src.services.badges.definition import draft_achievement
    from src.services.goals.collections import collections_by_template

    # The badge as the draft earns it, plan details filled in, for the editor's badge card.
    return {**template_dict(db, template), "read_only": not can_edit(db, current_user, org_id),
            "badge": draft_achievement(db, template),
            "collections": collections_by_template(db, org_id, [int(template.id or 0)]).get(int(template.id or 0), [])}


def save_template(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, document: dict, expected_etag: str | None = None) -> dict:
    """Replace the draft. With ``expected_etag``, refuse if someone saved since it was read."""
    require_org_admin(current_user.id, org_id, db, "build_plans")
    template = template_or_404(db, org_id, template_uuid)
    if release_managed(template):
        raise HTTPException(status_code=409, detail="System templates are updated with each release")
    if expected_etag and expected_etag != etag(template):
        raise HTTPException(status_code=409, detail={"message": "The template changed since you read it", "document": template.document, "etag": etag(template)})
    from src.services.goals import drafts

    # Saving edits the draft; callers that never started one (the connector) get the next minor version.
    drafts.ensure_draft(db, template, current_user.id)
    _store(db, template, _validated(db, template, document))
    db.commit()
    db.refresh(template)
    return template_dict(db, template)


def set_status(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, status: TemplateStatus) -> dict:
    require_org_admin(current_user.id, org_id, db, "build_plans")
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
                restored_from: int | None = None, private: bool = False, content_fingerprint: str = "",
                semver: str | None = None, make_live: bool = True) -> GoalTemplateVersion:
    """Store a version (flushed, not committed). Public versions get a semver (default: the next minor)
    and, with ``make_live``, become the one new goals are issued from."""
    from src.services.goals import drafts

    number = (db.exec(select(func.max(GoalTemplateVersion.number)).where(GoalTemplateVersion.template_id == template.id)).one() or 0) + 1
    version = GoalTemplateVersion(
        version_uuid=f"goal_template_version_{uuid4()}", template_id=int(template.id), org_id=template.org_id,  # type: ignore[arg-type]
        number=number, semver=None if private else (semver or drafts.suggest(db, template)), document=document, content_hash=content_fingerprint, note=note.strip(), restored_from_number=restored_from,
        private=private, published_by_user_id=user_id, published_at=datetime.utcnow(), creation_date=_now(),
    )
    db.add(version)
    db.flush()
    if not private and make_live:
        template.published_version_id = version.id
        db.add(template)
        db.flush()
    return version


def publish_draft(db: Session, template: GoalTemplate, user_id: int | None, note: str = "", *,
                  semver: str | None = None, make_live: bool = True) -> GoalTemplateVersion:
    """Freeze the draft into a locked version and close the draft (flushed, not committed)."""
    from src.services.goals import drafts

    if not (template.document or {}).get("stages"):
        raise HTTPException(status_code=422, detail="Add a stage before publishing")
    meta = template.draft or {}
    chosen = drafts.checked(db, template, semver or meta.get("semver") or drafts.suggest(db, template))
    version = new_version(db, template, frozen_document(db, template, template.document), user_id, note or meta.get("note") or "",
                          content_fingerprint=fingerprint(db, template), semver=chosen, make_live=make_live)
    template.draft = None
    db.add(template)
    db.flush()
    return version


def publish(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, note: str = "", *,
            semver: str | None = None, make_live: bool = True) -> dict:
    """Publish the draft as a locked version; by default it goes live and active assignments move to it."""
    from src.services.goals import drafts

    require_org_admin(current_user.id, org_id, db, "build_plans")
    template = template_or_404(db, org_id, template_uuid)
    if release_managed(template):
        raise HTTPException(status_code=409, detail="System templates are published with each release")
    if make_live:
        from src.services.goals import plan_resources

        plan_resources.ensure_listed_shareable(db, template, template.document or {})
    version = publish_draft(db, template, current_user.id, note, semver=semver, make_live=make_live)
    moved = drafts.move_assignments(db, template, version, current_user.id) if make_live else None
    db.commit()
    db.refresh(template)
    return {**template_dict(db, template), "moved": moved}


def restore(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, number: int, note: str = "") -> dict:
    """Publish an earlier version again, make it the draft too, and move active assignments to it.
    (The connector's rollback; the plan page switches the live version directly, see ``drafts.set_live``.)"""
    from src.services.goals import drafts

    require_org_admin(current_user.id, org_id, db, "build_plans")
    template = template_or_404(db, org_id, template_uuid)
    earlier = db.exec(select(GoalTemplateVersion).where(
        GoalTemplateVersion.template_id == template.id, GoalTemplateVersion.number == number, GoalTemplateVersion.private == False,  # noqa: E712
    )).first()
    if not earlier:
        raise HTTPException(status_code=404, detail="Version not found")
    from src.services.goals import plan_resources

    plan_resources.ensure_listed_shareable(db, template, earlier.document or {})
    _store(db, template, working_copy(db, template, earlier.document))
    template.draft = None
    db.flush()
    version = new_version(db, template, deepcopy(earlier.document), current_user.id, note or f"Restored version {number}",
                          restored_from=number, content_fingerprint=fingerprint(db, template))
    drafts.move_assignments(db, template, version, current_user.id)
    db.commit()
    db.refresh(template)
    return template_dict(db, template)


def working_copy(db: Session, template: GoalTemplate, version_document: dict) -> dict:
    """A version's document as a draft: drafts edit working activities, so activity steps point at
    fresh working copies of the frozen ones."""
    draft = deepcopy(version_document)
    for _, step in iter_steps(draft):
        if step.get("type") == "activity":
            frozen = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).first()
            if frozen:
                step["config"]["activity_uuid"] = copy_activity(db, frozen, goal_template_id=template.id, frozen_from_id=None, frozen_hash=None).activity_uuid
    return draft


def issuable_version(db: Session, template: GoalTemplate) -> GoalTemplateVersion:
    if template.system_type == "page_templates":
        raise HTTPException(status_code=409, detail="Page templates can't be handed out")
    if getattr(template.status, "value", template.status) == TemplateStatus.ARCHIVED.value:
        raise HTTPException(status_code=409, detail="This template is archived")
    version = published_version(db, template)
    if not version:
        detail = "This plan has no live version" if _versions(db, template) else "Publish the template before assigning it"
        raise HTTPException(status_code=409, detail=detail)
    return version


def template_activity(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, activity_uuid: str) -> dict:
    """A template's working activity with its pages, for the activity editor."""
    from src.db.learning import LearningPage
    from src.services.learning import lookups

    require_org_admin(current_user.id, org_id, db, "build_plans")
    template = template_or_404(db, org_id, template_uuid)
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).first()
    if not activity or activity.goal_template_id != template.id or activity.frozen_from_id is not None:
        raise HTTPException(status_code=404, detail="Activity not found in this template")
    pages = db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()  # type: ignore[arg-type]
    return {
        "template": {"template_uuid": template.template_uuid, "title": template.title, "org_id": template.org_id},
        "activity": lookups._serialize_activity(activity, list(pages)).model_dump(),
    }

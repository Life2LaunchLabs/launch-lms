"""Read and write activities as Activity Documents.

An activity is the content of a plan template's activity step; its
organization's admins edit it in place. Saves are guarded by the document
etag, so a save made from a stale copy returns 409 with the current document
instead of overwriting someone's work.
"""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.db.programs import Program, ProgramObjective
from src.db.users import AnonymousUser, PublicUser
from src.services import learning
from src.services.learning_documents.document import (
    PreparedDocument,
    document_etag,
    export_document,
    prepare_document,
)
from src.services.learning_documents.models import ActivityDocumentSave

User = PublicUser | AnonymousUser


def activity_pages(db_session: Session, activity: LearningActivity) -> list[LearningPage]:
    return list(
        db_session.exec(
            select(LearningPage)
            .where(LearningPage.activity_id == activity.id)
            .order_by(LearningPage.order.asc())  # type: ignore[union-attr]
        ).all()
    )


def _context(db_session: Session, activity: LearningActivity) -> dict:
    template = db_session.exec(
        select(Program).join(ProgramObjective, ProgramObjective.program_id == Program.id).where(ProgramObjective.objective_id == activity.objective_id)
    ).first()
    return {
        "activity_uuid": activity.activity_uuid,
        "org_id": activity.org_id,
        "template_uuid": template.program_uuid if template else None,
        "template_name": template.name if template else None,
    }


def envelope(db_session: Session, activity: LearningActivity, warnings: list | None = None) -> dict:
    document = export_document(activity, activity_pages(db_session, activity))
    return {
        "document": document,
        "etag": document_etag(document),
        "context": _context(db_session, activity),
        "warnings": [item.model_dump() for item in warnings or []],
    }


def _invalid(prepared: PreparedDocument) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "code": "invalid_document",
            "message": "The activity document has problems. Fix every listed error and try again.",
            "errors": [item.model_dump() for item in prepared.errors],
            "warnings": [item.model_dump() for item in prepared.warnings],
        },
    )


async def get_activity_document(request: Request, activity_uuid: str, current_user: User, db_session: Session) -> dict:
    activity = learning._get_activity(db_session, activity_uuid)
    learning._require_activity_editor(db_session, current_user, activity)
    return envelope(db_session, activity)


async def validate_activity_document(
    request: Request, raw: dict, current_user: User, db_session: Session, *, activity_uuid: str | None = None
) -> dict:
    """Check a document without saving it, against the stored activity when one is given."""
    activity = learning._get_activity(db_session, activity_uuid) if activity_uuid else None
    if activity:
        learning._require_activity_editor(db_session, current_user, activity)
    else:
        learning._require_user(current_user)
    pages = activity_pages(db_session, activity) if activity else []
    prepared = prepare_document(
        raw,
        existing_page_uuids={page.page_uuid for page in pages},
        allow_system_blocks=bool(activity and learning._is_system_activity(db_session, activity)),
        baseline=export_document(activity, pages) if activity else None,
    )
    return {
        "valid": prepared.ok,
        "errors": [item.model_dump() for item in prepared.errors],
        "warnings": [item.model_dump() for item in prepared.warnings],
    }


def _write_pages(
    db_session: Session,
    activity: LearningActivity,
    prepared: PreparedDocument,
    existing: dict[str, LearningPage],
    now: str,
) -> None:
    keep = {page["page_uuid"] for page in prepared.pages}
    for page_uuid, page in existing.items():
        if page_uuid not in keep:
            db_session.delete(page)
    for order, data in enumerate(prepared.pages, start=1):
        page = existing.get(data["page_uuid"])
        if page is None:
            page = LearningPage(
                activity_id=activity.id or 0,
                org_id=activity.org_id,
                page_uuid=data["page_uuid"],
                page_type=LearningPageType(data["page_type"]),
                title=data["title"],
                creation_date=now,
            )
        page.page_type = LearningPageType(data["page_type"])
        page.title = data["title"].strip()
        page.required = data["required"]
        page.order = order
        page.content = data["content"]
        page.design = data["design"]
        page.scoring, page.completion = {}, {}
        page.update_date = now
        db_session.add(page)


def _write_activity(activity: LearningActivity, prepared: PreparedDocument, now: str) -> None:
    data = prepared.activity
    activity.title = data["title"].strip()
    activity.description = data["description"]
    activity.icon = data["icon"]
    activity.thumbnail_image = data["thumbnail_image"]
    activity.settings = data["settings"] or {}
    activity.update_date = now


async def save_activity_document(
    request: Request, activity_uuid: str, payload: ActivityDocumentSave, current_user: User, db_session: Session
) -> dict:
    activity = learning._get_activity(db_session, activity_uuid)
    learning._require_activity_editor(db_session, current_user, activity)
    current = envelope(db_session, activity)
    if payload.base_etag != current["etag"]:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "stale_document",
                "message": "This activity changed since it was read. Merge your edits into the current document and save again.",
                "current": current,
            },
        )
    claimed = payload.document.activity.activity_uuid
    if claimed and claimed != activity.activity_uuid:
        raise HTTPException(status_code=422, detail="Document activity_uuid does not match the activity being saved")
    existing = {page.page_uuid: page for page in activity_pages(db_session, activity)}
    prepared = prepare_document(
        payload.document.model_dump(),
        existing_page_uuids=set(existing),
        allow_system_blocks=learning._is_system_activity(db_session, activity),
        baseline=export_document(activity, list(existing.values())),
    )
    if not prepared.ok:
        raise _invalid(prepared)
    now = learning._now()
    _write_activity(activity, prepared, now)
    db_session.add(activity)
    _write_pages(db_session, activity, prepared, existing, now)
    db_session.commit()
    db_session.refresh(activity)
    return envelope(db_session, activity, prepared.warnings)

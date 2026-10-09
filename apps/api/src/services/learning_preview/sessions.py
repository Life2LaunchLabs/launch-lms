"""Preview sessions: one activity document snapshot behind an unguessable token.

The in-app editor, shareable preview links and the Claude connector all create
sessions here and render them with the same player, so a preview looks and
behaves the same wherever it is opened.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, delete, select

from config.config import get_launchlms_config
from src.db.learning import LearningBadge
from src.db.learning_previews import LearningActivityPreview
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.services import learning
from src.services.learning_documents.document import export_document, prepare_document
from src.services.learning_documents.store import activity_pages
from src.services.learning_preview import engine

PREVIEW_TTL = timedelta(hours=24)
TOKEN_PREFIX = "lpv_"


class PreviewCreate(BaseModel):
    activity_uuid: str | None = Field(default=None, description="Preview this stored activity (or use it as the base for `document`).")
    badge_uuid: str | None = Field(default=None, description="Badge the document belongs to when previewing a not-yet-saved activity.")
    document: dict | None = Field(default=None, description="An Activity Document to preview without saving it.")
    persona: dict = Field(default_factory=dict, description="Learner variables to start with, e.g. {'user.first_name': 'Sam'}.")
    source: str = Field(default="editor", pattern=r"^(editor|link|connector)$")


class PreviewStep(BaseModel):
    action: str = Field(pattern=r"^(submit|complete)$")
    page_uuid: str
    answer: dict | None = None
    button: str | None = None
    state: dict | None = None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def frontend_base_url() -> str:
    hosting = get_launchlms_config().hosting_config
    scheme = "https" if hosting.ssl else "http"
    return f"{scheme}://{hosting.frontend_domain}".rstrip("/")


def preview_url(org: Organization, token: str) -> str:
    return f"{frontend_base_url()}/orgs/{org.slug}/preview/activity/{token}"


async def create_preview(
    request: Request, payload: PreviewCreate, current_user: PublicUser | AnonymousUser, db_session: Session
) -> dict:
    activity = learning._get_activity(db_session, payload.activity_uuid) if payload.activity_uuid else None
    badge = (
        db_session.get(LearningBadge, activity.badge_id)
        if activity
        else learning._get_badge(db_session, payload.badge_uuid) if payload.badge_uuid else None
    )
    if badge is None:
        raise HTTPException(status_code=422, detail="Pass activity_uuid or badge_uuid")
    user = learning._require_org_admin(db_session, current_user, badge.org_id)
    existing = activity_pages(db_session, activity) if activity else []
    raw = payload.document if payload.document is not None else export_document(activity, existing) if activity else None
    if raw is None:
        raise HTTPException(status_code=422, detail="Pass a document to preview")
    prepared = prepare_document(
        raw,
        existing_page_uuids={page.page_uuid for page in existing},
        allow_system_blocks=learning._is_system_object(badge),
        baseline=export_document(activity, existing) if activity else None,
    )
    if not prepared.ok:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_document",
                "message": "Fix these problems before previewing.",
                "errors": [item.model_dump() for item in prepared.errors],
            },
        )
    now = datetime.utcnow()
    db_session.exec(delete(LearningActivityPreview).where(LearningActivityPreview.expires_at < now))  # type: ignore[call-overload]
    token = f"{TOKEN_PREFIX}{secrets.token_urlsafe(24)}"
    db_session.add(
        LearningActivityPreview(
            token_hash=_hash(token),
            org_id=badge.org_id,
            badge_id=badge.id,
            activity_id=activity.id if activity else None,
            created_by_user_id=user.id,
            source=payload.source,
            document={"format": raw.get("format", "launch-lms.activity"), "format_version": 1, "activity": prepared.activity, "pages": prepared.pages},
            persona=payload.persona,
            expires_at=now + PREVIEW_TTL,
            creation_date=str(now),
        )
    )
    db_session.commit()
    org = learning._get_org(db_session, badge.org_id)
    return {
        "token": token,
        "url": preview_url(org, token),
        "expires_at": (now + PREVIEW_TTL).isoformat() + "Z",
        "warnings": [item.model_dump() for item in prepared.warnings],
    }


def _load(db_session: Session, token: str) -> LearningActivityPreview:
    if not token.startswith(TOKEN_PREFIX):
        raise HTTPException(status_code=404, detail="Preview not found")
    preview = db_session.exec(
        select(LearningActivityPreview).where(LearningActivityPreview.token_hash == _hash(token))
    ).first()
    if not preview or preview.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="This preview has expired. Ask for a new preview link.")
    return preview


async def get_preview(request: Request, token: str, db_session: Session) -> dict:
    preview = _load(db_session, token)
    badge = db_session.get(LearningBadge, preview.badge_id) if preview.badge_id else None
    org = learning._get_org(db_session, preview.org_id)
    return {
        **engine.start(preview.document, preview.persona),
        "badge": {"badge_uuid": badge.badge_uuid, "name": badge.name, "org_id": badge.org_id} if badge else None,
        "org": {"id": org.id, "slug": org.slug, "name": org.name},
        "source": preview.source,
        "expires_at": preview.expires_at.isoformat() + "Z",
    }


async def step_preview(request: Request, token: str, payload: PreviewStep, db_session: Session) -> dict:
    preview = _load(db_session, token)
    state = payload.state if payload.state is not None else engine.initial_state(preview.persona)
    return engine.step(preview.document, state, payload.action, payload.page_uuid, payload.answer, payload.button)

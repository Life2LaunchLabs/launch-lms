"""Page authoring, validation and media."""

import logging
from uuid import uuid4
from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningPage,
    LearningPageCreate,
    LearningPageRead,
    LearningPageType,
    LearningPageUpdate,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.learning_content.models import StandardPageContent
from src.services.learning_content.recovery import split_issues
from src.services.learning_page_convert import iter_block_stacks
from src.services.utils.upload_content import upload_file
from src.services.learning import access_rules, lookups

logger = logging.getLogger(__name__)


def _validate_page_payload(page_type: LearningPageType, content: dict | None, previous: dict | None = None) -> list[str]:
    """Shape rules come from the typed content models; this adds what only the
    page API needs (revisit targets must already be real pages).

    With ``previous`` (the stored content) only issues the edit introduces are
    rejected; issues the page already had are returned so the save goes through
    and admins are never locked out of content that predates a model change.
    """
    if page_type != LearningPageType.STANDARD or not isinstance(content, dict):
        return []
    introduced, carried = split_issues(StandardPageContent, content, previous)
    if introduced:
        raise HTTPException(status_code=422, detail=introduced[0])
    for stack in iter_block_stacks(content):
        for block in stack:
            button = (block.get("content") or {}) if isinstance(block, dict) and block.get("type") == "button" else {}
            if button.get("action") == "revisit" and not str(button.get("revisit_page_uuid")).startswith("learning_page_"):
                raise HTTPException(status_code=422, detail="Buttons either continue along the flow or revisit an earlier page")
    return carried


def _validate_page_button_destinations(
    content: dict | None, page_uuids: set[str]
) -> None:
    for stack in iter_block_stacks(content or {}):
        for block in stack:
            if isinstance(block, dict) and block.get("type") == "button":
                target = str((block.get("content") or {}).get("revisit_page_uuid") or "")
                if target and target not in page_uuids:
                    raise HTTPException(
                        status_code=422,
                        detail="A button can only revisit a page of the same activity",
                    )


async def create_page(
    request: Request,
    data: LearningPageCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningPageRead:
    activity = lookups._get_activity(db_session, data.activity_uuid)
    lookups._require_activity_editor(db_session, current_user, activity)
    lookups._ensure_editable(db_session, activity)
    _validate_page_payload(data.page_type, data.content)
    if any(
        block.get("type") == "portfolio_preview"
        for stack in iter_block_stacks(data.content or {})
        for block in stack
        if isinstance(block, dict)
    ):
        if not lookups._is_system_activity(db_session, activity):
            raise HTTPException(
                status_code=403,
                detail="Portfolio preview blocks are limited to trusted system activities",
            )
    pages = db_session.exec(
        select(LearningPage)
        .where(LearningPage.activity_id == activity.id)
        .order_by(LearningPage.order.asc())
    ).all()  # type: ignore
    _validate_page_button_destinations(data.content, {page.page_uuid for page in pages})
    now = access_rules._now()
    payload = data.model_dump(exclude={"activity_uuid"})
    page = LearningPage(
        **payload,
        activity_id=activity.id or 0,
        org_id=activity.org_id,
        order=(pages[-1].order + 1) if pages else 1,
        page_uuid=f"learning_page_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(page)
    db_session.commit()
    db_session.refresh(page)
    return lookups._serialize_page(page)


def _page_activity(db_session: Session, current_user, page: LearningPage) -> LearningActivity:
    activity = db_session.get(LearningActivity, page.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    lookups._require_activity_editor(db_session, current_user, activity)
    lookups._ensure_editable(db_session, activity)
    return activity


async def update_page(
    request: Request,
    page_uuid: str,
    data: LearningPageUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningPageRead:
    page = lookups._get_page(db_session, page_uuid)
    activity = _page_activity(db_session, current_user, page)
    patch = data.model_dump(exclude_unset=True)
    if "content" in patch or "page_type" in patch:
        page_type = patch.get("page_type") or page.page_type
        carried = _validate_page_payload(
            page_type, patch.get("content", page.content), page.content if page_type == page.page_type else None
        )
        if carried:
            logger.warning("Saved learning page %s with existing content issues: %s", page.page_uuid, carried)
        if any(
            block.get("type") == "portfolio_preview"
            for stack in iter_block_stacks(patch.get("content", page.content) or {})
            for block in stack
            if isinstance(block, dict)
        ):
            if not lookups._is_system_activity(db_session, activity):
                raise HTTPException(
                    status_code=403,
                    detail="Portfolio preview blocks are limited to trusted system activities",
                )
        siblings = db_session.exec(
            select(LearningPage).where(LearningPage.activity_id == page.activity_id)
        ).all()
        _validate_page_button_destinations(
            patch.get("content", page.content), {item.page_uuid for item in siblings}
        )
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(page, key, value)
    page.update_date = access_rules._now()
    db_session.add(page)
    db_session.commit()
    db_session.refresh(page)
    return lookups._serialize_page(page)


async def delete_page(
    request: Request,
    page_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    page = lookups._get_page(db_session, page_uuid)
    activity = _page_activity(db_session, current_user, page)
    if lookups._is_system_activity(db_session, activity):
        sibling_count = db_session.exec(
            select(func.count(LearningPage.id)).where(
                LearningPage.activity_id == page.activity_id
            )
        ).one()
        if sibling_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Activities must keep at least one page",
            )
    db_session.delete(page)
    db_session.commit()
    return {"detail": "Learning page deleted"}


async def upload_page_media(
    request: Request,
    page_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    media_file: UploadFile | None = None,
) -> dict:
    page = lookups._get_page(db_session, page_uuid)
    _page_activity(db_session, current_user, page)
    org = access_rules._get_org(db_session, page.org_id)

    if not media_file or not media_file.filename:
        raise HTTPException(status_code=400, detail="Media file is required")

    filename = await upload_file(
        file=media_file,
        directory=f"learning_pages/{page.page_uuid}/media",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="media",
    )
    return {
        "url": f"/content/orgs/{org.org_uuid}/learning_pages/{page.page_uuid}/media/{filename}"
    }

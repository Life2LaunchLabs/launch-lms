"""Page authoring, validation and media."""

from copy import deepcopy
from uuid import uuid4
from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivityRead,
    LearningBadge,
    LearningPage,
    LearningPageCreate,
    LearningPageRead,
    LearningPageType,
    LearningPageUpdate,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.learning_content.models import StandardPageContent, content_error
from src.services.learning_flow import (
    FlowValidationError,
    validate_flow,
)
from src.services.learning_page_convert import (
    STANDARD_CONTENT_VERSION,
    iter_block_stacks,
)
from src.services.utils.upload_content import upload_file
from src.services.learning import access_rules, lookups


async def convert_page_variants_to_flow(
    request: Request,
    activity_uuid: str,
    page_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActivityRead:
    activity = lookups._get_activity(db_session, activity_uuid)
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    lookups._assert_content_editable(db_session, activity.version_id)
    pages = list(
        db_session.exec(
            select(LearningPage)
            .where(LearningPage.activity_id == activity.id)
            .order_by(LearningPage.order.asc())
        ).all()
    )  # type: ignore
    page = next(
        (
            item
            for item in pages
            if item.page_uuid == access_rules._clean_uuid(page_uuid, "learning_page_")
        ),
        None,
    )
    variants = (page.content or {}).get("variants") if page else None
    if (
        not page
        or not isinstance(variants, dict)
        or not (variants.get("overrides") or {})
    ):
        raise HTTPException(
            status_code=422, detail="Page does not contain convertible variants"
        )
    source_uuid = (variants.get("source") or {}).get("page_uuid")
    source_block_id = (variants.get("source") or {}).get("block_id")
    source_page = next((item for item in pages if item.page_uuid == source_uuid), None)
    if not source_page or source_page.order >= page.order:
        raise HTTPException(
            status_code=422, detail="Variant source must be an earlier question page"
        )
    now, created = access_rules._now(), []
    for key, override in (variants.get("overrides") or {}).items():
        clone = LearningPage(
            activity_id=page.activity_id,
            badge_id=page.badge_id,
            org_id=page.org_id,
            page_type=page.page_type,
            title=f"{page.title} — {key}",
            order=page.order,
            required=page.required,
            content={
                "version": (page.content or {}).get(
                    "version", STANDARD_CONTENT_VERSION
                ),
                "blocks": deepcopy((override or {}).get("blocks") or []),
            },
            design=deepcopy(page.design),
            scoring=deepcopy(page.scoring),
            completion=deepcopy(page.completion),
            page_uuid=f"learning_page_{uuid4()}",
            creation_date=now,
            update_date=now,
        )
        db_session.add(clone)
        db_session.flush()
        created.append((str(key), clone))
    page.content = {
        key: deepcopy(value)
        for key, value in (page.content or {}).items()
        if key != "variants"
    }
    db_session.add(page)
    nodes = [
        {"id": f"page:{item.page_uuid}", "type": "page", "page_uuid": item.page_uuid}
        for item in pages
    ]
    nodes.extend(
        {"id": f"page:{item.page_uuid}", "type": "page", "page_uuid": item.page_uuid}
        for _, item in created
    )
    nodes.append({"id": "complete", "type": "complete"})
    edges = []
    page_index = pages.index(page)
    branch_from = pages[page_index - 1] if page_index > 0 else source_page
    for index, item in enumerate(pages):
        source = f"page:{item.page_uuid}"
        target = (
            f"page:{pages[index + 1].page_uuid}"
            if index + 1 < len(pages)
            else "complete"
        )
        if item.id == branch_from.id:
            continue
        if item.id == page.id:
            edges.append({"from": source, "to": target, "priority": 0})
            for _, branch in created:
                edges.append(
                    {"from": f"page:{branch.page_uuid}", "to": target, "priority": 0}
                )
        else:
            edges.append({"from": source, "to": target, "priority": 0})
    default_target = f"page:{page.page_uuid}"
    edges.append(
        {
            "from": f"page:{branch_from.page_uuid}",
            "to": default_target,
            "priority": -100,
        }
    )
    for priority, (key, branch) in enumerate(created, start=1):
        answer_key = (
            f"{source_page.page_uuid}.result.questions.{source_block_id}.option_ids"
            if source_block_id
            else f"{source_page.page_uuid}.result.option_ids"
        )
        edges.append(
            {
                "from": f"page:{branch_from.page_uuid}",
                "to": f"page:{branch.page_uuid}",
                "priority": 100 - priority,
                "condition": {
                    "op": "contains",
                    "left": {"source": "answer", "key": answer_key},
                    "right": key,
                },
            }
        )
    flow = {
        "version": 1,
        "entry": f"page:{pages[0].page_uuid}",
        "nodes": nodes,
        "edges": edges,
    }
    try:
        validate_flow(
            flow,
            {node["page_uuid"] for node in nodes if node["type"] == "page"},
            {item.page_uuid for item in pages if item.required},
        )
    except FlowValidationError as exc:
        db_session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    activity.settings = {**(activity.settings or {}), "flow": flow}
    activity.update_date = now
    db_session.add(activity)
    db_session.commit()
    all_pages = db_session.exec(
        select(LearningPage)
        .where(LearningPage.activity_id == activity.id)
        .order_by(LearningPage.order.asc())
    ).all()  # type: ignore
    return lookups._serialize_activity(activity, all_pages)


def _validate_page_payload(page_type: LearningPageType, content: dict | None) -> None:
    """Shape rules come from the typed content models; this adds what only the
    page API needs (revisit targets must already be real pages)."""
    if page_type != LearningPageType.STANDARD or not isinstance(content, dict):
        return
    error = content_error(StandardPageContent, content)
    if error:
        raise HTTPException(status_code=422, detail=error)
    for stack in iter_block_stacks(content):
        for block in stack:
            button = block.get("content") or {} if block.get("type") == "button" else {}
            if button.get("action") == "revisit" and not str(button.get("revisit_page_uuid")).startswith("learning_page_"):
                raise HTTPException(status_code=422, detail="Buttons either continue along the flow or revisit an earlier page")


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
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    version = lookups._assert_content_editable(db_session, activity.version_id)
    _validate_page_payload(data.page_type, data.content)
    if any(
        block.get("type") == "portfolio_preview"
        for stack in iter_block_stacks(data.content or {})
        for block in stack
        if isinstance(block, dict)
    ):
        badge = db_session.get(LearningBadge, activity.badge_id)
        if not badge or not access_rules._is_system_object(badge):
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
        badge_id=activity.badge_id,
        version_id=activity.version_id,
        org_id=activity.org_id,
        order=(pages[-1].order + 1) if pages else 1,
        page_uuid=f"learning_page_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(page)
    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(page)
    return lookups._serialize_page(page)


async def update_page(
    request: Request,
    page_uuid: str,
    data: LearningPageUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningPageRead:
    page = lookups._get_page(db_session, page_uuid)
    access_rules._require_org_admin(db_session, current_user, page.org_id)
    version = lookups._assert_content_editable(db_session, page.version_id)
    patch = data.model_dump(exclude_unset=True)
    if "content" in patch or "page_type" in patch:
        _validate_page_payload(
            patch.get("page_type") or page.page_type, patch.get("content", page.content)
        )
        if any(
            block.get("type") == "portfolio_preview"
            for stack in iter_block_stacks(patch.get("content", page.content) or {})
            for block in stack
            if isinstance(block, dict)
        ):
            badge = db_session.get(LearningBadge, page.badge_id)
            if not badge or not access_rules._is_system_object(badge):
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
    lookups._bump_version(version)
    db_session.add(version)
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
    access_rules._require_org_admin(db_session, current_user, page.org_id)
    version = lookups._assert_content_editable(db_session, page.version_id)
    badge = db_session.get(LearningBadge, page.badge_id)
    if badge and access_rules._is_system_object(badge):
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
    lookups._bump_version(version)
    db_session.add(version)
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
    access_rules._require_org_admin(db_session, current_user, page.org_id)
    lookups._assert_content_editable(db_session, page.version_id)
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


async def upload_response_media(
    request: Request,
    page_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    media_file: UploadFile | None = None,
) -> dict:
    user = access_rules._require_user(current_user)
    page = lookups._get_page(db_session, page_uuid)
    badge = db_session.get(LearningBadge, page.badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    lookups._ensure_read_badge(db_session, badge, current_user)
    org = access_rules._get_org(db_session, page.org_id)

    if not media_file or not media_file.filename:
        raise HTTPException(status_code=400, detail="Media file is required")

    filename = await upload_file(
        file=media_file,
        directory=f"learning_responses/{page.page_uuid}/{user.user_uuid}",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="response",
    )
    return {
        "url": f"/content/orgs/{org.org_uuid}/learning_responses/{page.page_uuid}/{user.user_uuid}/{filename}"
    }

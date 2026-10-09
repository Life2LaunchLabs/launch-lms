"""Activity authoring."""

from uuid import uuid4
from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningActivityCreate,
    LearningActivityImport,
    LearningActivityRead,
    LearningActivityUpdate,
    LearningBadge,
    LearningPage,
    LearningPageType,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.learning_flow import (
    FlowValidationError,
    append_page_to_flow,
    validate_flow,
)
from src.services.learning_page_convert import (
    STANDARD_CONTENT_VERSION,
    iter_block_stacks,
    paragraph_node,
    text_block,
)
from src.services.learning_portfolio_actions import (
    PortfolioActionError,
    validate_outcomes,
)
from src.services.media import (
    copy_google_forms_image_to_library,
    is_google_forms_image_url,
)
from src.services.learning import access_rules, enrollment, lookups, page_authoring


async def create_activity(
    request: Request,
    data: LearningActivityCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActivityRead:
    badge = enrollment._get_badge(db_session, data.badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    version = lookups._get_badge_version(db_session, badge, data.version_uuid)
    lookups._ensure_draft(version)
    path = lookups._get_path_for_badge(db_session, badge, version)
    existing = db_session.exec(
        select(LearningActivity)
        .where(LearningActivity.path_id == path.id)
        .order_by(LearningActivity.order.asc())
    ).all()  # type: ignore
    now = access_rules._now()
    payload = data.model_dump(exclude={"badge_uuid", "version_uuid"})
    activity = LearningActivity(
        **payload,
        path_id=path.id or 0,
        badge_id=badge.id or 0,
        version_id=version.id,
        org_id=badge.org_id,
        order=(existing[-1].order + 1) if existing else 1,
        activity_uuid=f"learning_activity_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.flush()

    page = LearningPage(
        activity_id=activity.id or 0,
        badge_id=badge.id or 0,
        version_id=version.id,
        org_id=badge.org_id,
        page_type=LearningPageType.STANDARD,
        title="Untitled page",
        order=1,
        content={
            "version": STANDARD_CONTENT_VERSION,
            "blocks": [text_block(paragraph_node(""))],
        },
        page_uuid=f"learning_page_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(page)
    flow = (activity.settings or {}).get("flow")
    if flow:
        activity.settings = {
            **(activity.settings or {}),
            "flow": append_page_to_flow(flow, page.page_uuid),
        }
        activity.update_date = now
        db_session.add(activity)
    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(activity)
    db_session.refresh(page)
    return lookups._serialize_activity(activity, [page])


async def import_activity(
    request: Request,
    data: LearningActivityImport,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActivityRead:
    if not data.pages:
        raise HTTPException(status_code=422, detail="An imported activity needs at least one page")
    if len(data.pages) > 300:
        raise HTTPException(status_code=422, detail="An imported activity can contain at most 300 pages")

    badge = enrollment._get_badge(db_session, data.badge_uuid)
    access_rules._require_org_admin(db_session, current_user, badge.org_id)
    version = lookups._get_badge_version(db_session, badge, data.version_uuid)
    lookups._ensure_draft(version)
    path = lookups._get_path_for_badge(db_session, badge, version)
    existing = db_session.exec(
        select(LearningActivity)
        .where(LearningActivity.path_id == path.id)
        .order_by(LearningActivity.order.asc())
    ).all()  # type: ignore

    import_pages = [page.model_copy(deep=True) for page in data.pages]
    for page in import_pages:
        for stack in iter_block_stacks(page.content or {}):
            for block in stack:
                if not isinstance(block, dict) or block.get("type") != "image":
                    continue
                block_content = block.get("content") or {}
                source_url = str(block_content.get("src") or "").strip()
                if not is_google_forms_image_url(source_url):
                    continue
                try:
                    asset = await copy_google_forms_image_to_library(
                        source_url,
                        badge.org_id,
                        current_user,  # type: ignore[arg-type]
                        db_session,
                        title=str(block_content.get("alt") or "Google Form image"),
                        commit=False,
                    )
                except HTTPException as exc:
                    raise HTTPException(
                        status_code=exc.status_code,
                        detail=f'Could not copy an image for “{page.title}”: {exc.detail}',
                    ) from exc
                block["content"] = {
                    **block_content,
                    "src": asset.url,
                    "media_asset_uuid": asset.asset_uuid,
                }

    page_uuids = [f"learning_page_{uuid4()}" for _ in import_pages]
    page_uuid_set = set(page_uuids)
    for page in import_pages:
        page_authoring._validate_page_payload(LearningPageType.STANDARD, page.content)
        page_authoring._validate_page_button_destinations(page.content, page_uuid_set)
        if any(
            block.get("type") == "portfolio_preview"
            for stack in iter_block_stacks(page.content or {})
            for block in stack
            if isinstance(block, dict)
        ) and not access_rules._is_system_object(badge):
            raise HTTPException(
                status_code=403,
                detail="Portfolio preview blocks are limited to trusted system activities",
            )

    now = access_rules._now()
    nodes = [
        {"id": f"page:{page_uuid}", "type": "page", "page_uuid": page_uuid}
        for page_uuid in page_uuids
    ] + [{"id": "complete", "type": "complete"}]
    edges = [
        {
            "from": f"page:{page_uuid}",
            "to": f"page:{page_uuids[index + 1]}" if index + 1 < len(page_uuids) else "complete",
            "priority": 0,
        }
        for index, page_uuid in enumerate(page_uuids)
    ]
    settings = {
        **(data.settings or {}),
        "flow": {"version": 1, "entry": f"page:{page_uuids[0]}", "nodes": nodes, "edges": edges},
    }
    try:
        validate_outcomes(
            settings.get("outcomes"),
            access_rules._is_system_object(badge),
        )
        validate_flow(
            settings["flow"],
            set(page_uuids),
            {
                page_uuid
                for page_data, page_uuid in zip(import_pages, page_uuids)
                if page_data.required
            },
        )
    except (FlowValidationError, PortfolioActionError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    activity = LearningActivity(
        path_id=path.id or 0,
        badge_id=badge.id or 0,
        version_id=version.id,
        org_id=badge.org_id,
        title=data.title.strip() or "Imported Google Form",
        description=data.description or "",
        required=True,
        published=False,
        settings=settings,
        order=(existing[-1].order + 1) if existing else 1,
        activity_uuid=f"learning_activity_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.flush()

    pages: list[LearningPage] = []
    for index, (page_data, page_uuid) in enumerate(zip(import_pages, page_uuids)):
        page = LearningPage(
            activity_id=activity.id or 0,
            badge_id=badge.id or 0,
            version_id=version.id,
            org_id=badge.org_id,
            page_type=LearningPageType.STANDARD,
            title=page_data.title.strip() or f"Question {index + 1}",
            required=page_data.required,
            content=page_data.content,
            design=page_data.design,
            scoring=page_data.scoring,
            completion=page_data.completion,
            order=index + 1,
            page_uuid=page_uuid,
            creation_date=now,
            update_date=now,
        )
        db_session.add(page)
        pages.append(page)

    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(activity)
    for page in pages:
        db_session.refresh(page)
    return lookups._serialize_activity(activity, pages)


async def update_activity(
    request: Request,
    activity_uuid: str,
    data: LearningActivityUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActivityRead:
    activity = lookups._get_activity(db_session, activity_uuid)
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    version = lookups._assert_content_editable(db_session, activity.version_id)
    patch = data.model_dump(exclude_unset=True)
    if access_rules._is_locked_launch_ready_activity(activity) and patch.get("published") is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Required Launch Ready activities cannot be unpublished",
        )
    if "settings" in patch:
        pages = db_session.exec(
            select(LearningPage).where(LearningPage.activity_id == activity.id)
        ).all()
        badge = db_session.get(LearningBadge, activity.badge_id)
        try:
            validate_flow(
                (patch["settings"] or {}).get("flow"),
                {page.page_uuid for page in pages},
                {page.page_uuid for page in pages if page.required},
            )
            validate_outcomes(
                (patch["settings"] or {}).get("outcomes"),
                bool(badge and access_rules._is_system_object(badge)),
            )
        except (FlowValidationError, PortfolioActionError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    for key, value in patch.items():
        setattr(activity, key, value)
    activity.update_date = access_rules._now()
    lookups._bump_version(version)
    db_session.add(version)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    pages = db_session.exec(
        select(LearningPage)
        .where(LearningPage.activity_id == activity.id)
        .order_by(LearningPage.order.asc())
    ).all()  # type: ignore
    return lookups._serialize_activity(activity, pages)


async def delete_activity(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    activity = lookups._get_activity(db_session, activity_uuid)
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    version = lookups._assert_content_editable(db_session, activity.version_id)
    if access_rules._is_locked_launch_ready_activity(activity):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Required Launch Ready activities cannot be deleted",
        )
    badge = db_session.get(LearningBadge, activity.badge_id)
    if badge and access_rules._is_system_object(badge):
        sibling_count = db_session.exec(
            select(func.count(LearningActivity.id)).where(
                LearningActivity.badge_id == badge.id
            )
        ).one()
        if sibling_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Badges must keep at least one activity",
            )
    db_session.delete(activity)
    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    return {"detail": "Learning activity deleted"}


async def duplicate_activity(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActivityRead:
    activity = lookups._get_activity(db_session, activity_uuid)
    access_rules._require_org_admin(db_session, current_user, activity.org_id)
    version = lookups._assert_content_editable(db_session, activity.version_id)
    if access_rules._is_locked_launch_ready_activity(activity):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Required Launch Ready activities cannot be duplicated",
        )
    pages = db_session.exec(
        select(LearningPage)
        .where(LearningPage.activity_id == activity.id)
        .order_by(LearningPage.order.asc())
    ).all()  # type: ignore
    siblings = db_session.exec(
        select(LearningActivity)
        .where(LearningActivity.path_id == activity.path_id)
        .order_by(LearningActivity.order.asc())
    ).all()  # type: ignore
    now = access_rules._now()
    clone = LearningActivity(
        path_id=activity.path_id,
        badge_id=activity.badge_id,
        version_id=activity.version_id,
        org_id=activity.org_id,
        title=f"{activity.title} Copy",
        description=activity.description,
        thumbnail_image=activity.thumbnail_image,
        icon=activity.icon,
        order=(siblings[-1].order + 1) if siblings else 1,
        required=activity.required,
        published=False,
        settings=activity.settings,
        activity_uuid=f"learning_activity_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(clone)
    db_session.flush()
    cloned_pages = []
    for page in pages:
        cloned_page = LearningPage(
            activity_id=clone.id or 0,
            badge_id=page.badge_id,
            version_id=page.version_id,
            org_id=page.org_id,
            page_type=page.page_type,
            title=page.title,
            order=page.order,
            required=page.required,
            content=page.content,
            design=page.design,
            scoring=page.scoring,
            completion=page.completion,
            page_uuid=f"learning_page_{uuid4()}",
            creation_date=now,
            update_date=now,
        )
        db_session.add(cloned_page)
        cloned_pages.append(cloned_page)
    lookups._bump_version(version)
    db_session.add(version)
    db_session.commit()
    db_session.refresh(clone)
    for page in cloned_pages:
        db_session.refresh(page)
    return lookups._serialize_activity(clone, cloned_pages)

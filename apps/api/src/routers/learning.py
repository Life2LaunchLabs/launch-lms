from fastapi import APIRouter, Depends, Query, Request, Response

from src.core.events.database import get_db_session
from src.db.learning import (
    BadgeCollectionCreate,
    BadgeCollectionRead,
    BadgeCollectionUpdate,
    LearningActivityCreate,
    LearningActivityRead,
    LearningActivityUpdate,
    LearningAwardCreate,
    LearningBadgeCreate,
    LearningBadgeRead,
    LearningBadgeUpdate,
    LearningPageComplete,
    LearningPageCreate,
    LearningPageRead,
    LearningPageUpdate,
    LearningPathRead,
    LearningResponseSubmit,
    LearningRunRead,
)
from src.security.auth import get_current_user
from src.services import learning as learning_service
from src.services.guest_sessions import resolve_learning_actor


badges_router = APIRouter()
collections_router = APIRouter()
activities_router = APIRouter()
pages_router = APIRouter()
runs_router = APIRouter()
awards_router = APIRouter()


@badges_router.post("/")
async def api_create_badge(
    request: Request,
    badge: LearningBadgeCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningBadgeRead:
    return await learning_service.create_badge(request, badge, current_user, db_session)


@badges_router.get("/")
async def api_list_badges(
    request: Request,
    org_id: int = Query(...),
    admin: bool = Query(False),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[LearningBadgeRead]:
    return await learning_service.list_badges(request, org_id, current_user, db_session, admin=admin)


@badges_router.get("/{badge_uuid}")
async def api_get_badge(
    request: Request,
    badge_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningBadgeRead:
    return await learning_service.get_badge(request, badge_uuid, current_user, db_session)


@badges_router.put("/{badge_uuid}")
async def api_update_badge(
    request: Request,
    badge_uuid: str,
    badge: LearningBadgeUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningBadgeRead:
    return await learning_service.update_badge(request, badge_uuid, badge, current_user, db_session)


@badges_router.delete("/{badge_uuid}")
async def api_delete_badge(
    request: Request,
    badge_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.delete_badge(request, badge_uuid, current_user, db_session)


@badges_router.get("/{badge_uuid}/path")
async def api_get_badge_path(
    request: Request,
    response: Response,
    badge_uuid: str,
    include_run: bool = Query(False),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningPathRead:
    actor = resolve_learning_actor(request, response, current_user, db_session) if include_run else None
    return await learning_service.get_path(request, badge_uuid, current_user, db_session, actor=actor)


@collections_router.post("/")
async def api_create_collection(
    request: Request,
    collection: BadgeCollectionCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeCollectionRead:
    return await learning_service.create_collection(request, collection, current_user, db_session)


@collections_router.get("/")
async def api_list_collections(
    request: Request,
    org_id: int = Query(...),
    admin: bool = Query(False),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[BadgeCollectionRead]:
    return await learning_service.list_collections(request, org_id, current_user, db_session, admin=admin)


@collections_router.put("/{collection_uuid}")
async def api_update_collection(
    request: Request,
    collection_uuid: str,
    collection: BadgeCollectionUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> BadgeCollectionRead:
    return await learning_service.update_collection(request, collection_uuid, collection, current_user, db_session)


@collections_router.delete("/{collection_uuid}")
async def api_delete_collection(
    request: Request,
    collection_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.delete_collection(request, collection_uuid, current_user, db_session)


@activities_router.post("/")
async def api_create_activity(
    request: Request,
    activity: LearningActivityCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningActivityRead:
    return await learning_service.create_activity(request, activity, current_user, db_session)


@activities_router.put("/{activity_uuid}")
async def api_update_activity(
    request: Request,
    activity_uuid: str,
    activity: LearningActivityUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningActivityRead:
    return await learning_service.update_activity(request, activity_uuid, activity, current_user, db_session)


@activities_router.post("/{activity_uuid}/duplicate")
async def api_duplicate_activity(
    request: Request,
    activity_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningActivityRead:
    return await learning_service.duplicate_activity(request, activity_uuid, current_user, db_session)


@activities_router.delete("/{activity_uuid}")
async def api_delete_activity(
    request: Request,
    activity_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.delete_activity(request, activity_uuid, current_user, db_session)


@pages_router.post("/")
async def api_create_page(
    request: Request,
    page: LearningPageCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningPageRead:
    return await learning_service.create_page(request, page, current_user, db_session)


@pages_router.put("/{page_uuid}")
async def api_update_page(
    request: Request,
    page_uuid: str,
    page: LearningPageUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningPageRead:
    return await learning_service.update_page(request, page_uuid, page, current_user, db_session)


@pages_router.delete("/{page_uuid}")
async def api_delete_page(
    request: Request,
    page_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.delete_page(request, page_uuid, current_user, db_session)


@runs_router.post("/start/{badge_uuid}")
async def api_start_run(
    request: Request,
    response: Response,
    badge_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningRunRead:
    actor = resolve_learning_actor(request, response, current_user, db_session)
    return await learning_service.start_or_resume_run(request, badge_uuid, actor, db_session)


@runs_router.post("/complete-page")
async def api_complete_page(
    request: Request,
    response: Response,
    payload: LearningPageComplete,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningRunRead:
    actor = resolve_learning_actor(request, response, current_user, db_session)
    return await learning_service.complete_page(request, payload, actor, db_session)


@runs_router.post("/submit-response")
async def api_submit_response(
    request: Request,
    response: Response,
    payload: LearningResponseSubmit,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningRunRead:
    actor = resolve_learning_actor(request, response, current_user, db_session)
    return await learning_service.submit_response(request, payload, actor, db_session)


@awards_router.post("/confer")
async def api_confer_award(
    request: Request,
    payload: LearningAwardCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.confer_award(request, payload, current_user, db_session)


@awards_router.get("/")
async def api_list_awards(
    request: Request,
    org_id: int | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    return await learning_service.list_user_awards(request, current_user, db_session, org_id=org_id)


@awards_router.get("/assertion/{award_uuid}")
async def api_get_award_assertion(
    request: Request,
    award_uuid: str,
    db_session=Depends(get_db_session),
) -> dict:
    award = await learning_service.get_award(request, award_uuid, db_session)
    return award["badge_assertion"]


@awards_router.get("/badge-class/{badge_uuid}")
async def api_get_badge_class(
    request: Request,
    badge_uuid: str,
    db_session=Depends(get_db_session),
) -> dict:
    from sqlmodel import select
    from src.db.learning import LearningBadge

    badge = db_session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == (badge_uuid if badge_uuid.startswith("badge_") else f"badge_{badge_uuid}"))).first()
    if not badge:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Badge not found")
    from src.services.learning import _get_org, _get_org_config, build_learning_badge_class_payload

    return build_learning_badge_class_payload(request, _get_org(db_session, badge.org_id), badge, _get_org_config(db_session, badge.org_id))


@awards_router.get("/{award_uuid}")
async def api_get_award(
    request: Request,
    award_uuid: str,
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.get_award(request, award_uuid, db_session)

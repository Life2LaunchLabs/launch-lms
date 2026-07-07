import io
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse

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
    LearningResponseGrade,
    LearningResponseSubmit,
    LearningRunRead,
    LearningVariableCreate,
    LearningVariableRead,
    LearningVariableUpdate,
)
from src.security.auth import get_current_user
from src.services import learning as learning_service
from src.services import learning_migration as learning_migration_service
from src.services import learning_transfer as learning_transfer_service
from src.services.guest_sessions import resolve_learning_actor


badges_router = APIRouter()
collections_router = APIRouter()
activities_router = APIRouter()
pages_router = APIRouter()
runs_router = APIRouter()
responses_router = APIRouter()
awards_router = APIRouter()
migrations_router = APIRouter()
imports_router = APIRouter()
variables_router = APIRouter()


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
    org_id: int | None = Query(None),
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


@badges_router.put("/{badge_uuid}/thumbnail")
async def api_update_badge_thumbnail(
    request: Request,
    badge_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
    thumbnail: UploadFile = File(...),
) -> LearningBadgeRead:
    return await learning_service.update_badge_thumbnail(request, badge_uuid, current_user, db_session, thumbnail)


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
    org_id: int | None = Query(None),
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


@collections_router.get("/{collection_uuid}/export")
async def api_export_collection(
    request: Request,
    collection_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    zip_content = await learning_transfer_service.export_badge_collection(request, collection_uuid, current_user, db_session)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"launch-lms-badge-collection-{timestamp}.zip"
    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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


@pages_router.post("/{page_uuid}/media")
async def api_upload_page_media(
    request: Request,
    page_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
    media: UploadFile = File(...),
) -> dict:
    return await learning_service.upload_page_media(request, page_uuid, current_user, db_session, media)


@pages_router.post("/{page_uuid}/response-media")
async def api_upload_response_media(
    request: Request,
    page_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
    media: UploadFile = File(...),
) -> dict:
    return await learning_service.upload_response_media(request, page_uuid, current_user, db_session, media)


@variables_router.get("/")
async def api_list_learning_variables(
    request: Request,
    org_id: int = Query(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[LearningVariableRead]:
    return await learning_service.list_learning_variables(request, org_id, current_user, db_session)


@variables_router.post("/")
async def api_create_learning_variable(
    request: Request,
    variable: LearningVariableCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningVariableRead:
    return await learning_service.create_learning_variable(request, variable, current_user, db_session)


@variables_router.put("/{variable_uuid}")
async def api_update_learning_variable(
    request: Request,
    variable_uuid: str,
    variable: LearningVariableUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningVariableRead:
    return await learning_service.update_learning_variable(request, variable_uuid, variable, current_user, db_session)


@variables_router.delete("/{variable_uuid}")
async def api_delete_learning_variable(
    request: Request,
    variable_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.delete_learning_variable(request, variable_uuid, current_user, db_session)


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


@responses_router.get("/")
async def api_list_learning_responses(
    request: Request,
    org_id: int = Query(...),
    badge_uuid: str | None = Query(None),
    activity_uuid: str | None = Query(None),
    page_uuid: str | None = Query(None),
    grading_status: str | None = Query("pending"),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> list[dict]:
    return await learning_service.list_learning_responses(
        request,
        current_user,
        db_session,
        org_id=org_id,
        badge_uuid=badge_uuid,
        activity_uuid=activity_uuid,
        page_uuid=page_uuid,
        grading_status=grading_status,
    )


@responses_router.post("/{attempt_uuid}/grade")
async def api_grade_learning_response(
    request: Request,
    attempt_uuid: str,
    payload: LearningResponseGrade,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.grade_learning_response(
        request,
        attempt_uuid,
        payload,
        current_user,
        db_session,
    )


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


@migrations_router.get("/course/{course_uuid}/preview")
async def api_preview_course_migration(
    request: Request,
    course_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return learning_migration_service.preview_course_migration(request, course_uuid, current_user, db_session)


@migrations_router.post("/course/{course_uuid}/convert")
async def api_convert_course_migration(
    request: Request,
    course_uuid: str,
    target_collection_uuid: str | None = Query(None),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    target_collection = None
    if target_collection_uuid:
        from sqlmodel import select
        from src.db.learning import BadgeCollection

        target_collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == target_collection_uuid)).first()
        if not target_collection:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Target badge collection not found")
        learning_service._require_org_admin(db_session, current_user, target_collection.org_id)
    return learning_migration_service.convert_course_migration(request, course_uuid, current_user, db_session, target_collection=target_collection)


@migrations_router.get("/collection/{collection_uuid}/preview")
async def api_preview_collection_migration(
    request: Request,
    collection_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return learning_migration_service.preview_collection_migration(request, collection_uuid, current_user, db_session)


@migrations_router.post("/collection/{collection_uuid}/convert")
async def api_convert_collection_migration(
    request: Request,
    collection_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return learning_migration_service.convert_collection_migration(request, collection_uuid, current_user, db_session)


@imports_router.post("/analyze")
async def api_analyze_badge_import(
    request: Request,
    org_id: int = Query(...),
    zip_file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_transfer_service.analyze_badge_import_package(request, zip_file, org_id, current_user, db_session)


@imports_router.post("/")
async def api_import_badge_package(
    request: Request,
    payload: dict,
    org_id: int = Query(...),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_transfer_service.import_badge_package(request, org_id, payload, current_user, db_session)

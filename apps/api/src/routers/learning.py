
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from src.core.events.database import get_db_session
from src.db.learning import (
    LearningActivityRead,
    LearningActivityUpdate,
    LearningPageCreate,
    LearningPageRead,
    LearningPageUpdate,
    LearningRunRead,
    LearningVariableCreate,
    LearningVariableRead,
    LearningVariableUpdate,
)
from src.db.learning_requests import LearningPageComplete, LearningResponseGrade, LearningResponseSubmit, LearningRunDecision
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user, get_current_user
from src.services import learning as learning_service

activities_router = APIRouter()
pages_router = APIRouter()
runs_router = APIRouter()
responses_router = APIRouter()
variables_router = APIRouter()


@activities_router.put("/{activity_uuid}")
async def api_update_activity(
    request: Request,
    activity_uuid: str,
    activity: LearningActivityUpdate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> LearningActivityRead:
    return await learning_service.update_activity(request, activity_uuid, activity, current_user, db_session)


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


@pages_router.post("/{page_uuid}/captions")
async def api_generate_captions(
    page_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    """Captions for a video page's uploaded video (not saved: the editor shows them and saves the page)."""
    from src.services.learning.captions import generate_captions

    return await generate_captions(page_uuid, current_user, db_session)


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


@runs_router.post("/{run_uuid}/decision")
async def api_decide_learning_run(
    request: Request,
    run_uuid: str,
    payload: LearningRunDecision,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await learning_service.decide_run(request, run_uuid, payload.passed, payload.note, current_user, db_session)


@runs_router.post("/complete-page")
async def api_complete_page(
    request: Request,
    payload: LearningPageComplete,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session=Depends(get_db_session),
) -> LearningRunRead:
    return await learning_service.complete_page(request, payload, current_user, db_session)


@runs_router.post("/submit-response")
async def api_submit_response(
    request: Request,
    payload: LearningResponseSubmit,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session=Depends(get_db_session),
) -> LearningRunRead:
    return await learning_service.submit_response(request, payload, current_user, db_session)


@responses_router.get("/")
async def api_list_learning_responses(
    request: Request,
    org_id: int = Query(...),
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


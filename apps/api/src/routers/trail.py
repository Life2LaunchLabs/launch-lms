from fastapi import APIRouter, Depends, Request, Response
from src.core.events.database import get_db_session
from src.db.trails import TrailCreate, TrailRead
from src.security.auth import get_current_user
from src.security.features_utils.dependencies import require_courses_feature
from src.services.trail.trail import (
    Trail,
    add_activity_to_trail,
    add_course_to_trail,
    create_user_trail,
    get_user_trails,
    get_user_trail_with_orgid,
    remove_course_from_trail,
    remove_activity_from_trail,
)
from src.services.guest_sessions import resolve_learning_actor


router = APIRouter(dependencies=[Depends(require_courses_feature)])


@router.post("/start")
async def api_start_trail(
    request: Request,
    response: Response,
    trail_object: TrailCreate,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> Trail:
    """
    Start trail
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await create_user_trail(request, actor, trail_object, db_session)


@router.get("/")
async def api_get_user_trail(
    request: Request,
    response: Response,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> TrailRead:
    """
    Get a user trails
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await get_user_trails(request, actor=actor, db_session=db_session)


@router.get("/org/{org_id}/trail")
async def api_get_trail_by_org_id(
    request: Request,
    response: Response,
    org_id: int,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> TrailRead:
    """
    Get a user trails using org slug
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await get_user_trail_with_orgid(request, actor, org_id=org_id, db_session=db_session)


@router.post("/add_course/{course_uuid}")
async def api_add_course_to_trail(
    request: Request,
    response: Response,
    course_uuid: str,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> TrailRead:
    """
    Add Course to trail
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await add_course_to_trail(request, actor, course_uuid, db_session)


@router.delete("/remove_course/{course_uuid}")
async def api_remove_course_to_trail(
    request: Request,
    response: Response,
    course_uuid: str,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> TrailRead:
    """
    Remove Course from trail
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await remove_course_from_trail(request, actor, course_uuid, db_session)


@router.post("/add_activity/{activity_uuid}")
async def api_add_activity_to_trail(
    request: Request,
    response: Response,
    activity_uuid: str,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> TrailRead:
    """
    Add Activity to trail
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await add_activity_to_trail(request, actor, activity_uuid, db_session)


@router.delete("/remove_activity/{activity_uuid}")
async def api_remove_activity_from_trail(
    request: Request,
    response: Response,
    activity_uuid: str,
    user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> TrailRead:
    """
    Remove Activity from trail
    """
    actor = resolve_learning_actor(request, response, user, db_session)
    return await remove_activity_from_trail(request, actor, activity_uuid, db_session)

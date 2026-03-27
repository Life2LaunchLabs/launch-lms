from fastapi import APIRouter, Depends, HTTPException, Request
from src.core.events.database import get_db_session
from src.db.courses.quiz import QuizAttemptSubmit, QuizResultRead
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.courses.activities.quiz.attempts import (
    get_my_latest_result,
    submit_quiz_attempt,
    update_quiz_categories,
    update_quiz_scoring,
    update_quiz_results,
)

router = APIRouter()


@router.post("/{activity_uuid}/attempts", response_model=QuizResultRead)
async def api_submit_quiz_attempt(
    request: Request,
    activity_uuid: str,
    submission: QuizAttemptSubmit,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuizResultRead:
    """Submit a completed quiz attempt and receive computed results."""
    return await submit_quiz_attempt(
        request, activity_uuid, submission, current_user, db_session
    )


@router.get("/{activity_uuid}/my-result")
async def api_get_my_quiz_result(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    """Get the current user's most recent result for this quiz, or 404 if none."""
    result = await get_my_latest_result(
        request, activity_uuid, current_user, db_session
    )
    if result is None:
        raise HTTPException(status_code=404, detail="No quiz result found")
    return result


@router.put("/{activity_uuid}/scoring")
async def api_update_quiz_scoring(
    request: Request,
    activity_uuid: str,
    scoring_data: dict,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    """Save scoring vectors and option scores (teacher only)."""
    return await update_quiz_scoring(
        request, activity_uuid, scoring_data, current_user, db_session
    )


@router.put("/{activity_uuid}/categories")
async def api_update_quiz_categories(
    request: Request,
    activity_uuid: str,
    categories_data: dict,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    """Save result category sets (teacher only)."""
    return await update_quiz_categories(
        request, activity_uuid, categories_data, current_user, db_session
    )


@router.put("/{activity_uuid}/results")
async def api_update_quiz_results(
    request: Request,
    activity_uuid: str,
    results_data: dict,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    """Save result options (teacher only)."""
    return await update_quiz_results(
        request, activity_uuid, results_data, current_user, db_session
    )

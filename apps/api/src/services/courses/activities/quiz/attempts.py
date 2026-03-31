"""
Quiz attempt CRUD — DB operations for submitting and fetching quiz results.
"""

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.courses.activities import Activity
from src.db.courses.quiz import (
    QuizAnswer,
    QuizAttempt,
    QuizAttemptRead,
    QuizAttemptSubmit,
    QuizResult,
    QuizResultRead,
)
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import AccessAction, check_resource_access
from src.services.guest_sessions import LearningActor
from src.services.courses.activities.quiz.scoring import (
    compute_result_bundle,
    compute_scores,
)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_activity_and_course(
    activity_uuid: str,
    db_session: Session,
) -> tuple[Activity, Course]:
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == activity_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    course = db_session.exec(
        select(Course).where(Course.id == activity.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    return activity, course


def _build_result_read(result: QuizResult, attempt: QuizAttempt) -> QuizResultRead:
    return QuizResultRead(
        id=result.id,  # type: ignore
        attempt_id=result.attempt_id,
        attempt_uuid=attempt.attempt_uuid,
        result_json=result.result_json,
        computed_at=result.computed_at,
    )


# ── public functions ──────────────────────────────────────────────────────────

async def submit_quiz_attempt(
    request: Request,
    activity_uuid: str,
    submission: QuizAttemptSubmit,
    current_user: PublicUser | AnonymousUser,
    actor: LearningActor,
    db_session: Session,
) -> QuizResultRead:
    """
    Create an attempt, persist answers, run scoring, persist result.
    Returns the computed QuizResultRead.
    """
    activity, course = await _get_activity_and_course(activity_uuid, db_session)

    # Auth: must be able to read the course (enrolled or contributor)
    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.READ
    )
    if actor.is_guest and (not course.guest_access or not course.published):
        raise HTTPException(status_code=403, detail="Guest access is not enabled for this course")

    # Create attempt
    now = datetime.utcnow()
    attempt = QuizAttempt(
        attempt_uuid=f"quizattempt_{uuid4()}",
        activity_id=activity.id,  # type: ignore
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        org_id=activity.org_id,
        course_id=activity.course_id,
        started_at=now,
        completed_at=now,
        creation_date=str(now),
        update_date=str(now),
    )
    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

    # Persist answers
    for ans in submission.answers:
        db_answer = QuizAnswer(
            attempt_id=attempt.id,  # type: ignore
            question_uuid=ans.question_uuid,
            answer_json=ans.answer_json,
            creation_date=str(now),
        )
        db_session.add(db_answer)
    db_session.commit()

    # Pull scoring config from activity.details
    details = activity.details or {}
    vectors: list[dict] = details.get("scoring_vectors", [])
    option_scores: dict = details.get("option_scores", {})
    category_sets: list[dict] = details.get("category_sets", [])
    result_options: list[dict] = details.get("result_options", [])

    # Compute scores
    raw_answers = [a.answer_json for a in submission.answers]
    scores = compute_scores(raw_answers, option_scores, vectors)
    result_json = compute_result_bundle(scores, vectors, category_sets, result_options)

    # Persist result
    result = QuizResult(
        attempt_id=attempt.id,  # type: ignore
        result_json=result_json,
        computed_at=now,
        creation_date=str(now),
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    return _build_result_read(result, attempt)


async def get_my_latest_result(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    actor: LearningActor,
    db_session: Session,
) -> QuizResultRead | None:
    """
    Return the most recent QuizResult for current_user on this activity,
    or None if they have never completed it.
    """
    activity, course = await _get_activity_and_course(activity_uuid, db_session)

    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.READ
    )
    if actor.is_guest and (not course.guest_access or not course.published):
        raise HTTPException(status_code=403, detail="Guest access is not enabled for this course")

    # Find the latest completed attempt for this user + activity
    statement = select(QuizAttempt).where(
        QuizAttempt.activity_id == activity.id,
        QuizAttempt.completed_at.is_not(None),  # type: ignore
    )
    if actor.user_id is not None:
        statement = statement.where(QuizAttempt.user_id == actor.user_id)
    else:
        statement = statement.where(QuizAttempt.guest_session_id == actor.guest_session_id)
    attempt = db_session.exec(
        statement.order_by(QuizAttempt.completed_at.desc())  # type: ignore
    ).first()

    if not attempt:
        return None

    result = db_session.exec(
        select(QuizResult).where(QuizResult.attempt_id == attempt.id)
    ).first()

    if not result:
        return None

    return _build_result_read(result, attempt)


async def update_quiz_scoring(
    request: Request,
    activity_uuid: str,
    scoring_data: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """
    Save scoring_vectors and option_scores into Activity.details.
    Teachers only (requires UPDATE permission on the course).
    """
    activity, course = await _get_activity_and_course(activity_uuid, db_session)
    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.UPDATE
    )

    details = dict(activity.details or {})
    details["scoring_vectors"] = scoring_data.get("scoring_vectors", [])
    details["option_scores"] = scoring_data.get("option_scores", {})
    activity.details = details
    activity.update_date = str(datetime.utcnow())
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity.details  # type: ignore


async def update_quiz_categories(
    request: Request,
    activity_uuid: str,
    categories_data: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """
    Save category_sets into Activity.details.
    Teachers only (requires UPDATE permission on the course).
    """
    activity, course = await _get_activity_and_course(activity_uuid, db_session)
    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.UPDATE
    )

    details = dict(activity.details or {})
    details["category_sets"] = categories_data.get("category_sets", [])
    activity.details = details
    activity.update_date = str(datetime.utcnow())
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity.details  # type: ignore


async def update_quiz_results(
    request: Request,
    activity_uuid: str,
    results_data: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """
    Save result_options into Activity.details.
    Teachers only (requires UPDATE permission on the course).
    """
    activity, course = await _get_activity_and_course(activity_uuid, db_session)
    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.UPDATE
    )

    details = dict(activity.details or {})
    details["result_options"] = results_data.get("result_options", [])
    activity.details = details
    activity.update_date = str(datetime.utcnow())
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity.details  # type: ignore

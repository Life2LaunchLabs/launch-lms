"""
Quiz attempt CRUD — DB operations for submitting and fetching quiz results.
"""

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlmodel import Session, select, func

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
from src.services.trail.trail import add_activity_to_trail


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

    # Pull scoring config from activity.details
    details = activity.details or {}
    quiz_mode = details.get("quiz_mode", "categories")
    grading_rules: dict = details.get("grading_rules", {}) or {}
    max_attempts = grading_rules.get("max_attempts")
    vectors: list[dict] = details.get("scoring_vectors", [])
    option_scores: dict = details.get("option_scores", {})
    category_sets: list[dict] = details.get("category_sets", [])
    result_options: list[dict] = details.get("result_options", [])

    existing_attempts_statement = select(func.count(QuizAttempt.id)).where(
        QuizAttempt.activity_id == activity.id
    )
    if actor.user_id is not None:
        existing_attempts_statement = existing_attempts_statement.where(QuizAttempt.user_id == actor.user_id)
    else:
        existing_attempts_statement = existing_attempts_statement.where(QuizAttempt.guest_session_id == actor.guest_session_id)
    existing_attempts = db_session.exec(existing_attempts_statement).one() or 0

    if quiz_mode == "graded" and max_attempts is not None and existing_attempts >= max_attempts:
        raise HTTPException(status_code=403, detail="No attempts remaining for this quiz")

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

    # Compute scores
    raw_answers = [a.answer_json for a in submission.answers]
    scores = compute_scores(raw_answers, option_scores, vectors)
    result_json = compute_result_bundle(scores, vectors, category_sets, result_options)

    if quiz_mode == "graded":
        correct_score = float(scores.get("correct", 0.0))
        score_percent = round(correct_score * 100, 1)
        pass_percent = float(grading_rules.get("pass_percent", 70))
        attempt_number = int(existing_attempts) + 1

        prior_results_statement = (
            select(QuizResult.result_json)
            .join(QuizAttempt, QuizResult.attempt_id == QuizAttempt.id)
            .where(QuizAttempt.activity_id == activity.id)
        )
        if actor.user_id is not None:
            prior_results_statement = prior_results_statement.where(QuizAttempt.user_id == actor.user_id)
        else:
            prior_results_statement = prior_results_statement.where(QuizAttempt.guest_session_id == actor.guest_session_id)
        prior_results = db_session.exec(prior_results_statement).all()

        historical_scores = []
        for prior in prior_results:
            graded_result = (prior or {}).get("graded_result", {})
            if isinstance(graded_result, dict):
                historical_scores.append(float(graded_result.get("score_percent", 0.0)))
        best_score_percent = max(historical_scores + [score_percent]) if historical_scores else score_percent
        attempts_remaining = None if max_attempts is None else max(0, int(max_attempts) - attempt_number)
        passed = score_percent >= pass_percent

        result_json["quiz_mode"] = "graded"
        result_json["graded_result"] = {
            "score_percent": score_percent,
            "pass_percent": pass_percent,
            "passed": passed,
            "attempt_number": attempt_number,
            "attempts_remaining": attempts_remaining,
            "max_attempts": max_attempts,
            "best_score_percent": best_score_percent,
            "correct_answers": int(round(correct_score * len([a for a in raw_answers if a.get("type") == "select"]))),
            "question_count": len([a for a in raw_answers if a.get("type") == "select"]),
        }
    else:
        result_json["quiz_mode"] = "categories"

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

    if quiz_mode == "graded" and result_json.get("graded_result", {}).get("passed"):
        await add_activity_to_trail(request, actor, activity_uuid, db_session)

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
    if "category_scoring_vectors" in scoring_data:
        details["category_scoring_vectors"] = scoring_data.get("category_scoring_vectors", [])
    if "graded_scoring_vectors" in scoring_data:
        details["graded_scoring_vectors"] = scoring_data.get("graded_scoring_vectors", [])
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


async def update_quiz_settings(
    request: Request,
    activity_uuid: str,
    settings_data: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """
    Save quiz_mode and grading_rules into Activity.details.
    Teachers only (requires UPDATE permission on the course).
    """
    activity, course = await _get_activity_and_course(activity_uuid, db_session)
    await check_resource_access(
        request, db_session, current_user, course.course_uuid, AccessAction.UPDATE
    )

    details = dict(activity.details or {})
    if "quiz_mode" in settings_data:
        details["quiz_mode"] = settings_data.get("quiz_mode", "categories")
    if "grading_rules" in settings_data:
        details["grading_rules"] = settings_data.get("grading_rules", {})
    activity.details = details
    activity.update_date = str(datetime.utcnow())
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity.details  # type: ignore

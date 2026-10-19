"""Reviewing and grading learner responses."""

from datetime import datetime
from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningBadge,
    LearningPage,
    LearningPageProgress,
    LearningResponseAttempt,
    LearningRun,
    LearningRunStatus,
)
from src.db.learning_requests import LearningResponseGrade
from src.db.goals import Goal
from src.db.users import AnonymousUser, PublicUser, User
from src.security.superadmin import is_user_superadmin
from src.services.learning import access_rules, answer_validation, grading, lookups, run_navigation


def _grading_org_id(db_session: Session, goal: Goal, user: PublicUser) -> int | None:
    """The organization a person grades for on this goal, or None if they can't grade it.

    Reviewers on the learner's goal grade for the goal's organization; so do
    that organization's admins.
    """
    from src.services.goals import access

    org_id = goal.org_id
    if org_id is None:
        return None
    if "review_badge_submissions" in access.capabilities(db_session, goal, user.id) or is_user_superadmin(user.id, db_session):
        return org_id
    try:
        access_rules._require_org_admin(db_session, user, org_id)
        return org_id
    except HTTPException:
        return None


async def list_learning_responses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    org_id: int,
    badge_uuid: str | None = None,
    activity_uuid: str | None = None,
    page_uuid: str | None = None,
    grading_status: str | None = "pending",
) -> list[dict]:
    access_rules._require_org_admin(db_session, current_user, org_id)
    # Answers on goals that belong to this organization.
    statement = (
        select(LearningResponseAttempt)
        .join(LearningPage, LearningResponseAttempt.page_id == LearningPage.id)  # type: ignore
        .join(LearningRun, LearningResponseAttempt.run_id == LearningRun.id)  # type: ignore
        .join(Goal, Goal.id == LearningRun.goal_id)  # type: ignore
        .where(Goal.org_id == org_id)
        .order_by(LearningResponseAttempt.submitted_at.desc())  # type: ignore
    )
    if badge_uuid:
        statement = statement.where(Goal.badge_id == lookups._get_badge(db_session, badge_uuid).id)
    if activity_uuid:
        activity = lookups._get_activity(db_session, activity_uuid)
        statement = statement.where(LearningPage.activity_id == activity.id)
    if page_uuid:
        statement = statement.where(
            LearningPage.page_uuid == access_rules._clean_uuid(page_uuid, "learning_page_")
        )

    attempts = db_session.exec(statement).all()
    if grading_status and grading_status != "all":
        attempts = [
            attempt
            for attempt in attempts
            if (attempt.result or {}).get("grading_status") == grading_status
        ]

    page_ids = {attempt.page_id for attempt in attempts}
    page_by_id = (
        {
            page.id or 0: page
            for page in db_session.exec(
                select(LearningPage).where(LearningPage.id.in_(page_ids))
            ).all()  # type: ignore
        }
        if page_ids
        else {}
    )
    run_ids = {attempt.run_id for attempt in attempts}
    activity_ids = {page.activity_id for page in page_by_id.values()}
    activities = (
        {
            item.id or 0: item
            for item in db_session.exec(
                select(LearningActivity).where(LearningActivity.id.in_(activity_ids))
            ).all()  # type: ignore
        }
        if activity_ids
        else {}
    )
    user_ids = {attempt.user_id for attempt in attempts if attempt.user_id is not None}
    runs = (
        {
            run.id or 0: run
            for run in db_session.exec(
                select(LearningRun).where(LearningRun.id.in_(run_ids))
            ).all()  # type: ignore
        }
        if run_ids
        else {}
    )
    goals = {goal.id: goal for goal in db_session.exec(select(Goal).where(Goal.id.in_({run.goal_id for run in runs.values()}))).all()} if runs else {}  # type: ignore[union-attr]
    badge_ids = {goal.badge_id for goal in goals.values() if goal.badge_id}
    badge_by_id = {item.id: item for item in db_session.exec(select(LearningBadge).where(LearningBadge.id.in_(badge_ids))).all()} if badge_ids else {}  # type: ignore[union-attr]
    users = (
        {
            user.id or 0: user
            for user in db_session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore
        }
        if user_ids
        else {}
    )

    def badge_summary(run: LearningRun | None) -> dict | None:
        goal = goals.get(run.goal_id) if run else None
        badge = badge_by_id.get(goal.badge_id) if goal else None
        if not badge:
            return None
        return {
            "id": badge.id,
            "badge_uuid": badge.badge_uuid,
            "name": badge.name,
            "org_id": badge.org_id,
        }

    return [
        {
            **attempt.model_dump(),
            "page": page_by_id.get(attempt.page_id).model_dump()
            if page_by_id.get(attempt.page_id)
            else None,
            "badge": badge_summary(runs.get(attempt.run_id)),
            "goal": {"goal_uuid": goals[runs[attempt.run_id].goal_id].goal_uuid, "title": goals[runs[attempt.run_id].goal_id].title}
            if runs.get(attempt.run_id) and goals.get(runs[attempt.run_id].goal_id) else None,
            "activity": activities.get(page_by_id[attempt.page_id].activity_id).model_dump()
            if page_by_id.get(attempt.page_id) and activities.get(page_by_id[attempt.page_id].activity_id)
            else None,
            "run": runs.get(attempt.run_id).model_dump()
            if runs.get(attempt.run_id)
            else None,
            "user": {
                "id": users[attempt.user_id].id,
                "username": users[attempt.user_id].username,
                "email": users[attempt.user_id].email,
                "first_name": users[attempt.user_id].first_name,
                "last_name": users[attempt.user_id].last_name,
            }
            if attempt.user_id in users
            else None,
        }
        for attempt in attempts
    ]


async def grade_learning_response(
    request: Request,
    attempt_uuid: str,
    data: LearningResponseGrade,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    attempt = db_session.exec(
        select(LearningResponseAttempt).where(
            LearningResponseAttempt.attempt_uuid
            == access_rules._clean_uuid(attempt_uuid, "learning_attempt_")
        ).with_for_update()
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Learning response not found")
    page = db_session.get(LearningPage, attempt.page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Learning page not found")
    grading_run = db_session.get(LearningRun, attempt.run_id)
    if (attempt.result or {}).get("grading_status") == "graded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This response has already received its authoritative grade",
        )
    admin = access_rules._require_user(current_user)
    goal = db_session.get(Goal, grading_run.goal_id) if grading_run and grading_run.goal_id else None
    grading_org_id = _grading_org_id(db_session, goal, admin) if goal else None
    if grading_org_id is None:
        raise HTTPException(status_code=403, detail="You are not a reviewer on this learner's goal")

    max_score = (
        answer_validation._as_float((attempt.result or {}).get("max_score"), 0.0)
        or sum(
            grading._question_block_points(page, question)
            for question in run_navigation._question_blocks(page)
        )
        or 1.0
    )
    result = dict(attempt.result or {})
    question_results = dict(result.get("questions") or {})
    if question_results and data.question_scores:
        for question_id, question_result in question_results.items():
            if question_result.get("grading_status") != "pending":
                continue
            question_max = answer_validation._as_float(
                question_result.get("max_score"),
                answer_validation._as_float(question_result.get("points"), 0.0),
            )
            question_score = max(
                0.0,
                min(question_max, answer_validation._as_float(data.question_scores.get(question_id), 0.0)),
            )
            question_results[question_id] = {
                **question_result,
                "score": question_score,
                "is_correct": question_score >= question_max if question_max > 0 else None,
                "grading_status": "graded",
                "feedback": data.question_feedback.get(question_id, "").strip(),
            }
        score = sum(answer_validation._as_float(item.get("score"), 0.0) for item in question_results.values())
    else:
        score = max(0.0, min(max_score, float(data.score)))
    now = datetime.utcnow()
    attempt.score = score
    attempt.graded_at = now
    attempt.is_correct = score >= max_score if max_score > 0 else None
    attempt.feedback_key = (
        "correct"
        if attempt.is_correct
        else "incorrect"
        if attempt.is_correct is False
        else "graded"
    )
    attempt.result = {
        **result,
        **({"questions": question_results} if question_results else {}),
        "grading_status": "graded",
        "score": score,
        "max_score": max_score,
        "feedback": data.feedback or "",
        "graded_by_user_id": admin.id,
        "graded_by_org_id": grading_org_id,
        "graded_by": {
            "user_id": admin.id,
            "staff_name": " ".join(filter(None, [admin.first_name, admin.last_name])) or admin.username,
            "org_id": grading_org_id,
            "org_name": (access_rules._get_org(db_session, grading_org_id).name if grading_org_id else None),
        },
        "graded_at": now.isoformat(),
    }
    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

    run = db_session.get(LearningRun, attempt.run_id)
    activity = db_session.get(LearningActivity, page.activity_id)
    if run and activity:
        required_pages = db_session.exec(
            select(LearningPage).where(
                LearningPage.activity_id == page.activity_id,
                LearningPage.required == True,
            )
        ).all()
        completed_page_ids = {
            item.page_id
            for item in db_session.exec(
                select(LearningPageProgress).where(
                    LearningPageProgress.run_id == run.id,
                    LearningPageProgress.complete == True,
                )
            ).all()
        }
        if required_pages and all(
            (required_page.id or 0) in completed_page_ids
            for required_page in required_pages
        ):
            can_complete, completion_result = grading._activity_meets_completion_rules(
                db_session, run, activity
            )
            run.data = {
                **(run.data or {}),
                "completion_result": completion_result,
                "last_checked_at": now.isoformat(),
            }
            if can_complete:
                run.status = LearningRunStatus.COMPLETED
                run.completed_at = now
            else:
                run.status = LearningRunStatus.IN_PROGRESS
                run.completed_at = None
            db_session.add(run)
            db_session.commit()
            db_session.refresh(run)
        from src.services.goals.completion import on_run_changed
        on_run_changed(db_session, run)
    # Later commits (activity run and goal step updates) expire the attempt instance
    db_session.refresh(attempt)
    return attempt.model_dump()

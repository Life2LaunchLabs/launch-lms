"""Reviewing and grading learner responses."""

from datetime import datetime
from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from src.db.learning import (
    BadgeIssuerLearnerLink,
    LearningActivity,
    LearningBadge,
    LearningPage,
    LearningPageProgress,
    LearningResponseAttempt,
    LearningResponseGrade,
    LearningRun,
    LearningRunStatus,
)
from src.db.planning import Plan
from src.db.programs import ProgramAssignment
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.security.superadmin import is_user_superadmin
from src.services.learning import access_rules, answer_validation, enrollment, grading, lookups, run_navigation, runtime


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
    # Progress is learner-owned. Every active cooperating organization sees the
    # same attempts, irrespective of the route or program that started the run.
    statement = (
        select(LearningResponseAttempt)
        .join(LearningPage, LearningResponseAttempt.page_id == LearningPage.id)  # type: ignore
        .join(LearningRun, LearningResponseAttempt.run_id == LearningRun.id)  # type: ignore
        .order_by(LearningResponseAttempt.submitted_at.desc())  # type: ignore
    )
    if badge_uuid:
        badge = enrollment._get_badge(db_session, badge_uuid)
        statement = statement.where(LearningPage.badge_id == badge.id)
    if activity_uuid:
        activity = lookups._get_activity(db_session, activity_uuid)
        statement = statement.where(LearningPage.activity_id == activity.id)
    if page_uuid:
        statement = statement.where(
            LearningPage.page_uuid == access_rules._clean_uuid(page_uuid, "learning_page_")
        )

    attempts = db_session.exec(statement).all()
    run_ids_for_access = {attempt.run_id for attempt in attempts}
    access_runs = {
        item.id or 0: item
        for item in db_session.exec(
            select(LearningRun).where(LearningRun.id.in_(run_ids_for_access))  # type: ignore
        ).all()
    } if run_ids_for_access else {}
    attempts = [
        attempt for attempt in attempts
        if org_id in runtime._cooperating_org_ids_for_run(db_session, access_runs.get(attempt.run_id))
    ]
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
    badge_ids = {page.badge_id for page in page_by_id.values()}
    badge_by_id = (
        {
            item.id or 0: item
            for item in db_session.exec(
                select(LearningBadge).where(LearningBadge.id.in_(badge_ids))
            ).all()  # type: ignore
        }
        if badge_ids
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
    users = (
        {
            user.id or 0: user
            for user in db_session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore
        }
        if user_ids
        else {}
    )

    def badge_summary(page: LearningPage | None) -> dict | None:
        badge = badge_by_id.get(page.badge_id) if page else None
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
            "badge": badge_summary(page_by_id.get(attempt.page_id)),
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
    assignment = (
        db_session.get(ProgramAssignment, grading_run.program_assignment_id)
        if grading_run and grading_run.program_assignment_id
        else None
    )
    issuer_link = (
        db_session.get(BadgeIssuerLearnerLink, grading_run.issuer_learner_link_id)
        if grading_run and grading_run.issuer_learner_link_id
        else None
    )
    user = access_rules._require_user(current_user)
    grading_org_id = None
    plan_context = db_session.get(Plan, grading_run.plan_id) if grading_run and grading_run.plan_id else None
    if plan_context:
        from src.services.planning import capabilities_for

        if "review_badge_submissions" in capabilities_for(db_session, plan_context, user.id) or is_user_superadmin(user.id, db_session):
            admin = user
            grading_org_id = plan_context.source_org_id or grading_run.org_id
        else:
            admin = None
    elif assignment and (
        user.id in (assignment.staff_user_ids or []) or is_user_superadmin(user.id, db_session)
    ):
        admin = user
        grading_org_id = assignment.org_id
    elif issuer_link and (
        user.id in (issuer_link.staff_user_ids or [])
        or is_user_superadmin(user.id, db_session)
    ):
        admin = user
        grading_org_id = issuer_link.issuer_org_id
    else:
        admin = None
        for candidate_org_id in runtime._cooperating_org_ids_for_run(db_session, grading_run):
            assigned_staff = runtime._cooperating_staff_ids_for_run(
                db_session, grading_run, candidate_org_id
            )
            if user.id in assigned_staff or is_user_superadmin(user.id, db_session):
                admin = user
                grading_org_id = candidate_org_id
                break
            membership = db_session.exec(select(UserOrganization).where(
                UserOrganization.user_id == user.id,
                UserOrganization.org_id == candidate_org_id,
                UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS),  # type: ignore
            )).first()
            if membership:
                admin = user
                grading_org_id = candidate_org_id
                break
    if admin is None:
        raise HTTPException(status_code=403, detail="You are not assigned to grade this learner's badge")

    max_score = (
        answer_validation._as_float((attempt.result or {}).get("max_score"), 0.0)
        or sum(
            grading._question_block_points(page, question)
            for question in run_navigation._question_blocks(page)
        )
        or answer_validation._as_float((page.scoring or {}).get("points"), 1.0)
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
        activity_run = grading._ensure_activity_run(db_session, run, page.activity_id)
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
            activity_run.data = {
                **(activity_run.data or {}),
                "completion_result": completion_result,
                "last_checked_at": now.isoformat(),
            }
            if can_complete:
                activity_run.status = LearningRunStatus.COMPLETED
                activity_run.completed_at = now
            else:
                activity_run.status = LearningRunStatus.IN_PROGRESS
                activity_run.completed_at = None
            db_session.add(activity_run)
            db_session.commit()
            if run:
                db_session.refresh(run)
    award = grading._issue_award_if_complete(request, db_session, run) if run else None
    # Later commits (activity run updates, award issuance) expire the attempt instance
    db_session.refresh(attempt)
    return {
        **attempt.model_dump(),
        "award": award.model_dump() if award else None,
    }

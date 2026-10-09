"""Learner runtime: starting runs, completing pages, submitting responses."""

from datetime import datetime
from uuid import uuid4
from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningActivity,
    LearningBadge,
    LearningPage,
    LearningPageComplete,
    LearningPageProgress,
    LearningResponseAttempt,
    LearningResponseSubmit,
    LearningRun,
    LearningRunRead,
    LearningRunStatus,
)
from src.db.users import User
from src.services.guest_sessions import LearningActor
from src.services.learning_portfolio_actions import (
    PortfolioActionError,
    apply_portfolio_outcomes,
)
from src.services.learning_flow import continue_buttons
from src.services.learning import access_rules, enrollment, grading, learner_variables, lookups, run_navigation


async def start_or_resume_run(
    request: Request,
    badge_uuid: str,
    actor: LearningActor,
    db_session: Session,
    issuing_org_id: int | None = None,
    program_assignment_uuid: str | None = None,
    plan_objective_uuid: str | None = None,
) -> LearningRunRead:
    badge = enrollment._get_badge(db_session, badge_uuid)
    if not lookups._is_startable_badge(badge):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Badge is not available"
        )
    assignment = None
    participant = None
    plan = None
    plan_objective = None
    if plan_objective_uuid:
        plan, plan_objective = enrollment._plan_objective_context(db_session, badge, actor, plan_objective_uuid)
        if issuing_org_id is None:
            issuing_org_id = plan.source_org_id
    elif program_assignment_uuid:
        assignment, participant = enrollment._program_assignment_context(
            db_session, badge, actor, program_assignment_uuid
        )
        if issuing_org_id is None:
            issuing_org_id = assignment.org_id
    version = (
        enrollment._published_badge_version_for_major(db_session, badge, plan_objective.badge_major_version or 1)
        if plan_objective
        else enrollment._published_badge_version_for_major(
            db_session, badge, enrollment._assignment_badge_major(assignment, badge) or 1
        )
        if assignment
        else lookups._get_badge_version(db_session, badge, require_published=True)
    )
    issuer_link = None
    if not assignment and not plan_objective:
        # A learner keeps the issuer their run started with.
        existing_run = enrollment._actor_run_for_badge_major(db_session, badge, actor, enrollment._version_major(version))
        if existing_run:
            return run_navigation._serialize_run(db_session, existing_run)
    if assignment:
        if issuing_org_id != badge.org_id and not enrollment._get_approved_issuer_authorization(
            db_session, badge.id or 0, issuing_org_id or 0
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The assignment organization is not authorized to issue this badge",
            )
    else:
        if issuing_org_id is None:
            issuing_org_id = enrollment._manual_enrollment_state(db_session, badge, version, actor, None)["accepted_issuer_org_id"]
        if issuing_org_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Choose an organization to issue this badge and join it before starting",
            )
        issuer_link = enrollment._validate_issuer_selection(db_session, badge, issuing_org_id, actor.user_id)
    if issuing_org_id == badge.org_id:
        issuing_org_id = None
    path = lookups._get_path_for_badge(db_session, badge, version, create=False)
    if not path:
        raise HTTPException(status_code=409, detail="This Achievement does not have a learning path")
    activity_count = db_session.exec(
        select(func.count(LearningActivity.id)).where(LearningActivity.path_id == path.id)
    ).one()
    if not activity_count:
        raise HTTPException(status_code=409, detail="This Achievement does not have a learning path")
    existing_major_run = (
        db_session.exec(select(LearningRun).where(LearningRun.plan_objective_id == plan_objective.id)).first()
        if plan_objective
        else enrollment._actor_run_for_badge_major(db_session, badge, actor, enrollment._version_major(version))
    )
    if existing_major_run:
        return run_navigation._serialize_run(db_session, existing_major_run)
    statement = select(LearningRun).where(LearningRun.path_id == path.id)
    for owner_filter in access_rules._actor_filters(LearningRun, actor):
        statement = statement.where(owner_filter)
    run = db_session.exec(statement).first()
    if not run:
        now = access_rules._now()
        run = LearningRun(
            run_uuid=f"learning_run_{uuid4()}",
            badge_id=badge.id or 0,
            path_id=path.id or 0,
            badge_version_id=version.id,
            org_id=badge.org_id,
            issuing_org_id=issuing_org_id,
            program_assignment_id=assignment.id if assignment else None,
            program_participant_id=participant.id if participant else None,
            plan_id=plan.id if plan else None,
            plan_objective_id=plan_objective.id if plan_objective else None,
            issuer_learner_link_id=issuer_link.id if issuer_link else None,
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            creation_date=now,
            update_date=now,
        )
        db_session.add(run)
        db_session.commit()
        db_session.refresh(run)
    return run_navigation._serialize_run(db_session, run)


async def complete_page(
    request: Request,
    data: LearningPageComplete,
    actor: LearningActor,
    db_session: Session,
) -> LearningRunRead:
    run = lookups._get_run(db_session, data.run_uuid, actor)
    page = lookups._get_page(db_session, data.page_uuid)
    if page.version_id != run.badge_version_id:
        raise HTTPException(status_code=409, detail="This page belongs to a different Achievement version")
    activity = db_session.get(LearningActivity, page.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    activity_run = grading._ensure_activity_run(db_session, run, page.activity_id)
    button = (data.data or {}).get("button")
    if button is not None and str(button) not in continue_buttons(page.content):
        raise HTTPException(status_code=422, detail="This page has no such button")

    progress = db_session.exec(
        select(LearningPageProgress).where(
            LearningPageProgress.run_id == run.id,
            LearningPageProgress.page_id == page.id,
        )
    ).first()
    now = datetime.utcnow()
    if not progress:
        progress = LearningPageProgress(
            run_id=run.id or 0,
            activity_run_id=activity_run.id,
            page_id=page.id or 0,
            creation_date=str(now),
            update_date=str(now),
        )
    progress.complete = True
    progress.completed_at = now
    progress.data = data.data
    progress.update_date = str(now)
    db_session.add(progress)

    all_activity_pages = db_session.exec(
        select(LearningPage).where(LearningPage.activity_id == page.activity_id)
    ).all()
    resolved_flow = run_navigation._resolved_activity_flow(db_session, run, activity_run)
    reachable_uuids = (
        set(resolved_flow.page_uuids)
        if resolved_flow
        else {item.page_uuid for item in all_activity_pages}
    )
    page_uuid_by_id = {item.id: item.page_uuid for item in all_activity_pages}
    if resolved_flow:
        for old_progress in db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.activity_run_id == activity_run.id,
                LearningPageProgress.complete == True,
            )
        ).all():
            if page_uuid_by_id.get(old_progress.page_id) not in reachable_uuids:
                old_progress.complete = False
                old_progress.completed_at = None
                old_progress.data = {
                    **(old_progress.data or {}),
                    "invalidated_by_routing": True,
                }
                db_session.add(old_progress)
    activity_run.data = {
        **(activity_run.data or {}),
        "route": {
            "page_uuids": list(resolved_flow.page_uuids)
            if resolved_flow
            else [
                item.page_uuid
                for item in sorted(all_activity_pages, key=lambda item: item.order)
            ],
            "node_ids": list(resolved_flow.node_ids) if resolved_flow else [],
            "terminal": bool(resolved_flow.terminal) if resolved_flow else True,
            "condition_trace": list(resolved_flow.trace) if resolved_flow else [],
        },
    }
    required_pages = [
        item
        for item in all_activity_pages
        if item.required and item.page_uuid in reachable_uuids
    ]
    completed_page_ids = {
        item.page_id
        for item in db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.complete == True,
            )
        ).all()
    } | {page.id or 0}
    path_can_finish = not resolved_flow or resolved_flow.terminal
    if (
        path_can_finish
        and required_pages
        and all(
            (required_page.id or 0) in completed_page_ids
            for required_page in required_pages
        )
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
            outcomes = (activity.settings or {}).get("outcomes")
            if outcomes:
                if run.user_id is None:
                    raise HTTPException(
                        status_code=422,
                        detail="Portfolio outcomes require an authenticated learner",
                    )
                user = db_session.get(User, run.user_id)
                if not user:
                    raise HTTPException(status_code=404, detail="Learner not found")
                try:
                    receipts, bindings = apply_portfolio_outcomes(
                        db_session,
                        user,
                        activity_run.id or 0,
                        outcomes,
                        run_navigation._flow_context(db_session, run, activity_run),
                        (activity_run.data or {}).get("action_receipts") or {},
                    )
                except PortfolioActionError as exc:
                    db_session.rollback()
                    raise HTTPException(
                        status_code=422,
                        detail={
                            "action_id": exc.action_id,
                            "field": exc.field,
                            "message": exc.message,
                        },
                    ) from exc
                activity_run.data = {
                    **(activity_run.data or {}),
                    "action_receipts": receipts,
                    "bindings": bindings,
                }
            activity_run.status = LearningRunStatus.COMPLETED
            activity_run.completed_at = now
        else:
            activity_run.status = LearningRunStatus.IN_PROGRESS
            activity_run.completed_at = None
        db_session.add(activity_run)
    run.update_date = str(now)
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    grading._issue_award_if_complete(request, db_session, run)
    db_session.refresh(run)
    return run_navigation._serialize_run(db_session, run)


async def submit_response(
    request: Request,
    data: LearningResponseSubmit,
    actor: LearningActor,
    db_session: Session,
) -> LearningRunRead:
    run = lookups._get_run(db_session, data.run_uuid, actor)
    page = lookups._get_page(db_session, data.page_uuid)
    if page.version_id != run.badge_version_id:
        raise HTTPException(status_code=409, detail="This page belongs to a different Achievement version")
    if run_navigation._question_block(page) is None:
        raise HTTPException(
            status_code=422,
            detail="Responses can only be submitted for pages with a question",
        )
    is_correct, score, feedback_key, result = grading._grade_answer(page, data.answer)
    variables = learner_variables._extract_learning_variables(page, result)
    if variables:
        result = {**result, "variables": variables}
        if actor.user_id is not None:
            user = db_session.get(User, actor.user_id)
            if user:
                applied, skipped = learner_variables._apply_learning_variables_to_user(
                    db_session, user, variables, org_id=page.org_id
                )
                result = {
                    **result,
                    "variables_applied": applied,
                    "variables_skipped": skipped,
                }
    now = datetime.utcnow()
    attempt = LearningResponseAttempt(
        attempt_uuid=f"learning_attempt_{uuid4()}",
        run_id=run.id or 0,
        page_id=page.id or 0,
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        answer=data.answer,
        is_correct=is_correct,
        score=score,
        feedback_key=feedback_key,
        submitted_at=now,
        graded_at=now if (result or {}).get("grading_status") != "pending" else None,
        result=result,
    )
    db_session.add(attempt)
    db_session.commit()
    await complete_page(
        request,
        LearningPageComplete(
            run_uuid=run.run_uuid,
            page_uuid=page.page_uuid,
            data={"attempt_uuid": attempt.attempt_uuid, **({"button": data.button} if data.button else {})},
        ),
        actor,
        db_session,
    )
    db_session.refresh(run)
    return run_navigation._serialize_run(db_session, run)


def _cooperating_org_ids_for_run(
    db_session: Session, run: LearningRun | None
) -> set[int]:
    if not run:
        return set()
    badge = db_session.get(LearningBadge, run.badge_id)
    if not badge:
        return set()
    org_ids = {run.issuing_org_id if run.issuing_org_id is not None else badge.org_id}
    if run.user_id is not None:
        org_ids.update(
            link.issuer_org_id
            for link in db_session.exec(select(BadgeIssuerLearnerLink).where(
                BadgeIssuerLearnerLink.badge_id == run.badge_id,
                BadgeIssuerLearnerLink.user_id == run.user_id,
                BadgeIssuerLearnerLink.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
            )).all()
        )
        org_ids.update(
            item["org_id"]
            for item in enrollment._program_cooperating_orgs(db_session, badge, run.user_id)
        )
    return org_ids


def _cooperating_staff_ids_for_run(
    db_session: Session, run: LearningRun | None, org_id: int
) -> set[int]:
    if not run or run.user_id is None:
        return set()
    staff_ids: set[int] = set()
    links = db_session.exec(select(BadgeIssuerLearnerLink).where(
        BadgeIssuerLearnerLink.badge_id == run.badge_id,
        BadgeIssuerLearnerLink.user_id == run.user_id,
        BadgeIssuerLearnerLink.issuer_org_id == org_id,
        BadgeIssuerLearnerLink.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
    )).all()
    for link in links:
        staff_ids.update(link.staff_user_ids or [])
    badge = db_session.get(LearningBadge, run.badge_id)
    if badge:
        for item in enrollment._program_cooperating_orgs(db_session, badge, run.user_id):
            if item["org_id"] == org_id:
                staff_ids.update(item.get("staff_user_ids") or [])
    return staff_ids

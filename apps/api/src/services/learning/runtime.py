"""Learner runtime: completing pages and submitting responses in a plan step's activity run."""

from datetime import datetime
from uuid import uuid4
from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningPage,
    LearningPageComplete,
    LearningPageProgress,
    LearningResponseAttempt,
    LearningResponseSubmit,
    LearningRunRead,
    LearningRunStatus,
)
from src.db.users import PublicUser, User
from src.services.learning_portfolio_actions import (
    PortfolioActionError,
    apply_portfolio_outcomes,
)
from src.services.learning_flow import continue_buttons
from src.services.learning import grading, learner_variables, lookups, run_navigation


async def complete_page(
    request: Request,
    data: LearningPageComplete,
    current_user: PublicUser,
    db_session: Session,
) -> LearningRunRead:
    run = lookups._get_run(db_session, data.run_uuid, current_user.id)
    page = lookups._get_page(db_session, data.page_uuid)
    if page.activity_id != run.activity_id:
        raise HTTPException(status_code=409, detail="This page belongs to a different activity")
    activity = db_session.get(LearningActivity, page.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
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
    resolved_flow = run_navigation._resolved_activity_flow(db_session, run)
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
    run.data = {
        **(run.data or {}),
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
        run.data = {
            **(run.data or {}),
            "completion_result": completion_result,
            "last_checked_at": now.isoformat(),
        }
        if can_complete:
            outcomes = (activity.settings or {}).get("outcomes")
            if outcomes:
                user = db_session.get(User, run.user_id)
                if not user:
                    raise HTTPException(status_code=404, detail="Learner not found")
                try:
                    receipts, bindings = apply_portfolio_outcomes(
                        db_session,
                        user,
                        run.id or 0,
                        outcomes,
                        run_navigation._flow_context(db_session, run),
                        (run.data or {}).get("action_receipts") or {},
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
                run.data = {
                    **(run.data or {}),
                    "action_receipts": receipts,
                    "bindings": bindings,
                }
            run.status = LearningRunStatus.COMPLETED
            run.completed_at = now
        else:
            run.status = LearningRunStatus.IN_PROGRESS
            run.completed_at = None
    run.update_date = str(now)
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    from src.services.plan_activities import sync_objective_from_run
    sync_objective_from_run(db_session, run)
    db_session.refresh(run)
    return run_navigation._serialize_run(db_session, run)


async def submit_response(
    request: Request,
    data: LearningResponseSubmit,
    current_user: PublicUser,
    db_session: Session,
) -> LearningRunRead:
    run = lookups._get_run(db_session, data.run_uuid, current_user.id)
    page = lookups._get_page(db_session, data.page_uuid)
    if page.activity_id != run.activity_id:
        raise HTTPException(status_code=409, detail="This page belongs to a different activity")
    if run_navigation._question_block(page) is None:
        raise HTTPException(
            status_code=422,
            detail="Responses can only be submitted for pages with a question",
        )
    is_correct, score, feedback_key, result = grading._grade_answer(page, data.answer)
    variables = learner_variables._extract_learning_variables(page, result)
    if variables:
        result = {**result, "variables": variables}
        user = db_session.get(User, run.user_id)
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
        user_id=run.user_id,
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
        current_user,
        db_session,
    )
    db_session.refresh(run)
    return run_navigation._serialize_run(db_session, run)

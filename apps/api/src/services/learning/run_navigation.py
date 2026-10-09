"""Run context, branching navigation and run serialization."""

from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningActivityRun,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeStatus,
    LearningPage,
    LearningPageProgress,
    LearningResponseAttempt,
    LearningRun,
    LearningRunRead,
)
from src.db.portfolio import Portfolio, TimelineEntry
from src.db.users import User
from src.services.learning_flow import (
    resolve_flow,
)
from src.services.learning_page_convert import (
    find_question_block,
    find_question_blocks,
)


def _question_block(page: LearningPage) -> dict | None:
    return find_question_block(page.content)


def _question_blocks(page: LearningPage) -> list[dict]:
    return find_question_blocks(page.content)


def _flow_context(
    db_session: Session, run: LearningRun, activity_run: LearningActivityRun
) -> dict:
    from src.db.portfolio import Portfolio, ProjectItem, TimelineEntry

    pages = db_session.exec(
        select(LearningPage).where(LearningPage.activity_id == activity_run.activity_id)
    ).all()
    page_by_id = {page.id: page for page in pages}
    answers: dict = {}
    for attempt in db_session.exec(
        select(LearningResponseAttempt)
        .where(
            LearningResponseAttempt.run_id == run.id,
            LearningResponseAttempt.page_id.in_(set(page_by_id)),
        )  # type: ignore
        .order_by(LearningResponseAttempt.submitted_at.asc())  # type: ignore
    ).all():
        page = page_by_id.get(attempt.page_id)
        if page:
            answers[page.page_uuid] = {
                "answer": attempt.answer,
                "result": attempt.result,
            }
    facts = {
        "has_project": False,
        "has_timeline": False,
        "project_count": 0,
        "timeline_count": 0,
        "readiness_blockers": [],
    }
    if run.user_id:
        portfolio = db_session.exec(
            select(Portfolio).where(Portfolio.user_id == run.user_id)
        ).first()
        if portfolio:
            facts["project_count"] = len(
                db_session.exec(
                    select(ProjectItem).where(
                        ProjectItem.portfolio_id == portfolio.id,
                        ProjectItem.status != "archived",
                    )
                ).all()
            )
            facts["timeline_count"] = len(
                db_session.exec(
                    select(TimelineEntry).where(
                        TimelineEntry.portfolio_id == portfolio.id,
                        TimelineEntry.status != "archived",
                    )
                ).all()
            )
            facts["has_project"], facts["has_timeline"] = (
                facts["project_count"] > 0,
                facts["timeline_count"] > 0,
            )
    data = activity_run.data or {}
    variables = dict(data.get("variables") or {})
    if run.user_id:
        user = db_session.get(User, run.user_id)
        if user:
            variables.update(
                {
                    "user.username": user.username,
                    "user.email": user.email,
                    "user.email_verified": user.email_verified,
                    "user.first_name": user.first_name,
                    "user.last_name": user.last_name,
                    "user.bio": user.bio,
                    "user.avatar_image": user.avatar_image,
                }
            )
            details = user.details if isinstance(user.details, dict) else {}

            def add_nested(prefix: str, value) -> None:
                if isinstance(value, dict):
                    for nested_key, nested_value in value.items():
                        add_nested(f"{prefix}.{nested_key}", nested_value)
                else:
                    variables[prefix] = value

            add_nested("user.details.variables", details.get("variables") or {})
            add_nested("user.details.onboarding", details.get("onboarding") or {})
            if portfolio:
                for key in ("display_name", "headline", "short_bio", "location_label"):
                    variables[f"user.portfolio.{key}"] = getattr(portfolio, key, None)
    return {
        "answers": answers,
        "variables": variables,
        "facts": facts,
        "context": {
            "mode": data.get("mode") or "create",
            "bindings": data.get("bindings") or {},
        },
        "bindings": data.get("bindings") or {},
    }


def _resolved_activity_flow(
    db_session: Session, run: LearningRun, activity_run: LearningActivityRun
):
    activity = db_session.get(LearningActivity, activity_run.activity_id)
    definition = (activity_run.data or {}).get("definition") or {}
    flow = (
        definition.get("flow")
        if "flow" in definition
        else (activity.settings or {}).get("flow")
        if activity
        else None
    )
    return (
        resolve_flow(flow, _flow_context(db_session, run, activity_run))
        if flow
        else None
    )


def _run_navigation(db_session: Session, run: LearningRun) -> dict:
    activities = []
    for activity_run in db_session.exec(
        select(LearningActivityRun).where(LearningActivityRun.run_id == run.id)
    ).all():
        resolved = _resolved_activity_flow(db_session, run, activity_run)
        completed = {
            item.page_id
            for item in db_session.exec(
                select(LearningPageProgress).where(
                    LearningPageProgress.run_id == run.id,
                    LearningPageProgress.complete == True,
                )
            ).all()
        }
        pages = db_session.exec(
            select(LearningPage).where(
                LearningPage.activity_id == activity_run.activity_id
            )
        ).all()
        by_uuid = {page.page_uuid: page for page in pages}
        path = (
            resolved.page_uuids
            if resolved
            else [page.page_uuid for page in sorted(pages, key=lambda page: page.order)]
        )
        current = next(
            (
                uuid
                for uuid in path
                if (by_uuid.get(uuid).id if by_uuid.get(uuid) else None)
                not in completed
            ),
            None,
        )
        activities.append(
            {
                "activity_id": activity_run.activity_id,
                "path": path,
                "current_page_uuid": current,
                "terminal_reachable": bool(resolved.terminal) if resolved else True,
                "condition_trace": resolved.trace if resolved else [],
                "completed": len(
                    [
                        uuid
                        for uuid in path
                        if by_uuid.get(uuid) and by_uuid[uuid].id in completed
                    ]
                ),
                "total": len(path),
            }
        )
    return {"activities": activities}


def _block_scoring(page: LearningPage, question: dict) -> dict:
    scoring = question.get("scoring")
    return scoring if isinstance(scoring, dict) else {}


def _block_completion(page: LearningPage, question: dict) -> dict:
    completion = question.get("completion")
    return completion if isinstance(completion, dict) else {}


def _serialize_run(db_session: Session, run: LearningRun) -> LearningRunRead:
    progress = db_session.exec(
        select(LearningPage).where(
            LearningPage.badge_id == run.badge_id,
            LearningPage.version_id == run.badge_version_id,
        )
    ).all()
    progress_by_page = {
        item.page_id: item
        for item in db_session.exec(
            select(LearningPageProgress).where(LearningPageProgress.run_id == run.id)
        ).all()
    }
    attempts = db_session.exec(
        select(LearningResponseAttempt).where(LearningResponseAttempt.run_id == run.id)
    ).all()
    award = db_session.exec(
        select(LearningBadgeAward).where(LearningBadgeAward.run_id == run.id)
    ).first()
    navigation = _run_navigation(db_session, run)
    render_context = {"answers": {}, "variables": {}}
    page_by_id = {page.id: page for page in progress}
    for attempt in sorted(attempts, key=lambda item: item.submitted_at):
        attempt_page = page_by_id.get(attempt.page_id)
        if attempt_page:
            render_context["answers"][attempt_page.page_uuid] = {
                "answer": attempt.answer or {},
                "result": attempt.result or {},
            }
    if run.user_id:
        user = db_session.get(User, run.user_id)
        if user:
            render_context["variables"] = {
                "user.first_name": user.first_name or "",
                "user.last_name": user.last_name or "",
                "user.avatar_image": user.avatar_image or "",
            }
            portfolio = db_session.exec(
                select(Portfolio).where(Portfolio.user_id == user.id)
            ).first()
            if portfolio:
                render_context["variables"].update(
                    {
                        "user.portfolio.display_name": portfolio.display_name or "",
                        "user.portfolio.headline": portfolio.headline or "",
                        "user.portfolio.short_bio": portfolio.short_bio or "",
                        "user.portfolio.location_label": portfolio.location_label or "",
                    }
                )
                timelines = db_session.exec(
                    select(TimelineEntry)
                    .where(TimelineEntry.portfolio_id == portfolio.id)
                    .order_by(
                        TimelineEntry.is_current.desc(), TimelineEntry.start_date.desc()
                    )  # type: ignore
                ).all()
                render_context["variables"]["portfolio.timeline_options"] = [
                    {"value": item.timeline_uuid, "label": item.title}
                    for item in timelines
                ]
            # Dynamic option collections use the same {value,label,...} contract as
            # timeline_options, so standard question blocks can consume new domain
            # lists without adding one-off response shapes.
            started_badge_ids = {
                item.badge_id
                for item in db_session.exec(
                    select(LearningRun).where(LearningRun.user_id == user.id)
                ).all()
            }
            earned_badge_ids = {
                item.badge_id
                for item in db_session.exec(
                    select(LearningBadgeAward).where(
                        LearningBadgeAward.user_id == user.id
                    )
                ).all()
            }
            available_badges = db_session.exec(
                select(LearningBadge)
                .where(
                    LearningBadge.status == LearningBadgeStatus.PUBLISHED,
                    LearningBadge.public == True,  # type: ignore
                    LearningBadge.system_type.is_(None),  # type: ignore
                )
                .order_by(LearningBadge.creation_date.desc())  # type: ignore
            ).all()
            render_context["variables"]["learning.available_badge_options"] = [
                {
                    "value": item.badge_uuid,
                    "label": item.name,
                    "description": item.description or "",
                    "image": item.thumbnail_image or "",
                }
                for item in available_badges
                if (item.id or 0) not in started_badge_ids
                and (item.id or 0) not in earned_badge_ids
            ][:6]
    return LearningRunRead(
        id=run.id or 0,
        run_uuid=run.run_uuid,
        badge_id=run.badge_id,
        path_id=run.path_id,
        org_id=run.org_id,
        issuing_org_id=run.issuing_org_id,
        program_assignment_id=run.program_assignment_id,
        program_participant_id=run.program_participant_id,
        plan_id=run.plan_id,
        plan_objective_id=run.plan_objective_id,
        issuer_learner_link_id=run.issuer_learner_link_id,
        user_id=run.user_id,
        guest_session_id=run.guest_session_id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        page_progress=[
            {
                "page_uuid": page.page_uuid,
                "complete": bool(
                    progress_by_page.get(page.id or 0)
                    and progress_by_page[page.id or 0].complete
                ),
                "data": progress_by_page.get(page.id or 0).data
                if progress_by_page.get(page.id or 0)
                else {},
            }
            for page in progress
        ],
        attempts=[
            {
                **attempt.model_dump(),
                "page_uuid": page_by_id.get(attempt.page_id).page_uuid
                if page_by_id.get(attempt.page_id)
                else None,
            }
            for attempt in attempts
        ],
        award=award.model_dump() if award else None,
        navigation=navigation,
        render_context=render_context,
    )

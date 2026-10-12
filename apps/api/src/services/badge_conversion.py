"""Convert badge learning paths into plan templates.

Badges used to own their journey (a learning path of activities). Now a badge
is the credential, earned by finishing a plan made from one of its routes. This
converts each badge's active path, once:

- a plan template in the badge's organization with one activity objective per
  path activity (copies of the activities, so published badge versions stay
  unchanged), steps opening in order, set as the badge's recommended route;
- for every learner part-way through the path who hasn't earned the badge, their
  own badge plan from that route, offered by the issuer they started with, with
  the activities they already finished marked done.

Badges that already have routes are skipped, so running it again is safe.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from src.db.badge_routes import BadgeRoute
from src.db.learning import (
    LearningActivity,
    LearningActivityRun,
    LearningBadge,
    LearningBadgeAward,
    LearningPage,
    LearningPath,
    LearningRun,
    LearningRunStatus,
)
from src.db.planning import PlanObjective, PlanObjectiveProgress, PlanObjectiveStatus
from src.db.programs import (
    CompletionPolicy,
    EvidencePolicy,
    Objective,
    ObjectiveKind,
    Program,
    ProgramObjective,
    ProgramPhase,
)
from src.services.learning_documents.references import rewrite_page_references

logger = logging.getLogger(__name__)


def _now_string() -> str:
    return datetime.now().isoformat()


def _path_activities(db: Session, badge: LearningBadge) -> list[LearningActivity]:
    if not badge.active_version_id:
        return []
    path = db.exec(select(LearningPath).where(LearningPath.badge_id == badge.id, LearningPath.version_id == badge.active_version_id)).first()
    if not path:
        return []
    return list(db.exec(select(LearningActivity).where(LearningActivity.path_id == path.id).order_by(LearningActivity.order, LearningActivity.id)).all())


def _copy_activity(db: Session, source: LearningActivity, objective: Objective) -> LearningActivity:
    now = _now_string()
    pages = db.exec(select(LearningPage).where(LearningPage.activity_id == source.id).order_by(LearningPage.order)).all()
    replacements = {page.page_uuid: f"learning_page_{uuid4()}" for page in pages}
    copy = LearningActivity(
        activity_uuid=f"learning_activity_{uuid4()}", objective_id=objective.id, org_id=source.org_id, title=source.title,
        description=source.description or "", thumbnail_image=source.thumbnail_image or "", icon=source.icon, order=1,
        required=True, published=True, settings=rewrite_page_references(source.settings or {}, replacements),
        creation_date=now, update_date=now,
    )
    db.add(copy)
    db.flush()
    for page in pages:
        db.add(LearningPage(
            activity_id=copy.id, org_id=page.org_id, page_uuid=replacements[page.page_uuid], page_type=page.page_type,
            title=page.title, order=page.order, required=page.required,
            content=rewrite_page_references(page.content or {}, replacements), design=page.design or {},
            scoring=page.scoring or {}, completion=page.completion or {}, creation_date=now, update_date=now,
        ))
    return copy


def convert_badge(db: Session, badge: LearningBadge) -> Program | None:
    """Make the badge's active path its recommended route and move learners part-way through it onto plans."""
    from src.services.badge_routes import create_badge_plan

    if db.exec(select(BadgeRoute.id).where(BadgeRoute.badge_id == badge.id)).first() is not None:
        return None
    activities = _path_activities(db, badge)
    if not activities:
        return None
    now = _now_string()
    program = Program(
        program_uuid=f"program_{uuid4()}", slug=f"badge-{badge.badge_uuid.removeprefix('badge_')}-{uuid4().hex[:6]}",
        org_id=badge.org_id, name=badge.name, description=badge.description or "", step_order="in_order",
        creation_date=now, update_date=now,
    )
    db.add(program)
    db.flush()
    phase = ProgramPhase(phase_uuid=f"program_phase_{uuid4()}", program_id=program.id, name="Steps", position=0, creation_date=now, update_date=now)
    db.add(phase)
    db.flush()
    objective_by_activity: dict[int, Objective] = {}
    for position, activity in enumerate(activities):
        objective = Objective(
            objective_uuid=f"objective_{uuid4()}", org_id=badge.org_id, title=activity.title, description=activity.description or "",
            kind=ObjectiveKind.ACTIVITY, completion_policy=CompletionPolicy.EITHER, evidence_policy=EvidencePolicy.NONE,
            allow_learner_confirmation=True, creation_date=now, update_date=now,
        )
        db.add(objective)
        db.flush()
        db.add(ProgramObjective(program_id=program.id, phase_id=phase.id, objective_id=objective.id, position=position, creation_date=now, update_date=now))
        _copy_activity(db, activity, objective)
        objective_by_activity[int(activity.id)] = objective
    db.add(BadgeRoute(route_uuid=f"badge_route_{uuid4()}", badge_id=badge.id, program_id=program.id, recommended=True, position=0, creation_date=now, update_date=now))
    db.flush()

    earned = set(db.exec(select(LearningBadgeAward.user_id).where(LearningBadgeAward.badge_id == badge.id)).all())
    runs = db.exec(select(LearningRun).where(
        LearningRun.badge_id == badge.id, LearningRun.status == LearningRunStatus.IN_PROGRESS, LearningRun.user_id.is_not(None),  # type: ignore[union-attr]
    ).order_by(LearningRun.id.desc())).all()
    moved: set[int] = set()
    for run in runs:
        user_id = int(run.user_id)  # type: ignore[arg-type]
        if user_id in earned or user_id in moved:
            continue
        moved.add(user_id)
        plan = create_badge_plan(db, badge, program, user_id, run.issuing_org_id or badge.org_id, [])
        finished = {
            item.activity_id for item in db.exec(select(LearningActivityRun).where(
                LearningActivityRun.run_id == run.id, LearningActivityRun.status == LearningRunStatus.COMPLETED,
            )).all()
        }
        source_ids = {int(objective_by_activity[activity_id].id) for activity_id in finished if activity_id in objective_by_activity}
        for live in db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).all():
            if live.source_objective_id in source_ids:
                progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == live.id)).one()
                progress.status = PlanObjectiveStatus.COMPLETED
                progress.completed_at = datetime.utcnow()
                progress.update_date = now
                db.add(progress)
    db.commit()
    logger.info("Converted badge %s: route %s, %d learners moved onto plans", badge.badge_uuid, program.program_uuid, len(moved))
    return program


def convert_badge_paths(db: Session) -> list[str]:
    """Convert every badge whose journey still lives in a learning path. Returns the converted badge uuids."""
    converted = []
    for badge in db.exec(select(LearningBadge).where(LearningBadge.deleted_at.is_(None), LearningBadge.system_type.is_(None))).all():  # type: ignore[union-attr]
        if convert_badge(db, badge):
            converted.append(badge.badge_uuid)
    return converted


def convert_on_startup(engine) -> None:
    """Run the conversion once per boot. A Postgres advisory lock, held on its own connection, keeps parallel workers from converting the same badge twice."""
    from sqlalchemy import text

    try:
        with engine.connect() as lock:
            postgres = engine.dialect.name == "postgresql"
            if postgres and not lock.execute(text("SELECT pg_try_advisory_lock(724051)")).scalar():
                return
            try:
                with Session(engine) as db:
                    converted = convert_badge_paths(db)
                if converted:
                    logger.info("Converted %d badge learning path(s) into plan templates", len(converted))
            finally:
                if postgres:
                    lock.execute(text("SELECT pg_advisory_unlock(724051)"))
    except Exception as error:  # noqa: BLE001 - never block startup on this
        logger.warning("Badge path conversion skipped (non-fatal): %s", error)

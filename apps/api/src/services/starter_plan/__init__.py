"""The Launch Ready starter plan: every learner's first plan.

It is the learner's own plan made from a system plan template (``system_type``
"starter") in the platform's owner organization. Each step plays an activity
that builds part of the learner's portfolio. The template is kept in sync with
``starter_plan.json`` on every boot with two policies per step:

- ``seed``: created once, then left to admins (only missing variable bindings
  are restored on its seed pages).
- ``managed``: rewritten from the data on every sync; stale pages are removed.

Steps are also completed from what the learner has actually done (a timeline
entry, a project, strengths and values, a badge plan, a public portfolio), so
someone who builds their portfolio another way is never asked twice.
"""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.db.planning import DEFAULT_ROLE_DEFINITIONS, Plan, PlanObjective, PlanObjectiveStatus
from src.db.portfolio import Portfolio, PortfolioContentStatus, PortfolioVisibility, ProfileTrait, ProjectItem, TimelineEntry
from src.db.programs import CompletionPolicy, EvidencePolicy, Objective, ObjectiveKind, Program, ProgramObjective, ProgramPhase
from src.services.learning_page_convert import find_question_block

logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).with_name("starter_plan.json")
TEMPLATE_UUID = "program_starter"
PHASE_UUID = "program_phase_starter"
STARTER = "starter"


@lru_cache(maxsize=1)
def starter_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def _now() -> str:
    return datetime.now().isoformat()


def _objective_uuid(key: str) -> str:
    return f"objective_starter_{key}"


def _merge_variable_bindings(page: LearningPage, defaults: dict) -> None:
    """Restore missing variable bindings on a seeded page without overwriting admin edits."""
    content = deepcopy(page.content or {})
    block = find_question_block(content)
    if not block:
        return
    completion = block.get("completion") if isinstance(block.get("completion"), dict) else {}
    existing = completion.get("variable_bindings") if isinstance(completion.get("variable_bindings"), dict) else {}
    for section, values in defaults.items():
        target = existing.get(section) if isinstance(existing.get(section), dict) else {}
        for key, binding in values.items():
            target.setdefault(key, binding)
        existing[section] = target
    completion["variable_bindings"] = existing
    block["completion"] = completion
    page.content = content


def _sync_pages(db: Session, step: dict, activity: LearningActivity, now: str) -> None:
    seeded_pages = set(step["seed_pages"])
    desired = []
    for order, data in enumerate(step["document"]["pages"], start=1):
        desired.append(data["page_uuid"])
        page = db.exec(select(LearningPage).where(LearningPage.page_uuid == data["page_uuid"])).first()
        if page is None:
            page = LearningPage(
                page_uuid=data["page_uuid"], page_type=LearningPageType(data["page_type"]), title=data["title"],
                content=deepcopy(data["content"]), design=deepcopy(data["design"]), activity_id=int(activity.id),  # type: ignore[arg-type]
                org_id=activity.org_id, creation_date=now,
            )
        elif data["page_uuid"] in seeded_pages:
            block = find_question_block(data.get("content")) or {}
            _merge_variable_bindings(page, deepcopy((block.get("completion") or {}).get("variable_bindings") or {}))
        else:
            page.page_type = LearningPageType(data["page_type"])
            page.title, page.content = data["title"], deepcopy(data["content"])
        page.activity_id, page.org_id = int(activity.id), activity.org_id  # type: ignore[arg-type]
        page.order, page.required, page.update_date = order, data["required"], now
        db.add(page)
    if step["policy"] == "managed":
        for stale in db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all():
            if stale.page_uuid not in desired:
                db.delete(stale)


def _sync_step(db: Session, step: dict, program: Program, phase: ProgramPhase, position: int, now: str) -> None:
    meta = step["document"]["activity"]
    managed = step["policy"] == "managed"
    objective = db.exec(select(Objective).where(Objective.objective_uuid == _objective_uuid(step["key"]))).first()
    if objective is None:
        objective = Objective(
            objective_uuid=_objective_uuid(step["key"]), org_id=program.org_id, title=meta["title"], description=step["description"],
            kind=ObjectiveKind.ACTIVITY, completion_policy=CompletionPolicy.EITHER, evidence_policy=EvidencePolicy.NONE,
            allow_learner_confirmation=True, creation_date=now, update_date=now,
        )
        db.add(objective)
        db.flush()
    elif managed:
        objective.title, objective.description, objective.update_date = meta["title"], step["description"], now
        db.add(objective)
    if not db.exec(select(ProgramObjective).where(ProgramObjective.program_id == program.id, ProgramObjective.objective_id == objective.id)).first():
        db.add(ProgramObjective(program_id=program.id, phase_id=phase.id, objective_id=objective.id, position=position, creation_date=now, update_date=now))
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == meta["activity_uuid"])).first()
    if activity is None:
        activity = LearningActivity(
            activity_uuid=meta["activity_uuid"], objective_id=int(objective.id), org_id=program.org_id,  # type: ignore[arg-type]
            title=meta["title"], description=meta["description"], icon=meta["icon"], settings=deepcopy(meta["settings"]), creation_date=now,
        )
    elif managed:
        activity.title, activity.description, activity.icon = meta["title"], meta["description"], meta["icon"]
        activity.settings = deepcopy(meta["settings"])
    activity.objective_id, activity.org_id = int(objective.id), program.org_id  # type: ignore[arg-type]
    activity.thumbnail_image = activity.thumbnail_image or meta["thumbnail_image"]
    activity.update_date = now
    db.add(activity)
    db.flush()
    _sync_pages(db, step, activity, now)


def sync_starter_template(db: Session) -> Program:
    """Create or update the starter plan template to match starter_plan.json."""
    from src.services.learning.access_rules import _get_owner_org

    org = _get_owner_org(db)
    data = starter_data()
    now = _now()
    program = db.exec(select(Program).where(Program.program_uuid == TEMPLATE_UUID)).first()
    if program is None:
        program = Program(
            program_uuid=TEMPLATE_UUID, slug="launch-ready-starter", org_id=int(org.id), name=data["template"]["name"],  # type: ignore[arg-type]
            description=data["template"]["description"], role_definitions=list(DEFAULT_ROLE_DEFINITIONS), creation_date=now,
        )
    program.org_id, program.system_type, program.update_date = int(org.id), STARTER, now  # type: ignore[arg-type]
    db.add(program)
    db.flush()
    phase = db.exec(select(ProgramPhase).where(ProgramPhase.phase_uuid == PHASE_UUID)).first()
    if phase is None:
        phase = ProgramPhase(phase_uuid=PHASE_UUID, program_id=program.id, name=data["template"]["name"], position=0, creation_date=now, update_date=now)
        db.add(phase)
        db.flush()
    for position, step in enumerate(data["steps"]):
        _sync_step(db, step, program, phase, position, now)
    db.commit()
    db.refresh(program)
    return program


def sync_starter_template_on_startup(engine) -> None:
    try:
        with Session(engine) as db:
            sync_starter_template(db)
    except Exception as error:  # noqa: BLE001 - never block startup on this
        logger.warning("Starter plan template sync skipped (non-fatal): %s", error)


def starter_template(db: Session) -> Program:
    return db.exec(select(Program).where(Program.program_uuid == TEMPLATE_UUID)).first() or sync_starter_template(db)


def _done_keys(db: Session, user_id: int) -> set[str]:
    """Steps the learner has already done, by what is in their portfolio."""
    done: set[str] = set()
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if db.exec(select(Plan.id).where(Plan.subject_user_id == user_id, Plan.source_badge_id.is_not(None))).first():  # type: ignore[union-attr]
        done.add("badges")
    if not portfolio:
        return done
    if portfolio.display_name:
        done.add("welcome")
    if db.exec(select(TimelineEntry.id).where(TimelineEntry.portfolio_id == portfolio.id, TimelineEntry.status != PortfolioContentStatus.ARCHIVED)).first():
        done.add("timeline")
    if db.exec(select(ProjectItem.id).where(ProjectItem.portfolio_id == portfolio.id, ProjectItem.status != PortfolioContentStatus.ARCHIVED)).first():
        done.add("project")
    traits = set(db.exec(select(ProfileTrait.trait_type).where(ProfileTrait.portfolio_id == portfolio.id)).all())
    if {"strength", "value"} <= {getattr(item, "value", item) for item in traits}:
        done.add("traits")
    if portfolio.visibility == PortfolioVisibility.PUBLIC:
        done.add("launch")
    return done


def reconcile_starter_plan(db: Session, plan: Plan) -> None:
    """Complete the steps the learner has already done another way."""
    from src.services.planning import _progress_for

    done = _done_keys(db, int(plan.subject_user_id))  # type: ignore[arg-type]
    if not done:
        return
    uuids = {_objective_uuid(key) for key in done}
    changed = False
    for objective, source in db.exec(
        select(PlanObjective, Objective).join(Objective, Objective.id == PlanObjective.source_objective_id).where(PlanObjective.plan_id == plan.id)
    ).all():
        if source.objective_uuid not in uuids:
            continue
        progress = _progress_for(db, objective)
        if getattr(progress.status, "value", progress.status) != PlanObjectiveStatus.COMPLETED.value:
            progress.status, progress.completed_at, progress.update_date = PlanObjectiveStatus.COMPLETED, datetime.utcnow(), _now()
            db.add(progress)
            changed = True
    if changed:
        db.commit()


def ensure_starter_plan(db: Session, user_id: int) -> Plan:
    """The learner's starter plan, created (with done steps checked off) the first time it's needed."""
    from src.services.own_plans import create_own_plan, plan_from_template

    template = starter_template(db)
    plan = plan_from_template(db, template, user_id)
    if plan is None:
        plan = create_own_plan(db, template, user_id, template.org_id)
        db.commit()
        db.refresh(plan)
    reconcile_starter_plan(db, plan)
    return plan


def starter_checklist(db: Session, plan: Plan) -> dict:
    """The starter plan as the portfolio checklist: each step, whether it's done, and where it plays."""
    from src.services.planning import _progress_for

    items = []
    for objective in db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all():
        status = _progress_for(db, objective).status
        status = getattr(status, "value", status)
        if status == PlanObjectiveStatus.CANCELED.value:
            continue
        items.append({
            "key": objective.objective_uuid, "label": objective.title, "supportingText": objective.description or "",
            "href": f"/plans/{plan.slug}/objectives/{objective.objective_uuid}/activity", "complete": status == PlanObjectiveStatus.COMPLETED.value,
        })
    completed = sum(item["complete"] for item in items)
    return {
        "plan": {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name},
        "items": items, "completed": completed, "total": len(items),
        "percent": round(completed / len(items) * 100) if items else 0,
        "nextIncomplete": next((item for item in items if not item["complete"]), None),
        "complete": bool(items) and completed == len(items),
    }

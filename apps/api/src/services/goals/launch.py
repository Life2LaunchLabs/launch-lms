"""The launch flow: a new personal goal is set up by playing an ordinary activity.

Starting the flow makes a draft goal and a run of the system launch activity attached to it.
The activity's questions bind to ``goal.*`` targets (title, why, size, starting point, how
Coach helps, a template to start from), so each answer lands on the draft as its page is
submitted. Finishing the activity, or its exit, which jumps to the last page, makes the goal
active and lays down the chosen template's stages. A draft left part-way shows as "Finish
setting up" in the goals list and resumes the same run.

The activity comes from ``launch_activity.json`` through a system goal template
(``system_type`` "launch"), synced on startup the way the starter is.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalCreate, GoalOwnership, GoalSource, GoalStage, GoalStatus, GoalStep, GoalTemplate, GoalTemplateVersion, TemplateStatus
from src.db.learning import LearningActivity, LearningPage, LearningRun
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.services.goals import access, check_ins, templates
from src.services.goals.issue import build_stages

logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).with_name("launch_activity.json")
LAUNCH = "launch"
TEMPLATE_UUID = "goal_template_launch"
STAGE_KEY = "goal_stage_launch"
# The launch activity's "Start blank" button: the goal starts without a template, whatever was picked.
BLANK_BUTTON = "blk_launch_blank"
SIZES = {"weeks", "months", "year"}
STARTING_POINTS = {"idea", "started", "underway"}
TARGETS = {"goal.title", "goal.why", "goal.size", "goal.starting_point", "goal.coach_cadence", "goal.template"}
TEMPLATE_PICKS = 3


def _now() -> str:
    return datetime.now().isoformat()


def _value(item) -> str:
    return str(getattr(item, "value", item))


@lru_cache(maxsize=1)
def launch_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


# The system template and its activity -------------------------------------------------

def sync_launch_template(db: Session) -> GoalTemplate:
    """Create or update the launch template and its activity from launch_activity.json."""
    from src.services.goals.document import DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, default_roles
    from src.services.goals.starter import _sync_activity
    from src.services.learning.access_rules import _get_owner_org

    org = _get_owner_org(db)
    data = launch_data()
    now = _now()
    template = db.exec(select(GoalTemplate).where(GoalTemplate.system_type == LAUNCH)).first()
    if template is None:
        template = GoalTemplate(template_uuid=TEMPLATE_UUID, org_id=int(org.id), title=data["template"]["name"], document={}, creation_date=now)  # type: ignore[arg-type]
    template.org_id, template.system_type, template.update_date = int(org.id), LAUNCH, now  # type: ignore[arg-type]
    db.add(template)
    db.flush()
    steps = []
    for item in data["steps"]:
        meta = _sync_activity(db, template, item, now)
        steps.append({"key": f"goal_step_launch_{item['key']}", "type": "activity", "title": meta.title, "description": item["description"], "config": {"activity_uuid": meta.activity_uuid}})
    document = {
        "format": DOCUMENT_FORMAT, "format_version": DOCUMENT_FORMAT_VERSION,
        "template": {"title": data["template"]["name"], "description": data["template"]["description"], "instructions": "", "step_order": "any"},
        "roles": default_roles(), "stages": [{"key": STAGE_KEY, "title": data["template"]["name"], "steps": steps}],
    }
    templates._store(db, template, templates._validated(db, template, document))
    db.commit()
    db.refresh(template)
    return template


def sync_launch_template_on_startup(engine) -> None:
    try:
        with Session(engine) as db:
            sync_launch_template(db)
    except Exception as error:  # noqa: BLE001 - never block startup on this
        logger.warning("Launch activity sync skipped (non-fatal): %s", error)


def launch_activity(db: Session) -> LearningActivity:
    uuid = launch_data()["steps"][0]["document"]["activity"]["activity_uuid"]
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == uuid)).first()
    if activity is None:
        sync_launch_template(db)
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == uuid)).one()
    return activity


# Starting and resuming ----------------------------------------------------------------

def _own_draft(db: Session, user_id: int, goal_uuid: str) -> Goal:
    goal = access.goal_or_404(db, goal_uuid)
    if goal.owner_user_id != user_id or _value(goal.ownership) != GoalOwnership.PERSONAL.value:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


def _run(db: Session, goal: Goal, activity: LearningActivity) -> LearningRun | None:
    return db.exec(select(LearningRun).where(
        LearningRun.goal_id == goal.id, LearningRun.activity_id == activity.id, LearningRun.goal_step_id.is_(None),  # type: ignore[union-attr]
        LearningRun.user_id == goal.owner_user_id,
    )).first()


def start(db: Session, current_user: PublicUser, org_id: int | None = None, goal_uuid: str | None = None) -> dict:
    """A new draft goal and its launch run, or the run of a draft the learner left part-way."""
    from src.services.goals.goals import new_personal_goal

    activity = launch_activity(db)
    if goal_uuid:
        goal = _own_draft(db, current_user.id, goal_uuid)
        if _value(goal.status) != GoalStatus.DRAFT.value:
            raise HTTPException(status_code=409, detail="This goal is already set up")
    else:
        goal = new_personal_goal(db, current_user, GoalCreate(title="New goal", org_id=org_id), status=GoalStatus.DRAFT)
    if _run(db, goal, activity) is None:
        now = datetime.utcnow()
        db.add(LearningRun(
            run_uuid=f"learning_run_{uuid4()}", activity_id=int(activity.id), org_id=activity.org_id, issuing_org_id=goal.org_id,  # type: ignore[arg-type]
            goal_id=goal.id, user_id=current_user.id, started_at=now, creation_date=str(now), update_date=str(now),
        ))
    db.commit()
    db.refresh(goal)
    return view(db, current_user, goal.goal_uuid)


def view(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    """{goal, activity, run} for the launch player."""
    from src.services.learning import lookups, run_navigation

    goal = _own_draft(db, current_user.id, goal_uuid)
    activity = launch_activity(db)
    pages = db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()  # type: ignore[arg-type]
    run = _run(db, goal, activity)
    return {
        "goal": {"goal_uuid": goal.goal_uuid, "title": goal.title, "status": _value(goal.status)},
        "activity": lookups._serialize_activity(activity, list(pages)).model_dump(),
        "run": run_navigation._serialize_run(db, run).model_dump() if run else None,
    }


# Answers to the goal --------------------------------------------------------------------

def is_goal_target(target: str) -> bool:
    return str(target or "").startswith("goal.")


def _text(value, limit: int) -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    return " ".join(str(value or "").split())[:limit]


def apply_variables(db: Session, run: LearningRun, variables: list[dict], button: str | None = None) -> tuple[list[dict], list[dict]]:
    """Write ``goal.*`` answers onto the run's goal, when the run's learner owns that personal goal."""
    goal = db.get(Goal, run.goal_id) if run.goal_id else None
    usable = goal is not None and goal.owner_user_id == run.user_id and _value(goal.ownership) == GoalOwnership.PERSONAL.value \
        and _value(goal.status) in {GoalStatus.DRAFT.value, GoalStatus.ACTIVE.value}
    applied: list[dict] = []
    skipped: list[dict] = []
    if not usable:
        return [], [{**item, "reason": "The run isn't on a goal you own"} for item in variables]
    details = dict(goal.details or {})  # type: ignore[union-attr]
    for item in variables:
        target, value = str(item.get("target") or ""), item.get("value")
        reason = None
        if target == "goal.title":
            title = _text(value, 200)
            if title:
                goal.title = title  # type: ignore[union-attr]
            else:
                reason = "A goal needs a title"
        elif target == "goal.why":
            goal.description = str(value or "").strip()[:2000]  # type: ignore[union-attr]
        elif target == "goal.size":
            reason = None if _text(value, 20) in SIZES else "Unknown size"
            if not reason:
                details["size"] = _text(value, 20)
        elif target == "goal.starting_point":
            reason = None if _text(value, 20) in STARTING_POINTS else "Unknown starting point"
            if not reason:
                details["starting_point"] = _text(value, 20)
        elif target == "goal.coach_cadence":
            reason = None if _text(value, 20) in check_ins.CADENCE else "Unknown check-in cadence"
            if not reason:
                goal.coach_cadence = _text(value, 20)  # type: ignore[union-attr]
        elif target == "goal.template":
            uuid = _text(value, 120)
            if not uuid:
                details.pop("template_uuid", None)
            elif _template_for(db, goal, uuid) is None:  # type: ignore[arg-type]
                reason = "That template isn't available"
            else:
                details["template_uuid"] = uuid
        else:
            reason = "Unknown goal field"
        (skipped if reason else applied).append({**item, **({"reason": reason} if reason else {})})
    if button == BLANK_BUTTON:
        details.pop("template_uuid", None)
    goal.details = details  # type: ignore[union-attr]
    goal.update_date = _now()  # type: ignore[union-attr]
    db.add(goal)
    return applied, skipped


# Finishing ------------------------------------------------------------------------------

def on_run_changed(db: Session, run: LearningRun) -> None:
    """A finished launch run makes its draft goal active."""
    from src.db.learning import LearningRunStatus

    if run.goal_step_id or not run.goal_id or _value(run.status) != LearningRunStatus.COMPLETED.value:
        return
    goal = db.get(Goal, run.goal_id)
    if goal is None or _value(goal.status) != GoalStatus.DRAFT.value or run.activity_id != launch_activity(db).id:
        return
    activate(db, goal, run.user_id)


def activate(db: Session, goal: Goal, actor_user_id: int) -> None:
    """The draft goal goes live, with the chosen template's stages in place of its empty one."""
    chosen = (goal.details or {}).get("template_uuid")
    picked = _template_for(db, goal, chosen) if chosen else None
    if picked is not None:
        template, version = picked
        has_steps = {row.stage_id for row in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}
        kept = 0
        for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id).order_by(GoalStage.position)).all():  # type: ignore[arg-type]
            if stage.id in has_steps:
                kept += 1
            else:
                db.delete(stage)
        db.flush()
        build_stages(db, goal, version.document or {}, {}, first_position=kept)
        goal.source = GoalSource.TEMPLATE
        access.log(db, goal, actor_user_id, "goal.template_applied", {"template_uuid": template.template_uuid, "version": version.number})
    goal.status = GoalStatus.ACTIVE
    goal.update_date = _now()
    db.add(goal)
    access.log(db, goal, actor_user_id, "goal.launched", {})
    check_ins.due_soon(db, goal, check_ins.FIRST_CHECK_IN)
    db.commit()


# Templates a learner can start from -------------------------------------------------------

def _candidates(db: Session, goal: Goal) -> list[GoalTemplate]:
    """Published templates of the goal's organization (or the learner's organizations), not system ones."""
    if goal.org_id is not None:
        org_ids = [goal.org_id]
    else:
        org_ids = [row.org_id for row in db.exec(select(UserOrganization).where(UserOrganization.user_id == goal.owner_user_id)).all()]
    if not org_ids:
        return []
    return list(db.exec(select(GoalTemplate).where(
        GoalTemplate.org_id.in_(org_ids), GoalTemplate.system_type.is_(None),  # type: ignore[attr-defined, union-attr]
        GoalTemplate.status != TemplateStatus.ARCHIVED.value, GoalTemplate.published_version_id.is_not(None),  # type: ignore[union-attr]
    )).all())


def _template_for(db: Session, goal: Goal, template_uuid: str) -> tuple[GoalTemplate, GoalTemplateVersion] | None:
    template = next((row for row in _candidates(db, goal) if row.template_uuid == template_uuid), None)
    version = db.get(GoalTemplateVersion, template.published_version_id) if template else None
    return (template, version) if template and version else None


def _words(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2}


def learner_templates(db: Session, current_user: PublicUser, goal_uuid: str, q: str = "", limit: int = TEMPLATE_PICKS) -> dict:
    """Templates the learner can start this goal from: ranked by the search, or by the goal's own
    wording, best first. ``total`` says whether "See more" has anything to show."""
    goal = _own_draft(db, current_user.id, goal_uuid)
    rows = _candidates(db, goal)
    query = _words(q) if q.strip() else _words(f"{goal.title} {goal.description}")

    def score(row: GoalTemplate) -> int:
        return len(query & _words(f"{row.title} {row.title} {row.description}"))

    if q.strip():
        rows = [row for row in rows if score(row) or q.strip().lower() in f"{row.title} {row.description}".lower()]
    ranked = sorted(rows, key=lambda row: (-score(row), row.title.lower()))
    items = []
    for row in ranked[:max(1, min(limit, 50))]:
        version = db.get(GoalTemplateVersion, row.published_version_id)
        stages = (version.document or {}).get("stages") or [] if version else []
        items.append({
            "template_uuid": row.template_uuid, "title": row.title, "description": row.description, "thumbnail_image": row.thumbnail_image,
            "stage_count": len(stages), "step_count": sum(len(stage.get("steps") or []) for stage in stages),
        })
    return {"templates": items, "total": len(ranked)}

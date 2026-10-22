"""The Launch Ready starter: every learner's first goal, from a system template.

The template (``system_type`` "starter", in the platform's owner organization)
is an ordinary goal template document built from ``starter_plan.json`` on each
release, one stage of activity steps that build the learner's portfolio. Each
step has a policy:

- ``seed``: created once, then left alone (only missing variable bindings are
  restored on its seed pages).
- ``managed``: rewritten from the data on every sync; stale pages are removed.

Steps are also completed from what the learner has actually done (see
goals/portfolio.done_checks), so someone who builds their portfolio another
way is never asked twice.
"""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sqlmodel import Session, select

from src.db.goals import DONE_STEP_STATUSES, CompletionMethod, Goal, GoalSource, GoalStatus, GoalStep, GoalTemplate, StepStatus
from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.services.goals import completion, templates
from src.services.goals.document import DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, default_roles
from src.services.goals.issue import issue_goal
from src.services.learning_page_convert import find_question_block

logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).with_name("starter_plan.json")
STARTER = "starter"
# Kept from the legacy starter plan so migrated goals keep matching their steps.
TEMPLATE_UUID = "program_starter"
STAGE_KEY = "program_phase_starter"
STEP_PREFIX = "objective_starter_"


@lru_cache(maxsize=1)
def starter_data() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def _now() -> str:
    return datetime.now().isoformat()


def _value(item) -> str:
    return getattr(item, "value", item)


def step_key(key: str) -> str:
    return f"{STEP_PREFIX}{key}"


# The template ------------------------------------------------------------------

def _merge_variable_bindings(page: LearningPage, defaults: dict) -> None:
    """Restore missing variable bindings on a seeded page without overwriting admin edits."""
    content = deepcopy(page.content or {})
    block = find_question_block(content)
    if not block:
        return
    completion_ = block.get("completion") if isinstance(block.get("completion"), dict) else {}
    existing = completion_.get("variable_bindings") if isinstance(completion_.get("variable_bindings"), dict) else {}
    for section, values in defaults.items():
        target = existing.get(section) if isinstance(existing.get(section), dict) else {}
        for key, binding in values.items():
            target.setdefault(key, binding)
        existing[section] = target
    completion_["variable_bindings"] = existing
    block["completion"] = completion_
    page.content = content


def _sync_pages(db: Session, step: dict, activity: LearningActivity, now: str) -> None:
    seeded = set(step["seed_pages"])
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
        elif data["page_uuid"] in seeded:
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


def _sync_activity(db: Session, template: GoalTemplate, step: dict, now: str) -> LearningActivity:
    meta = step["document"]["activity"]
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == meta["activity_uuid"])).first()
    if activity is None:
        activity = LearningActivity(
            activity_uuid=meta["activity_uuid"], org_id=template.org_id, title=meta["title"], description=meta["description"],
            icon=meta["icon"], settings=deepcopy(meta["settings"]), creation_date=now,
        )
    elif step["policy"] == "managed":
        activity.title, activity.description, activity.icon = meta["title"], meta["description"], meta["icon"]
        activity.settings = deepcopy(meta["settings"])
    activity.goal_template_id, activity.org_id = template.id, template.org_id
    activity.thumbnail_image = activity.thumbnail_image or meta["thumbnail_image"]
    activity.update_date = now
    db.add(activity)
    db.flush()
    _sync_pages(db, step, activity, now)
    return activity


def _document(template: GoalTemplate, data: dict) -> dict:
    current = {step["key"]: step for stage in (template.document or {}).get("stages") or [] for step in stage.get("steps") or []}
    steps = []
    for item in data["steps"]:
        meta = item["document"]["activity"]
        key = step_key(item["key"])
        kept = current.get(key) if item["policy"] == "seed" else None
        steps.append({
            "key": key, "type": "activity", "title": kept["title"] if kept else meta["title"],
            "description": kept["description"] if kept else item["description"], "config": {"activity_uuid": meta["activity_uuid"]},
        })
    return {
        "format": DOCUMENT_FORMAT, "format_version": DOCUMENT_FORMAT_VERSION,
        "template": {"title": data["template"]["name"], "description": data["template"]["description"], "instructions": "", "step_order": "any"},
        "roles": default_roles(), "stages": [{"key": STAGE_KEY, "title": data["template"]["name"], "steps": steps}],
    }


def sync_starter_template(db: Session) -> GoalTemplate:
    """Create or update the starter template from starter_plan.json, publishing it when it changed."""
    from src.services.orgs.owner import require_owner_org

    org = require_owner_org(db)
    data = starter_data()
    now = _now()
    template = db.exec(select(GoalTemplate).where(GoalTemplate.system_type == STARTER)).first() or db.exec(
        select(GoalTemplate).where(GoalTemplate.template_uuid == TEMPLATE_UUID)
    ).first()
    if template is None:
        template = GoalTemplate(template_uuid=TEMPLATE_UUID, org_id=int(org.id), title=data["template"]["name"], document={}, creation_date=now)  # type: ignore[arg-type]
    template.org_id, template.system_type, template.update_date = int(org.id), STARTER, now  # type: ignore[arg-type]
    db.add(template)
    db.flush()
    for item in data["steps"]:
        _sync_activity(db, template, item, now)
    templates._store(db, template, templates._validated(db, template, _document(template, data)))
    db.flush()
    live = templates.published_version(db, template)
    if live is None or live.content_hash != templates.fingerprint(db, template):
        templates.publish_draft(db, template, None, "Release sync")
    db.commit()
    db.refresh(template)
    return template


def sync_starter_template_on_startup(engine) -> None:
    try:
        with Session(engine) as db:
            sync_starter_template(db)
    except Exception as error:  # noqa: BLE001 - never block startup on this
        logger.warning("Starter goal template sync skipped (non-fatal): %s", error)


def starter_template(db: Session) -> GoalTemplate:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.system_type == STARTER)).first()
    return template if template and template.published_version_id else sync_starter_template(db)


# The learner's goal ---------------------------------------------------------------

def starter_goal(db: Session, user_id: int) -> Goal | None:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.system_type == STARTER)).first()
    if not template:
        return None
    return db.exec(select(Goal).where(Goal.template_id == template.id, Goal.subject_user_id == user_id).order_by(Goal.id)).first()  # type: ignore[arg-type]


def reconcile_starter_goal(db: Session, goal: Goal) -> None:
    """Complete the steps the learner has already done another way."""
    from src.services.goals.portfolio import done_checks

    if not goal.subject_user_id or _value(goal.status) != GoalStatus.ACTIVE.value:
        return
    done = {step_key(key) for key in done_checks(db, int(goal.subject_user_id))}
    if not done:
        return
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position)).all():  # type: ignore[arg-type]
        if step.template_key in done and _value(completion.progress_view(db, step).status) not in DONE_STEP_STATUSES:
            db.refresh(goal)
            completion.set_status(db, goal, step, StepStatus.COMPLETED, actor_user_id=goal.subject_user_id, method=CompletionMethod.AUTO)


def ensure_starter_goal(db: Session, user_id: int) -> Goal:
    """The learner's starter goal, issued (with done steps checked off) the first time it's needed."""
    goal = starter_goal(db, user_id)
    if goal is None:
        template = starter_template(db)
        goal = issue_goal(
            db, template, templates.published_version(db, template), subject_user_id=user_id, owner_user_id=user_id,  # type: ignore[arg-type]
            org_id=template.org_id, source=GoalSource.STARTER, actor_user_id=user_id,
        )
        db.commit()
        db.refresh(goal)
    reconcile_starter_goal(db, goal)
    return goal


def step_href(goal_uuid: str, step: GoalStep) -> str:
    """Where a checklist step opens: an activity step plays on its own page."""
    from src.services.goals.home import route

    return f"/plans/{goal_uuid}/steps/{step.step_uuid}/activity" if step.type == "activity" else route(goal_uuid, step.step_uuid)


def redirect_path(db: Session, user_id: int) -> str:
    """The next step of the learner's starter goal (the Welcome step at first), or the goal itself."""
    checklist = starter_checklist(db, ensure_starter_goal(db, user_id))
    step = checklist["nextIncomplete"] or (checklist["items"][0] if checklist["items"] else None)
    return step["href"] if step else f"/plans/{checklist['goal']['goal_uuid']}"


def starter_checklist(db: Session, goal: Goal) -> dict:
    """The starter goal as the portfolio checklist: each step and whether it's done."""
    items = []
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position)).all():  # type: ignore[arg-type]
        status = _value(completion.progress_view(db, step).status)
        if status == StepStatus.EXCUSED.value:
            continue
        items.append({
            "key": step.step_uuid, "step_uuid": step.step_uuid, "label": step.title, "supportingText": step.description or "",
            "href": step_href(goal.goal_uuid, step), "complete": status == StepStatus.COMPLETED.value,
        })
    completed = sum(item["complete"] for item in items)
    return {
        "goal": {"goal_uuid": goal.goal_uuid, "title": goal.title},
        "items": items, "completed": completed, "total": len(items),
        "percent": round(completed / len(items) * 100) if items else 0,
        "nextIncomplete": next((item for item in items if not item["complete"]), None),
        "complete": bool(items) and completed == len(items),
    }

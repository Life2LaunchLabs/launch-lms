"""Coach's goal editing tools: typed proposals the learner reviews and saves one by one.

Goal-model replacements for ``services/hub_plan_tools``: the same functions and
operation envelope (operation_id, type, object_type, object_uuid, object_label),
with stages and typed steps instead of phases and objectives. Every proposed
step's config is checked by the step registry, so Coach can't propose a step
the goal would refuse.
"""

from __future__ import annotations

import re
from datetime import date
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.hub import HubEditObjectState, HubEditRun, HubEditRunEvent
from src.services.goals.types import TYPES

GOAL_STAGES_TOOL = "propose_goal_stages"
GOAL_STEPS_TOOL = "propose_goal_steps"
CONCLUDE_EDIT_TOOL = "propose_edit_conclusion"
STEP_CHANGES_TOOL = "propose_step_changes"
STAGE_CHANGES_TOOL = "propose_stage_changes"
GOAL_DETAILS_TOOL = "propose_goal_details"
# Steps Coach may write. Activity, badge and portfolio steps point at things Coach can't create.
COACH_STEP_TYPES = tuple(key for key in ("task", "write", "upload", "event", "decision", "routine", "explore") if key in TYPES)
# Runs begun before the goal cutover carry the plan scope names.
SCOPE_ALIASES = {"new_plan": "new_goal", "plan": "goal"}
MAX_STAGES, MAX_STEPS = 4, 5
MAX_CHANGES = 6
# Operations that change rows the goal already has. Each item is reviewed on its own row.
CHANGE_OPERATIONS = {"change_goal_steps", "change_goal_stages", "set_goal_details"}


def scope(kind: str | None) -> str | None:
    return SCOPE_ALIASES.get(kind or "", kind)


def _schema(properties: dict) -> dict:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


_STRING = {"type": "string"}
_DATE = {"type": "string", "description": "YYYY-MM-DD, or an empty string."}
_SETTINGS = _schema({
    "prompt": {"type": "string", "description": "write: the prompt. decision and explore: the question. Empty otherwise."},
    "max_words": {"type": "integer", "description": "write: a word limit, or 0 for none."},
    "list_label": {"type": "string", "description": "task: what the learner lists (e.g. 'Schools I contacted'); empty for a plain tick."},
    "list_target": {"type": "integer", "description": "task: how many list items finish it, or 0."},
    "slot_labels": {"type": "array", "items": _STRING, "description": "upload: one label per file to hand in."},
    "options": {"type": "array", "items": _STRING, "description": "decision: the options to choose from."},
    "multiple": {"type": "boolean", "description": "decision: more than one option can be chosen."},
    "event_date": _DATE,
    "place": {"type": "string", "description": "event: where it happens; empty otherwise."},
    "per_week": {"type": "integer", "description": "routine: how many times a week, or 0 otherwise."},
    "follow_up_days": {"type": "integer", "description": "routine: days after each one to follow up (applications, messages), or 0 for none."},
})


def goal_edit_tools(provider: str, scope_kind: str | None) -> list[dict]:
    kind = scope(scope_kind)
    if kind not in {"new_goal", "goal"}:
        return []
    definitions = []
    # Coach never writes a new goal: starting one is the learner's own decision. Runs begun before
    # that rule (scope new_goal) can only be concluded.
    if kind == "goal":
        definitions.append((
            GOAL_STAGES_TOOL,
            f"Prepare one to {MAX_STAGES} new stages, shown as suggested lines on the goal page. Nothing is saved; the learner adds or drops each stage.",
            _schema({"stages": {"type": "array", "minItems": 1, "maxItems": MAX_STAGES, "items": _schema({
                "title": {"type": "string", "description": "A concise stage name."},
                "description": {"type": "string", "description": "Useful context; empty when none is needed."},
                "timing": {"type": "string", "description": "Rough timing in plain words ('this fall', 'two weeks'); empty when unknown."},
            })}}),
        ))
        definitions.append((
            GOAL_STEPS_TOOL,
            f"Prepare one to {MAX_STEPS} new typed steps, shown as suggested lines on the goal page. Nothing is saved; the learner adds or drops each step. "
            "Pick the type that fits: task (do it, optionally list items), write (a written answer), upload (hand in files), "
            "event (go somewhere on a date), decision (choose between options), routine (something done a number of times every week), explore (a question answered by collecting resources, links and notes). Build on the answers and results in the page context.",
            _schema({"steps": {"type": "array", "minItems": 1, "maxItems": MAX_STEPS, "items": _schema({
                "type": {"type": "string", "enum": list(COACH_STEP_TYPES)},
                "title": {"type": "string", "description": "A concise, action-oriented step."},
                "description": {"type": "string", "description": "Useful detail; empty when none is needed."},
                "stage_title": {"type": "string", "description": "The exact saved stage title it belongs in (see the goal outline); empty for none."},
                "due_date": _DATE,
                "settings": _SETTINGS,
                "resource_uuid": {"type": "string", "description": "The id of one catalog entry shown to you that the learner should use; empty when none fits. Never a URL."},
            })}}),
        ))
        unchanged = "Empty to leave it as it is."
        definitions.append((
            STEP_CHANGES_TOOL,
            f"Suggest changes to up to {MAX_CHANGES} steps the goal already has, by their ids in the goal outline. "
            "Each change shows on its row; nothing is saved until the learner keeps it. Rename, rewrite the notes, "
            "move to another saved stage, or remove a step. Never remove a step the learner has started without saying why.",
            _schema({"changes": {"type": "array", "minItems": 1, "maxItems": MAX_CHANGES, "items": _schema({
                "step_id": {"type": "string", "description": "The step's id from the goal outline."},
                "title": {"type": "string", "description": f"A new title. {unchanged}"},
                "description": {"type": "string", "description": f"New notes for the step. {unchanged}"},
                "stage_id": {"type": "string", "description": f"The id of the saved stage to move it to. {unchanged}"},
                "remove": {"type": "boolean", "description": "True to suggest removing the step; the other fields are then ignored."},
                "reason": {"type": "string", "description": "A few words on why, shown to the learner."},
            })}}),
        ))
        definitions.append((
            STAGE_CHANGES_TOOL,
            f"Suggest changes to up to {MAX_CHANGES} saved stages, by their ids in the goal outline: rename, set the milestone "
            "(what reaching the end of the stage looks like), set the rough timing, or remove an empty stage. Nothing is saved until the learner keeps it.",
            _schema({"changes": {"type": "array", "minItems": 1, "maxItems": MAX_CHANGES, "items": _schema({
                "stage_id": {"type": "string", "description": "The stage's id from the goal outline."},
                "title": {"type": "string", "description": f"A new name. {unchanged}"},
                "milestone": {"type": "string", "description": f"A milestone line. {unchanged}"},
                "timing": {"type": "string", "description": f"Rough timing in plain words. {unchanged}"},
                "remove": {"type": "boolean", "description": "True to suggest removing the stage; only stages with no steps can go."},
                "reason": {"type": "string", "description": "A few words on why, shown to the learner."},
            })}}),
        ))
        definitions.append((
            GOAL_DETAILS_TOOL,
            "Suggest a clearer title or a better 'why this matters' for the goal. Nothing is saved until the learner keeps it. "
            "The goal is the learner's own: suggest wording that keeps their meaning.",
            _schema({
                "title": {"type": "string", "description": f"A new title. {unchanged}"},
                "description": {"type": "string", "description": f"Why this goal matters, in the learner's voice. {unchanged}"},
                "reason": {"type": "string", "description": "A few words on why, shown to the learner."},
            }),
        ))
    definitions.append((
        CONCLUDE_EDIT_TOOL,
        "Offer to finish the active editing goal only when the requested work is done or the learner asks to stop. "
        "This shows a confirmation and does not end the run by itself.",
        _schema({"summary": {"type": "string", "description": "A brief statement of what the editing session accomplished."}}),
    ))
    if provider == "anthropic":
        return [{"name": name, "description": description, "input_schema": schema} for name, description, schema in definitions]
    return [{"type": "function", "name": name, "description": description, "parameters": schema, "strict": True} for name, description, schema in definitions]


def _date_or_none(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        date.fromisoformat(text)
    except ValueError:
        return None
    return text


def _slug(text: str, index: int) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:40] or f"item_{index + 1}"


def step_config(kind: str, title: str, settings: dict) -> dict:
    """The typed config a Coach step's flat settings describe, checked by the registry."""
    from src.services.goals.types import step_type

    prompt = str(settings.get("prompt") or "").strip()
    if kind == "task":
        target = max(0, min(100, int(settings.get("list_target") or 0)))
        label = str(settings.get("list_label") or "").strip()
        config: dict = {"list": {"label": label[:200], "target": target}} if label or target else {}
    elif kind == "write":
        config = {"prompt": prompt, **({"max_words": int(settings["max_words"])} if int(settings.get("max_words") or 0) > 0 else {})}
    elif kind == "upload":
        labels = [str(label).strip()[:200] for label in settings.get("slot_labels") or [] if str(label).strip()] or [title[:200]]
        config = {"slots": [{"key": f"{_slug(label, index)}_{index + 1}", "label": label} for index, label in enumerate(labels[:20])]}
    elif kind == "event":
        config = {"place": str(settings.get("place") or "").strip()[:300], **({"date": settings["event_date"]} if _date_or_none(settings.get("event_date")) else {})}
    elif kind == "decision":
        options = [str(option).strip()[:300] for option in settings.get("options") or [] if str(option).strip()]
        config = {"question": prompt[:1000], "options": [{"key": f"option_{index + 1}", "label": label} for index, label in enumerate(options[:30])],
                  "multiple": bool(settings.get("multiple"))}
    elif kind == "explore":
        config = {"question": (prompt or title)[:1000]}
    elif kind == "routine":
        follow_up_days = max(0, min(90, int(settings.get("follow_up_days") or 0)))
        config = {"target": max(1, min(50, int(settings.get("per_week") or 3))), **({"follow_up": {"after_days": follow_up_days}} if follow_up_days else {})}
    else:
        config = {}
    return step_type(kind).validate_config(config)


def _operation(kind: str, object_type: str, label: str, **extra) -> dict:
    return {"operation_id": f"hub_goal_operation_{uuid4().hex}", "type": kind, "object_type": object_type, "object_uuid": None, "object_label": label, **extra}


def _plural(count: int, noun: str) -> str:
    return f"{count} proposed {noun}{'s' if count != 1 else ''}"


def _parse_steps(arguments: dict) -> list[dict]:
    steps = []
    for raw in (arguments.get("steps") or [])[:MAX_STEPS]:
        kind = str(raw.get("type") or "").strip()
        title = str(raw.get("title") or "").strip()
        description = str(raw.get("description") or "").strip()
        due_date = _date_or_none(raw.get("due_date"))
        if kind not in COACH_STEP_TYPES or not title or len(title) > 240 or len(description) > 2_000 or due_date is None:
            continue
        try:
            config = step_config(kind, title, raw.get("settings") or {})
        except (HTTPException, TypeError, ValueError):
            continue
        steps.append({
            "local_id": f"hub_step_{uuid4().hex}", "type": kind, "title": title, "description": description, "config": config,
            "due_date": due_date, "stage_title": str(raw.get("stage_title") or "").strip()[:200],
            "resource_uuid": str(raw.get("resource_uuid") or "").strip()[:64],
        })
    return steps


def parse_goal_tool_call(name: str, arguments: dict) -> dict | None:
    if name == GOAL_STAGES_TOOL:
        stages = []
        for raw in (arguments.get("stages") or [])[:MAX_STAGES]:
            title, description = str(raw.get("title") or "").strip(), str(raw.get("description") or "").strip()
            if title and len(title) <= 200 and len(description) <= 2_000:
                stages.append({"local_id": f"hub_stage_{uuid4().hex}", "title": title, "description": description, "timing": str(raw.get("timing") or "").strip()[:120]})
        return _operation("add_goal_stages", "stage", _plural(len(stages), "stage"), stages=stages) if stages else None
    if name == GOAL_STEPS_TOOL:
        steps = _parse_steps(arguments)
        return _operation("add_goal_steps", "step", _plural(len(steps), "step"), steps=steps) if steps else None
    if name == STEP_CHANGES_TOOL:
        changes = []
        for raw in (arguments.get("changes") or [])[:MAX_CHANGES]:
            step_id, title, description = (str(raw.get(key) or "").strip() for key in ("step_id", "title", "description"))
            stage_id, remove = str(raw.get("stage_id") or "").strip(), bool(raw.get("remove"))
            if not step_id or len(title) > 240 or len(description) > 2_000 or not (remove or title or description or stage_id):
                continue
            changes.append({"local_id": f"hub_change_{uuid4().hex}", "step_uuid": step_id[:120], "remove": remove, "reason": str(raw.get("reason") or "").strip()[:200],
                            **({} if remove else {key: value for key, value in (("title", title), ("description", description), ("stage_uuid", stage_id[:120])) if value})})
        return _operation("change_goal_steps", "step", _plural(len(changes), "step change"), changes=changes) if changes else None
    if name == STAGE_CHANGES_TOOL:
        changes = []
        for raw in (arguments.get("changes") or [])[:MAX_CHANGES]:
            stage_id, title, milestone, timing = (str(raw.get(key) or "").strip() for key in ("stage_id", "title", "milestone", "timing"))
            remove = bool(raw.get("remove"))
            if not stage_id or len(title) > 200 or len(milestone) > 200 or len(timing) > 120 or not (remove or title or milestone or timing):
                continue
            changes.append({"local_id": f"hub_change_{uuid4().hex}", "stage_uuid": stage_id[:120], "remove": remove, "reason": str(raw.get("reason") or "").strip()[:200],
                            **({} if remove else {key: value for key, value in (("title", title), ("milestone", milestone), ("timing", timing)) if value})})
        return _operation("change_goal_stages", "stage", _plural(len(changes), "stage change"), changes=changes) if changes else None
    if name == GOAL_DETAILS_TOOL:
        title, description = str(arguments.get("title") or "").strip(), str(arguments.get("description") or "").strip()
        if not (title or description) or len(title) > 200 or len(description) > 2_000:
            return None
        change = {"local_id": f"hub_change_{uuid4().hex}", "reason": str(arguments.get("reason") or "").strip()[:200],
                  **{key: value for key, value in (("title", title), ("description", description)) if value}}
        return _operation("set_goal_details", "goal", "Goal details", changes=[change])
    if name == CONCLUDE_EDIT_TOOL:
        summary = str(arguments.get("summary") or "").strip()
        if not summary or len(summary) > 500:
            return None
        return _operation("propose_edit_conclusion", "run", "Editing goal", summary=summary)
    return None


def attach_catalog_resources(operations: tuple[dict, ...] | list[dict], resources: list[dict] | None) -> list[dict]:
    """Turn a model-chosen resource id into a material on the step, built from the catalog entry the server holds.

    Only entries Coach was shown, with an http(s) address, can be attached; the model never supplies a link.
    """
    shown = {str(item.get("resource_uuid")): item for item in resources or []}
    result: list[dict] = []
    for operation in operations:
        if operation.get("type") != "add_goal_steps":
            result.append(operation)
            continue
        steps = []
        for step in operation.get("steps") or []:
            step = dict(step)
            resource = shown.get(str(step.pop("resource_uuid", "") or ""))
            url = str((resource or {}).get("external_url") or "")
            materials = list(step.get("materials") or [])
            if resource and step.get("type") == "explore":
                # An Explore step shows it as a suggested piece of evidence.
                suggestion = {"resource_uuid": resource["resource_uuid"], "title": str(resource.get("title") or "Resource")[:300]}
                step["config"] = {**(step.get("config") or {}), "suggestions": [suggestion]}
            elif resource and url.startswith(("https://", "http://")):
                materials.append({"kind": "resource", "resource_uuid": resource["resource_uuid"], "title": str(resource.get("title") or "Resource")[:200], "url": url})
            steps.append({**step, "materials": materials})
        result.append({**operation, "steps": steps})
    return result


_EVENTS = {
    "add_goal_stages": ("stages.proposed", "stage"),
    "add_goal_steps": ("steps.proposed", "step"),
    "propose_edit_conclusion": ("run.conclusion_proposed", "run"),
    "change_goal_steps": ("step_changes.proposed", "step"),
    "change_goal_stages": ("stage_changes.proposed", "stage"),
    "set_goal_details": ("goal_details.proposed", "goal"),
}


def _event_summary(operation: dict) -> str:
    kind = operation["type"]
    if kind in {"add_goal_stages", "add_goal_steps"}:
        noun = "stage" if kind == "add_goal_stages" else "step"
        count = len(operation.get(f"{noun}s") or [])
        return f"Prepared {count} {noun}{'s' if count != 1 else ''}"
    if kind in CHANGE_OPERATIONS:
        count = len(operation.get("changes") or [])
        noun = {"change_goal_steps": "step", "change_goal_stages": "stage", "set_goal_details": "goal detail"}[kind]
        return f"Suggested {count} {noun} change{'s' if count != 1 else ''}" if kind != "set_goal_details" else "Suggested new goal details"
    return "Proposed finishing this edit"


def _ground_changes(db: Session, run: HubEditRun, operation: dict) -> dict | None:
    """Keep only changes to rows this run's goal has, each with what it changes from, so the row can show both."""
    from src.db.goals import Goal, GoalStage, GoalStep

    goal = db.exec(select(Goal).where(Goal.goal_uuid == run.target_uuid, Goal.owner_user_id == run.user_id)).first() if run.target_uuid else None
    if goal is None:
        return None
    stages = {stage.stage_uuid: stage for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}
    titles = {stage.id: stage.title for stage in stages.values()}
    changes = []
    if operation["type"] == "set_goal_details":
        change = dict(operation["changes"][0])
        current = {"title": goal.title, "description": goal.description or ""}
        for key in ("title", "description"):
            if key in change and change[key] == current[key]:
                change.pop(key)
        if "title" in change or "description" in change:
            changes.append({**change, "from": current})
    elif operation["type"] == "change_goal_stages":
        step_counts: dict[int, int] = {}
        for stage_id in db.exec(select(GoalStep.stage_id).where(GoalStep.goal_id == goal.id)).all():
            if stage_id is not None:
                step_counts[stage_id] = step_counts.get(stage_id, 0) + 1
        for raw in operation["changes"]:
            stage = stages.get(raw["stage_uuid"])
            if stage is None or (raw["remove"] and step_counts.get(stage.id)):
                continue
            current = {"title": stage.title, "milestone": stage.milestone or "", "timing": stage.timing or ""}
            change = {key: value for key, value in raw.items() if key not in current or value != current[key]}
            if change["remove"] or any(key in change for key in current):
                changes.append({**change, "from": current})
    else:
        steps = {step.step_uuid: step for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}
        for raw in operation["changes"]:
            step = steps.get(raw["step_uuid"])
            if step is None:
                continue
            current = {"title": step.title, "description": step.description or "", "stage_title": titles.get(step.stage_id, "")}
            change = {key: value for key, value in raw.items() if key not in current or value != current[key]}
            target = stages.get(change.get("stage_uuid", ""))
            if target is None or target.id == step.stage_id:
                change.pop("stage_uuid", None)
            else:
                change["stage_title"] = target.title
            if change["remove"] or any(key in change for key in ("title", "description", "stage_uuid")):
                changes.append({**change, "from": current})
    return {**operation, "changes": changes} if changes else None


def unsettled_suggestions(db: Session, run_id: int) -> dict[str, int]:
    """How many of a run's suggested stages, steps and changes still wait for the learner to add or drop."""
    settled = {key for key, status in db.exec(select(HubEditObjectState.object_key, HubEditObjectState.status).where(HubEditObjectState.run_id == run_id)).all() if status != "editing"}
    counts = {"stages": 0, "steps": 0, "changes": 0}
    for payload in db.exec(select(HubEditRunEvent.payload).where(HubEditRunEvent.run_id == run_id)).all():
        operation = (payload or {}).get("operation") or {}
        key = {"add_goal_stages": "stages", "add_goal_steps": "steps"}.get(operation.get("type"), "changes" if operation.get("type") in CHANGE_OPERATIONS else None)
        if key:
            counts[key] += sum(1 for item in operation.get(key if key != "changes" else "changes") or [] if item.get("local_id") not in settled)
    return counts


def record_goal_proposals(db: Session, run_uuid: str, operations: tuple[dict, ...] | list[dict], resources: list[dict] | None = None) -> list[dict]:
    if not operations:
        return []
    operations = attach_catalog_resources(operations, resources)
    run = db.exec(select(HubEditRun).where(HubEditRun.run_uuid == run_uuid)).first()
    if run is None or run.status != "active":
        raise HTTPException(status_code=409, detail="The editing run is no longer active")
    sequence = db.exec(select(HubEditRunEvent.sequence).where(HubEditRunEvent.run_id == run.id).order_by(HubEditRunEvent.sequence.desc())).first() or 0  # type: ignore[union-attr]
    allowed = {
        "new_goal": {"propose_edit_conclusion"},
        "goal": {"add_goal_stages", "add_goal_steps", "propose_edit_conclusion", *CHANGE_OPERATIONS},
    }.get(scope(run.scope_kind) or "", set())
    waiting = unsettled_suggestions(db, int(run.id))  # type: ignore[arg-type]
    pending_review = waiting["stages"] or waiting["steps"] or db.exec(select(HubEditObjectState.id).where(HubEditObjectState.run_id == run.id, HubEditObjectState.status == "editing")).first() is not None
    if pending_review:
        allowed -= {"add_goal_stages", "add_goal_steps"}
    elif any(operation.get("type") == "add_goal_stages" for operation in operations):
        # Steps name their stage, so they wait until every proposed stage is reviewed.
        allowed.discard("add_goal_steps")
    accepted: list[dict] = []
    for operation in operations[:3]:
        if operation.get("type") not in allowed:
            continue
        if operation["type"] in CHANGE_OPERATIONS:
            operation = _ground_changes(db, run, operation)
            if operation is None:
                continue
        sequence = int(sequence) + 1
        kind, object_type = _EVENTS[operation["type"]]
        db.add(HubEditRunEvent(
            event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id), sequence=sequence,  # type: ignore[arg-type]
            kind=kind, summary=_event_summary(operation), object_type=object_type, object_uuid=run.target_uuid,
            object_label=str(operation.get("object_label") or "New goal")[:240], payload={"operation": operation},
        ))
        accepted.append(operation)
    if accepted:
        db.commit()
    return accepted

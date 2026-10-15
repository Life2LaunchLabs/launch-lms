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

NEW_GOAL_TOOL = "propose_new_goal_details"
GOAL_STAGES_TOOL = "propose_goal_stages"
GOAL_STEPS_TOOL = "propose_goal_steps"
CONCLUDE_EDIT_TOOL = "propose_edit_conclusion"
# Steps Coach may write. Activity, badge and portfolio steps point at things Coach can't create.
COACH_STEP_TYPES = tuple(key for key in ("task", "write", "upload", "event", "decision") if key in TYPES)
# Runs begun before the goal cutover carry the plan scope names.
SCOPE_ALIASES = {"new_plan": "new_goal", "plan": "goal"}
MAX_STAGES, MAX_STEPS = 4, 5


def scope(kind: str | None) -> str | None:
    return SCOPE_ALIASES.get(kind or "", kind)


def _schema(properties: dict) -> dict:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


_STRING = {"type": "string"}
_DATE = {"type": "string", "description": "YYYY-MM-DD, or an empty string."}
_SETTINGS = _schema({
    "prompt": {"type": "string", "description": "write: the prompt. decision: the question. Empty otherwise."},
    "max_words": {"type": "integer", "description": "write: a word limit, or 0 for none."},
    "list_label": {"type": "string", "description": "task: what the learner lists (e.g. 'Schools I contacted'); empty for a plain tick."},
    "list_target": {"type": "integer", "description": "task: how many list items finish it, or 0."},
    "slot_labels": {"type": "array", "items": _STRING, "description": "upload: one label per file to hand in."},
    "options": {"type": "array", "items": _STRING, "description": "decision: the options to choose from."},
    "multiple": {"type": "boolean", "description": "decision: more than one option can be chosen."},
    "event_date": _DATE,
    "place": {"type": "string", "description": "event: where it happens; empty otherwise."},
})


def goal_edit_tools(provider: str, scope_kind: str | None) -> list[dict]:
    kind = scope(scope_kind)
    if kind not in {"new_goal", "goal"}:
        return []
    definitions = []
    if kind == "new_goal":
        definitions.append((
            NEW_GOAL_TOOL,
            "Prepare complete values for the open new-goal editor. This does not create the goal; the learner reviews "
            "the fields and saves. Call only when the conversation gives enough for a useful title. A target date is optional.",
            _schema({
                "title": {"type": "string", "description": "A concise title for what the learner is working toward."},
                "description": {"type": "string", "description": "Useful context the learner can revise; empty when none is needed."},
                "target_date": {**_DATE, "description": "Target date in YYYY-MM-DD, or empty unless the learner has a date in mind."},
            }),
        ))
    else:
        definitions.append((
            GOAL_STAGES_TOOL,
            f"Prepare one to {MAX_STAGES} stages in the open goal editor. Nothing is saved; the learner saves or cancels each stage.",
            _schema({"stages": {"type": "array", "minItems": 1, "maxItems": MAX_STAGES, "items": _schema({
                "title": {"type": "string", "description": "A concise stage name."},
                "description": {"type": "string", "description": "Useful context; empty when none is needed."},
                "timing": {"type": "string", "description": "Rough timing in plain words ('this fall', 'two weeks'); empty when unknown."},
            })}}),
        ))
        definitions.append((
            GOAL_STEPS_TOOL,
            f"Prepare one to {MAX_STEPS} typed steps in the open goal editor. Nothing is saved; the learner saves or cancels each step. "
            "Pick the type that fits: task (do it, optionally list items), write (a written answer), upload (hand in files), "
            "event (go somewhere on a date), decision (choose between options). Build on the answers and results in the page context.",
            _schema({"steps": {"type": "array", "minItems": 1, "maxItems": MAX_STEPS, "items": _schema({
                "type": {"type": "string", "enum": list(COACH_STEP_TYPES)},
                "title": {"type": "string", "description": "A concise, action-oriented step."},
                "description": {"type": "string", "description": "Useful detail; empty when none is needed."},
                "stage_title": {"type": "string", "description": "The exact saved stage title it belongs in; empty for none."},
                "due_date": _DATE,
                "settings": _SETTINGS,
                "resource_uuid": {"type": "string", "description": "The id of one catalog entry shown to you that the learner should use; empty when none fits. Never a URL."},
            })}}),
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
    if name == NEW_GOAL_TOOL:
        title = str(arguments.get("title") or "").strip()
        description = str(arguments.get("description") or "").strip()
        target_date = _date_or_none(arguments.get("target_date"))
        if not title or len(title) > 200 or len(description) > 2_000 or target_date is None:
            return None
        return _operation("set_new_goal_details", "goal", title, fields={"title": title, "description": description, "target_date": target_date})
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
            if resource and url.startswith(("https://", "http://")):
                materials.append({"kind": "resource", "resource_uuid": resource["resource_uuid"], "title": str(resource.get("title") or "Resource")[:200], "url": url})
            steps.append({**step, "materials": materials})
        result.append({**operation, "steps": steps})
    return result


_EVENTS = {
    "set_new_goal_details": ("goal.proposed", "goal"),
    "add_goal_stages": ("stages.proposed", "stage"),
    "add_goal_steps": ("steps.proposed", "step"),
    "propose_edit_conclusion": ("run.conclusion_proposed", "run"),
}


def _event_summary(operation: dict) -> str:
    kind = operation["type"]
    if kind == "set_new_goal_details":
        return "Prepared the new goal details"
    if kind in {"add_goal_stages", "add_goal_steps"}:
        noun = "stage" if kind == "add_goal_stages" else "step"
        count = len(operation.get(f"{noun}s") or [])
        return f"Prepared {count} {noun}{'s' if count != 1 else ''}"
    return "Proposed finishing this edit"


def record_goal_proposals(db: Session, run_uuid: str, operations: tuple[dict, ...] | list[dict], resources: list[dict] | None = None) -> list[dict]:
    if not operations:
        return []
    operations = attach_catalog_resources(operations, resources)
    run = db.exec(select(HubEditRun).where(HubEditRun.run_uuid == run_uuid)).first()
    if run is None or run.status != "active":
        raise HTTPException(status_code=409, detail="The editing run is no longer active")
    sequence = db.exec(select(HubEditRunEvent.sequence).where(HubEditRunEvent.run_id == run.id).order_by(HubEditRunEvent.sequence.desc())).first() or 0  # type: ignore[union-attr]
    allowed = {
        "new_goal": {"set_new_goal_details", "propose_edit_conclusion"},
        "goal": {"add_goal_stages", "add_goal_steps", "propose_edit_conclusion"},
    }.get(scope(run.scope_kind) or "", set())
    pending_review = db.exec(select(HubEditObjectState.id).where(HubEditObjectState.run_id == run.id, HubEditObjectState.status == "editing")).first() is not None
    if pending_review:
        allowed -= {"add_goal_stages", "add_goal_steps"}
    elif any(operation.get("type") == "add_goal_stages" for operation in operations):
        # Steps name their stage, so they wait until every proposed stage is reviewed.
        allowed.discard("add_goal_steps")
    accepted: list[dict] = []
    for operation in operations[:3]:
        if operation.get("type") not in allowed:
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

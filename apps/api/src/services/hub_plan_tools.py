"""Typed proposal tools for native personal-plan editing."""

from datetime import date
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.hub import HubEditObjectState, HubEditRun, HubEditRunEvent


NEW_PLAN_TOOL = "propose_new_plan_details"
PLAN_OBJECTIVES_TOOL = "propose_plan_objectives"
PLAN_PHASES_TOOL = "propose_plan_phases"
CONCLUDE_EDIT_TOOL = "propose_edit_conclusion"


def plan_edit_tools(provider: str, scope_kind: str | None) -> list[dict]:
    if scope_kind not in {"new_plan", "plan"}:
        return []
    new_plan_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "A concise name for the learner's goal."},
            "description": {"type": "string", "description": "Useful context the learner can revise; use an empty string when none is needed."},
            "due_date": {"type": "string", "description": "Target completion date in YYYY-MM-DD format."},
        },
        "required": ["name", "description", "due_date"],
        "additionalProperties": False,
    }
    new_plan_description = (
        "Prepare complete values for the open native new-plan editor. This does not save or create the plan; "
        "the learner reviews the fields and uses Save plan. Call only when the active editing goal provides "
        "enough information for a useful name and target date."
    )
    objectives_schema = {
        "type": "object",
        "properties": {
            "objectives": {
                "type": "array",
                "minItems": 1,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "A concise, action-oriented objective."},
                        "description": {"type": "string", "description": "Useful detail the learner can revise; use an empty string when none is needed."},
                        "due_date": {"type": "string", "description": "An optional target date in YYYY-MM-DD format; use an empty string when no separate date is useful."},
                        "phase_name": {"type": "string", "description": "The exact saved phase name this objective belongs in; use an empty string for the plan's default phase."},
                    },
                    "required": ["title", "description", "due_date", "phase_name"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["objectives"],
        "additionalProperties": False,
    }
    phases_schema = {
        "type": "object",
        "properties": {
            "phases": {
                "type": "array", "minItems": 1, "maxItems": 4,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "A concise stage name."},
                        "description": {"type": "string", "description": "Useful stage context; use an empty string when none is needed."},
                        "due_date": {"type": "string", "description": "An optional stage target date in YYYY-MM-DD format; use an empty string when none is useful."},
                    },
                    "required": ["name", "description", "due_date"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["phases"], "additionalProperties": False,
    }
    conclusion_schema = {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "A brief statement of what the editing goal accomplished."},
        },
        "required": ["summary"],
        "additionalProperties": False,
    }
    definitions = []
    if scope_kind == "new_plan":
        definitions.append((NEW_PLAN_TOOL, new_plan_description, new_plan_schema))
    else:
        definitions.extend([(
            PLAN_PHASES_TOOL,
            "Prepare one to four complete phases in the open native plan editor. This does not save them; "
            "the learner reviews and saves or cancels each phase independently.",
            phases_schema,
        ), (
            PLAN_OBJECTIVES_TOOL,
            "Prepare one to five complete objectives in the open native plan editor. This does not save them; "
            "the learner reviews and saves or cancels each objective independently.",
            objectives_schema,
        )])
    definitions.append((
        CONCLUDE_EDIT_TOOL,
        "Offer to finish the active editing goal only when the requested work is satisfied or the learner asks to stop. "
        "This displays a confirmation action and does not end the run by itself.",
        conclusion_schema,
    ))
    if provider == "anthropic":
        return [{"name": name, "description": description, "input_schema": schema} for name, description, schema in definitions]
    return [{"type": "function", "name": name, "description": description, "parameters": schema, "strict": True} for name, description, schema in definitions]


def parse_plan_tool_call(name: str, arguments: dict) -> dict | None:
    if name == NEW_PLAN_TOOL:
        plan_name = str(arguments.get("name") or "").strip()
        description = str(arguments.get("description") or "").strip()
        due_date = str(arguments.get("due_date") or "").strip()
        if not plan_name or len(plan_name) > 200 or len(description) > 2_000:
            return None
        try:
            date.fromisoformat(due_date)
        except ValueError:
            return None
        return {
            "operation_id": f"hub_plan_operation_{uuid4().hex}",
            "type": "set_new_plan_details",
            "object_type": "plan",
            "object_uuid": None,
            "object_label": plan_name,
            "fields": {"name": plan_name, "description": description, "due_date": due_date},
        }
    if name == PLAN_OBJECTIVES_TOOL:
        objectives = []
        for raw in (arguments.get("objectives") or [])[:5]:
            title = str(raw.get("title") or "").strip()
            description = str(raw.get("description") or "").strip()
            due_date = str(raw.get("due_date") or "").strip()
            phase_name = str(raw.get("phase_name") or "").strip()
            if not title or len(title) > 240 or len(description) > 2_000:
                continue
            if due_date:
                try:
                    date.fromisoformat(due_date)
                except ValueError:
                    continue
            objectives.append({
                "local_id": f"hub_objective_{uuid4().hex}",
                "title": title,
                "description": description,
                "due_date": due_date,
                "phase_name": phase_name[:200],
            })
        if not objectives:
            return None
        return {
            "operation_id": f"hub_plan_operation_{uuid4().hex}",
            "type": "add_plan_objectives",
            "object_type": "objective",
            "object_uuid": None,
            "object_label": f"{len(objectives)} proposed objective{'s' if len(objectives) != 1 else ''}",
            "objectives": objectives,
        }
    if name == PLAN_PHASES_TOOL:
        phases = []
        for raw in (arguments.get("phases") or [])[:4]:
            phase_name = str(raw.get("name") or "").strip()
            description = str(raw.get("description") or "").strip()
            due_date = str(raw.get("due_date") or "").strip()
            if not phase_name or len(phase_name) > 200 or len(description) > 2_000:
                continue
            if due_date:
                try:
                    date.fromisoformat(due_date)
                except ValueError:
                    continue
            phases.append({
                "local_id": f"hub_phase_{uuid4().hex}",
                "name": phase_name, "description": description, "due_date": due_date,
            })
        if not phases:
            return None
        return {
            "operation_id": f"hub_plan_operation_{uuid4().hex}",
            "type": "add_plan_phases", "object_type": "phase", "object_uuid": None,
            "object_label": f"{len(phases)} proposed phase{'s' if len(phases) != 1 else ''}",
            "phases": phases,
        }
    if name == CONCLUDE_EDIT_TOOL:
        summary = str(arguments.get("summary") or "").strip()
        if not summary or len(summary) > 500:
            return None
        return {
            "operation_id": f"hub_plan_operation_{uuid4().hex}",
            "type": "propose_edit_conclusion",
            "object_type": "run",
            "object_uuid": None,
            "object_label": "Editing goal",
            "summary": summary,
        }
    return None


def record_plan_proposals(db: Session, run_uuid: str, operations: tuple[dict, ...] | list[dict]) -> list[dict]:
    if not operations:
        return []
    run = db.exec(select(HubEditRun).where(HubEditRun.run_uuid == run_uuid)).first()
    if run is None or run.status != "active":
        raise HTTPException(status_code=409, detail="The editing run is no longer active")
    sequence = db.exec(select(HubEditRunEvent.sequence).where(
        HubEditRunEvent.run_id == run.id,
    ).order_by(HubEditRunEvent.sequence.desc())).first() or 0
    accepted: list[dict] = []
    allowed = {
        "new_plan": {"set_new_plan_details", "propose_edit_conclusion"},
        "plan": {"add_plan_phases", "add_plan_objectives", "propose_edit_conclusion"},
    }.get(run.scope_kind, set())
    pending_review = db.exec(select(HubEditObjectState.id).where(
        HubEditObjectState.run_id == run.id,
        HubEditObjectState.status == "editing",
    )).first() is not None
    if pending_review:
        allowed -= {"add_plan_phases", "add_plan_objectives"}
    elif any(operation.get("type") == "add_plan_phases" for operation in operations):
        # Dependent objectives must wait until every proposed phase has been reviewed and saved.
        allowed.discard("add_plan_objectives")
    for operation in operations[:3]:
        operation_type = operation.get("type")
        if operation_type not in allowed:
            continue
        sequence = int(sequence) + 1
        if operation_type == "set_new_plan_details":
            kind, summary, object_type = "plan.proposed", "Prepared the new plan details", "plan"
        elif operation_type == "add_plan_objectives":
            count = len(operation.get("objectives") or [])
            kind, summary, object_type = "objectives.proposed", f"Prepared {count} objective{'s' if count != 1 else ''}", "objective"
        elif operation_type == "add_plan_phases":
            count = len(operation.get("phases") or [])
            kind, summary, object_type = "phases.proposed", f"Prepared {count} phase{'s' if count != 1 else ''}", "phase"
        else:
            kind, summary, object_type = "run.conclusion_proposed", "Proposed finishing this edit", "run"
        db.add(HubEditRunEvent(
            event_uuid=f"hub_edit_event_{uuid4().hex}", run_id=int(run.id), sequence=sequence,
            kind=kind, summary=summary, object_type=object_type, object_uuid=run.target_uuid,
            object_label=str(operation.get("object_label") or "New personal plan")[:240],
            payload={"operation": operation},
        ))
        accepted.append(operation)
    if accepted:
        db.commit()
    return accepted

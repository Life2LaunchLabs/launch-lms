"""Validation reports for goal template documents, for the connector.

``document.validate_document`` stops at the first problem; the connector wants
every problem at once, each with a JSON path, plus warnings for what a save
would remove. Nothing here writes to the database.
"""

from __future__ import annotations

from copy import deepcopy

from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import Session, select

from src.db.goals import GoalTemplate
from src.db.learning import LearningActivity
from src.services.goals.document import GoalTemplateDocument, MAX_STEPS, iter_steps, validate_document
from src.services.goals.types import step_type


def path_of(loc) -> str:
    path = ""
    for part in loc:
        path += f"[{part}]" if isinstance(part, int) else (f".{part}" if path else str(part))
    return path or "document"


def _detail(error: HTTPException) -> str:
    return str(error.detail.get("message") if isinstance(error.detail, dict) else error.detail)


def _template_activity(db: Session, template: GoalTemplate | None, activity_uuid: str) -> bool:
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).first()
    return bool(activity and template and activity.goal_template_id == template.id and activity.frozen_from_id is None)


def _requirement_sets(db: Session, org_id: int) -> tuple[set[str], set[str]]:
    from src.services.requirements import mappable_nodes, parent_node_uuids

    return set(mappable_nodes(db, org_id)), parent_node_uuids(db, org_id)


def check_document(db: Session, org_id: int, raw, template: GoalTemplate | None) -> dict:
    """``{"valid", "errors", "warnings"}`` for a document, against ``template``'s draft when editing one."""
    errors: list[dict] = []
    warnings: list[dict] = []

    def report() -> dict:
        return {"valid": not errors, "errors": errors, "warnings": warnings}

    try:
        GoalTemplateDocument.model_validate(raw)
    except ValidationError as exc:
        errors.extend({"path": path_of(error["loc"]), "message": error["msg"]} for error in exc.errors())
        return report()

    document = deepcopy(raw)
    if not str(document["template"].get("title") or "").strip():
        errors.append({"path": "template.title", "message": "Give the template a title"})
    keys = [step.get("key") for _, step in iter_steps(document) if step.get("key")]
    known_keys = set(keys)
    nodes: tuple[set[str], set[str]] | None = None
    seen_stages: set[str] = set()
    seen_steps: set[str] = set()
    total = 0
    for i, stage in enumerate(document["stages"]):
        base = f"stages[{i}]"
        if stage.get("key"):
            if stage["key"] in seen_stages:
                errors.append({"path": f"{base}.key", "message": "This stage appears more than once"})
            seen_stages.add(stage["key"])
        for j, step in enumerate(stage.get("steps") or []):
            path = f"{base}.steps[{j}]"
            total += 1
            if step.get("key"):
                if step["key"] in seen_steps:
                    errors.append({"path": f"{path}.key", "message": "This step appears more than once"})
                seen_steps.add(step["key"])
            try:
                kind = step_type(step["type"])
            except HTTPException as exc:
                errors.append({"path": f"{path}.type", "message": _detail(exc)})
                continue
            config = step.get("config") or {}
            if kind.key == "activity" and not config.get("activity_uuid"):
                pass  # A new activity: saving creates it.
            elif kind.key == "activity" and not _template_activity(db, template, config["activity_uuid"]):
                errors.append({"path": f"{path}.config.activity_uuid", "message": "This activity doesn't belong to this template; omit config to add a new activity"})
            else:
                try:
                    kind.resolve(db, kind.validate_config(config), org_id)
                except HTTPException as exc:
                    errors.append({"path": f"{path}.config", "message": _detail(exc)})
            completed_by = step.get("completed_by") or "learner"
            if completed_by == "staff" and step.get("review_required"):
                errors.append({"path": f"{path}.review_required", "message": "Staff steps aren't reviewed; turn off review_required"})
            if completed_by == "staff" and not kind.learner_can_complete:
                errors.append({"path": f"{path}.completed_by", "message": f"{kind.label} steps finish on their own"})
            unknown_after = [key for key in step.get("after") or [] if key not in known_keys or key == step.get("key")]
            if unknown_after:
                errors.append({"path": f"{path}.after", "message": f"Wait only on other steps of this template: {', '.join(unknown_after)}"})
            week = step.get("due_week")
            if week is not None and (not stage.get("duration_weeks") or week > stage["duration_weeks"]):
                errors.append({"path": f"{path}.due_week", "message": "Set the stage's duration_weeks, and keep the due week within it"})
            requested = list(step.get("requirement_node_uuids") or [])
            if requested:
                nodes = nodes or _requirement_sets(db, org_id)
                unknown = [uuid for uuid in requested if uuid not in nodes[0]]
                grouping = [uuid for uuid in requested if uuid in nodes[1]]
                if unknown:
                    errors.append({"path": f"{path}.requirement_node_uuids", "message": f"Unknown requirement nodes: {', '.join(unknown)}"})
                if grouping:
                    errors.append({"path": f"{path}.requirement_node_uuids", "message": f"Only leaf requirements earn credit; these have children: {', '.join(grouping)}"})
    if total > MAX_STEPS:
        errors.append({"path": "stages", "message": f"A template can have at most {MAX_STEPS} steps"})

    if not errors:
        # Everything the step-level checks don't cover (roles, key collisions): the save's own validator.
        probe = deepcopy(document)
        for _, step in iter_steps(probe):
            if step.get("type") == "activity" and not (step.get("config") or {}).get("activity_uuid"):
                step["type"], step["config"] = "task", {}
        try:
            validate_document(db, probe, org_id, requirement_nodes=None)
        except HTTPException as exc:
            errors.append({"path": "document", "message": _detail(exc)})

    if template is not None:
        current = template.document or {}
        for stage in current.get("stages") or []:
            if stage.get("key") not in seen_stages:
                warnings.append({"path": "stages", "message": f"Removes stage \"{stage.get('title')}\""})
        for _, step in iter_steps(current):
            if step.get("key") not in seen_steps:
                warnings.append({"path": "stages", "message": f"Removes step \"{step.get('title')}\"; goals already issued keep it"})
    return report()


def reject(report: dict) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": "The document has errors; nothing was saved", **report})

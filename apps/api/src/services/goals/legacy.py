"""Converts legacy plan objectives into typed goal steps.

Pure functions with no database access, so the production dry run
(``scripts/goals_migration_report.py``) and the data migration use the
same rules. A legacy objective is either a template objective snapshot
(``custom_fields``, ``allow_learner_confirmation``) or a live
``PlanObjective`` (``fields``, ``completion_restricted``); both are read
through :func:`objective_from_template` / :func:`objective_from_plan`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

LEGACY_FIELD_TYPES = {"text", "media", "link", "checkbox", "badge"}

# Legacy progress statuses and what a goal step stores instead.
STATUS_MAP = {
    "not_started": "not_started",
    "in_progress": "in_progress",
    "submitted": "submitted",
    "ready_for_review": "submitted",
    "flagged": "changes_requested",
    "changes_requested": "changes_requested",
    "completed": "completed",
    "canceled": "excused",
}


@dataclass
class LegacyObjective:
    title: str
    kind: str = "custom"
    fields: list[dict] = field(default_factory=list)
    activity_id: int | None = None
    badge_uuid: str | None = None
    staff_only: bool = False


@dataclass
class StepSpec:
    type: str
    title: str
    config: dict = field(default_factory=dict)
    completed_by: str = "learner"
    review_required: bool = False
    # The legacy field uuids whose values this step takes over.
    source_field_uuids: list[str] = field(default_factory=list)


@dataclass
class Conversion:
    steps: list[StepSpec]
    warnings: list[str] = field(default_factory=list)

    @property
    def split(self) -> bool:
        return len(self.steps) > 1


def _field_restricted(raw: dict) -> bool:
    if "restricted" in raw:
        return bool(raw["restricted"])
    if "allow_student_upload" in raw:
        return not raw["allow_student_upload"]
    return str(raw.get("access") or "contributor") in {"reviewer", "staff"}


def _field_type(raw: dict) -> str:
    kind = str(raw.get("type") or "text")
    if kind == "media" and set(raw.get("allowed_types") or []) == {"link"}:
        return "link"
    return kind


def objective_from_template(snapshot: dict) -> LegacyObjective:
    """A template objective, as stored on Objective rows and in version and assignment snapshots."""
    fields = list(snapshot.get("custom_fields") or snapshot.get("fields") or [])
    badge_uuid = snapshot.get("badge_uuid")
    return LegacyObjective(
        title=str(snapshot.get("title") or ""),
        kind=str(snapshot.get("kind") or "custom"),
        fields=fields,
        activity_id=snapshot.get("activity_id"),
        badge_uuid=badge_uuid,
        staff_only=not bool(snapshot.get("allow_learner_confirmation", False)),
    )


def objective_from_plan(row) -> LegacyObjective:
    """A live PlanObjective row (or anything with the same attributes)."""
    return LegacyObjective(
        title=str(row.title or ""),
        kind=str(row.kind or "custom"),
        fields=list(row.fields or []),
        activity_id=row.activity_id,
        staff_only=bool(row.completion_restricted),
    )


def _who(objective: LegacyObjective, restricted_field: bool) -> tuple[str, bool]:
    """Who completes a step, and whether staff review it first.

    Staff-only fields stay staff steps. On a staff-only objective, steps the
    learner fills in become learner steps that staff review, which is what the
    learner was doing before (fill in, then staff mark it done).
    """
    if restricted_field:
        return "staff", False
    if objective.staff_only:
        return "learner", True
    return "learner", False


def convert_objective(objective: LegacyObjective, badge_id_uuid: str | None = None) -> Conversion:
    """The typed steps one legacy objective becomes, in order.

    Rules (agreed in the implementation plan):
    - An activity objective becomes one Activity step.
    - All media fields become one Upload step with a slot per field, placed
      where the first media field was.
    - text becomes Write, checkbox becomes Task, link becomes Task with a
      one-item list, badge becomes Badge.
    - An objective with no fields becomes a Task. A template objective with a
      ``badge_id`` and no badge field gets a Badge step (``badge_id_uuid``).
    - Mixed objectives split into one step per field, in field order.
    """
    warnings: list[str] = []
    steps: list[StepSpec] = []
    title = objective.title.strip() or "Untitled step"

    if objective.activity_id or objective.kind == "activity":
        if not objective.activity_id:
            warnings.append("activity objective without an activity")
        completed_by, review = _who(objective, False)
        steps.append(StepSpec("activity", title, {"activity_id": objective.activity_id}, completed_by, review))
        if objective.fields:
            warnings.append("activity objective also has fields")

    fields = [dict(raw) for raw in objective.fields]
    badge_uuid = objective.badge_uuid or badge_id_uuid
    if badge_uuid and not any(_field_type(raw) == "badge" for raw in fields):
        fields.append({"type": "badge", "title": title, "badge_uuid": badge_uuid, "restricted": False})

    upload: StepSpec | None = None
    for raw in fields:
        kind = _field_type(raw)
        field_uuid = str(raw.get("field_uuid") or "")
        field_title = str(raw.get("title") or "").strip() or title
        restricted = _field_restricted(raw)
        completed_by, review = _who(objective, restricted)
        if kind not in LEGACY_FIELD_TYPES:
            warnings.append(f"unknown field type {kind!r}, kept as Write")
            kind = "text"
        if kind == "media":
            # Plans never required their media fields, so the slots they become don't either.
            slot = {"key": field_uuid, "label": field_title, "kinds": list(raw.get("allowed_types") or ["image", "document"]), "optional": True}
            if upload is None:
                upload = StepSpec("upload", field_title, {"slots": [slot]}, completed_by, review, [field_uuid])
                steps.append(upload)
            else:
                upload.config["slots"].append(slot)
                upload.source_field_uuids.append(field_uuid)
                if upload.completed_by != completed_by:
                    warnings.append("upload slots mix staff and learner fields")
                    upload.completed_by, upload.review_required = "learner", True
            continue
        if kind == "text":
            steps.append(StepSpec("write", field_title, {"prompt": str(raw.get("description") or "")}, completed_by, review, [field_uuid]))
        elif kind == "checkbox":
            steps.append(StepSpec("task", field_title, {}, completed_by, review, [field_uuid]))
        elif kind == "link":
            steps.append(StepSpec("task", field_title, {"list": {"label": field_title, "target": 1, "item_kind": "link"}}, completed_by, review, [field_uuid]))
        elif kind == "badge":
            if not raw.get("badge_uuid"):
                warnings.append("badge field without a badge")
            steps.append(StepSpec("badge", field_title, {"badge_uuid": raw.get("badge_uuid")}, "learner", False, [field_uuid] if field_uuid else []))

    if not steps:
        # Nothing to fill in: whoever could mark the objective done ticks the task.
        steps.append(StepSpec("task", title, {}, "staff" if objective.staff_only else "learner"))

    # A single step keeps the objective's own title; split steps keep their field titles.
    if len(steps) == 1:
        steps[0].title = title
    return Conversion(steps, warnings)


def step_mix(objective: LegacyObjective) -> str:
    """A short signature of an objective's field types, for grouping counts."""
    kinds = []
    if objective.activity_id or objective.kind == "activity":
        kinds.append("activity")
    kinds.extend(sorted(_field_type(raw) for raw in objective.fields))
    if not kinds:
        return "(no fields)"
    return "+".join(kinds)


def value_shape(value) -> str:
    """How a legacy field value is stored, for checking the progress conversion."""
    if value is None or value == "" or value == [] or value == {}:
        return "empty"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, str):
        return "str"
    if isinstance(value, list):
        inner = {value_shape(item) for item in value}
        return f"list[{'|'.join(sorted(inner))}]"
    if isinstance(value, dict):
        return "dict(" + ",".join(sorted(value)[:6]) + ")"
    return type(value).__name__

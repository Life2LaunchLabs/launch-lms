"""A template's live version and its draft.

The live version (``published_version_id``) is what new assignments, badge
starts and self-starts get; a template without one is inactive. The draft is
``document`` plus ``draft`` meta: Edit starts one with a semver that has to be
higher than every version so far, saving keeps it, publishing freezes it into
a locked version (live by default) and discarding resets ``document`` to the
live version. When the live version changes, the owner's active assignments
move to it; finished plans keep the version they finished on.
"""

from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import AssignmentStatus, GoalAssignment, GoalTemplate, GoalTemplateVersion
from src.db.learning import LearningActivity
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.goals import templates, versions
from src.services.goals.document import iter_steps
from src.services.learning.activity_copy import activity_hash

SEMVER = re.compile(r"^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$")


def parse(text: str | None) -> tuple[int, int, int] | None:
    match = SEMVER.match(str(text or "").strip())
    return (int(match[1]), int(match[2]), int(match[3])) if match else None


def _fmt(parts: tuple[int, int, int]) -> str:
    return ".".join(str(part) for part in parts)


def highest(db: Session, template: GoalTemplate) -> tuple[int, int, int] | None:
    """The highest semver among the template's public versions."""
    rows = db.exec(select(GoalTemplateVersion.semver).where(
        GoalTemplateVersion.template_id == template.id, GoalTemplateVersion.private == False,  # noqa: E712
    )).all()
    found = [parsed for parsed in (parse(row) for row in rows) if parsed]
    return max(found) if found else None


def suggest(db: Session, template: GoalTemplate) -> str:
    """The next minor version: 2.1.0 after 2.0.3, 1.0.0 for a first version."""
    top = highest(db, template)
    return _fmt((top[0], top[1] + 1, 0)) if top else "1.0.0"


def checked(db: Session, template: GoalTemplate, text: str) -> str:
    """``text`` as a normalized semver higher than every version so far, else 422."""
    parsed = parse(text)
    if not parsed:
        raise HTTPException(status_code=422, detail="Use three numbers for the version, like 2.1.0")
    top = highest(db, template)
    if top and parsed <= top:
        raise HTTPException(status_code=422, detail=f"The version has to be higher than {_fmt(top)}")
    return _fmt(parsed)


def _meta(semver: str, note: str, base: GoalTemplateVersion | None, user_id: int | None) -> dict:
    return {"semver": semver, "note": note.strip(), "base_version_uuid": base.version_uuid if base else None,
            "started_at": datetime.now().isoformat(), "started_by_user_id": user_id}


def draft_meta(db: Session, template: GoalTemplate, *, unpublished: bool) -> dict | None:
    """The open draft. Templates edited before drafts were explicit have one whenever the working copy
    differs from the live version."""
    if template.draft:
        return {**template.draft, "implicit": False}
    if not unpublished or templates.release_managed(template):
        return None
    live = templates.published_version(db, template)
    return {**_meta(suggest(db, template), "", live, None), "started_at": None, "implicit": True}


def ensure_draft(db: Session, template: GoalTemplate, user_id: int | None) -> None:
    if template.draft is None:
        template.draft = _meta(suggest(db, template), "", templates.published_version(db, template), user_id)
        db.add(template)


def _editable(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> GoalTemplate:
    require_org_admin(current_user.id, org_id, db, "build_plans")
    template = templates.template_or_404(db, org_id, template_uuid)
    if templates.release_managed(template):
        raise HTTPException(status_code=409, detail="System templates are updated with each release")
    return template


def start_draft(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, semver: str, note: str = "") -> dict:
    """Start editing: the draft begins as the live version, under a new, higher version number."""
    template = _editable(db, current_user, org_id, template_uuid)
    if template.draft:
        raise HTTPException(status_code=409, detail=f"Version {template.draft.get('semver')} is already being drafted")
    template.draft = _meta(checked(db, template, semver), note, templates.published_version(db, template), current_user.id)
    template.update_date = datetime.now().isoformat()
    db.add(template)
    db.commit()
    db.refresh(template)
    return templates.template_dict(db, template)


def update_draft(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, semver: str | None = None, note: str | None = None) -> dict:
    template = _editable(db, current_user, org_id, template_uuid)
    ensure_draft(db, template, current_user.id)
    meta = dict(template.draft or {})
    if semver is not None:
        meta["semver"] = checked(db, template, semver)
    if note is not None:
        meta["note"] = note.strip()
    template.draft = meta
    db.add(template)
    db.commit()
    db.refresh(template)
    return templates.template_dict(db, template)


def discard_draft(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """Throw the draft away: the working copy goes back to the live version."""
    template = _editable(db, current_user, org_id, template_uuid)
    live = templates.published_version(db, template)
    if live is None:
        raise HTTPException(status_code=409, detail="There's no live version to go back to")
    templates._store(db, template, templates.working_copy(db, template, live.document))
    template.draft = None
    db.add(template)
    db.commit()
    db.refresh(template)
    return templates.template_dict(db, template)


def _comparable(db: Session, document: dict) -> dict:
    """The document with activity uuids swapped for their content, so a frozen copy equals its working activity."""
    result = deepcopy(document or {})
    for _, step in iter_steps(result):
        uuid = (step.get("config") or {}).get("activity_uuid")
        if step.get("type") == "activity" and uuid:
            activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == uuid)).first()
            step["config"] = {**step["config"], "activity_uuid": activity_hash(db, activity) if activity else uuid}
    return result


def summarize(stages: list[dict]) -> dict:
    steps = [step for stage in stages for step in stage["steps"]]
    return {
        "added": sum(step["change"] == "added" for step in steps),
        "changed": sum(step["change"] in ("changed", "moved") for step in steps),
        "removed": sum(step["change"] == "removed" for step in steps),
        "stages_changed": sum(stage["change"] != "same" for stage in stages),
    }


def draft_changes(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """What the draft changes against the version it started from (the live one), stage by stage."""
    templates.require_reader(db, current_user, org_id)
    template = templates.template_or_404(db, org_id, template_uuid)
    base_uuid = (template.draft or {}).get("base_version_uuid")
    base = db.exec(select(GoalTemplateVersion).where(GoalTemplateVersion.version_uuid == base_uuid)).first() if base_uuid else None
    base = base or templates.published_version(db, template)
    stages = versions.changes(_comparable(db, base.document) if base else {}, _comparable(db, template.document))
    return {"base": {"version_uuid": base.version_uuid, "semver": base.semver} if base else None,
            "stages": stages, "summary": summarize(stages)}


def _active_assignments(db: Session, template: GoalTemplate) -> list[GoalAssignment]:
    """The owner's assignments of the template that haven't ended. Other organizations running it
    (badge templates) decide for themselves when to move."""
    return list(db.exec(select(GoalAssignment).where(
        GoalAssignment.template_id == template.id, GoalAssignment.org_id == template.org_id,
        GoalAssignment.status != AssignmentStatus.ENDED.value,
    ).order_by(col(GoalAssignment.id))).all())


def move_assignments(db: Session, template: GoalTemplate, target: GoalTemplateVersion, user_id: int | None) -> dict:
    """Move the owner's active assignments to ``target`` (flushed, not committed)."""
    from src.services.goals.assignment_versions import move

    totals = {"assignments": 0, "plans": 0, "rewritten": 0, "added": 0, "removed": 0, "kept_started": 0}
    for assignment in _active_assignments(db, template):
        if assignment.version_id == target.id:
            continue
        counts = move(db, assignment, target, user_id)
        totals["assignments"] += 1
        for key, value in counts.items():
            totals[key] += value
    return totals


def live_preview(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> dict:
    """What switching the live version would touch: the active assignments and their open plans."""
    from src.services.goals.assignment_versions import _open_goals

    templates.require_reader(db, current_user, org_id)
    template = templates.template_or_404(db, org_id, template_uuid)
    rows = _active_assignments(db, template)
    return {"assignments": len(rows), "open_plans": sum(len(_open_goals(db, row)) for row in rows)}


def set_live(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, version_uuid: str | None) -> dict:
    """Make a published version the live one (rolling back or forward) and move active assignments to
    it, or with no version make the template inactive. Assignments keep their version while inactive."""
    template = _editable(db, current_user, org_id, template_uuid)
    moved = None
    if version_uuid is None:
        template.published_version_id = None
    else:
        version = db.exec(select(GoalTemplateVersion).where(
            GoalTemplateVersion.version_uuid == version_uuid, GoalTemplateVersion.template_id == template.id,
            GoalTemplateVersion.private == False,  # noqa: E712
        )).first()
        if version is None:
            raise HTTPException(status_code=404, detail="Version not found")
        from src.services.goals import plan_resources

        plan_resources.ensure_listed_shareable(db, template, version.document or {})
        template.published_version_id = version.id
        db.add(template)
        db.flush()
        moved = move_assignments(db, template, version, current_user.id)
        if template.draft is None:
            # With no draft open, the working copy follows the live version.
            templates._store(db, template, templates.working_copy(db, template, version.document))
    template.update_date = datetime.now().isoformat()
    db.add(template)
    db.commit()
    db.refresh(template)
    return {**templates.template_dict(db, template), "moved": moved}

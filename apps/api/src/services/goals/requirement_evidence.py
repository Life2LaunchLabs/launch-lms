"""Readable, permission-scoped requirement evidence export, read from goal steps.

Completion and staff attestations are reported as recorded, never converted into
academic credit. The export includes pending work and gaps, not just attainment.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from html.parser import HTMLParser

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalAssignment, GoalOwnership, GoalStep, GoalTemplate, GoalTemplateVersion, StepEntry, StepProgress
from src.db.learning import LearningPage, LearningResponseAttempt, LearningRun
from src.db.organizations import Organization
from src.db.requirement_exports import RequirementEvidenceExport
from src.db.requirements import RequirementAttainmentSource, RequirementEnrollment
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_membership
from src.services.goals import access
from src.services.goals.requirements import REVIEW, _value
from src.services.learning_page_convert import iter_block_stacks

HEADERS = (
    "Learner name", "Learner username", "Requirement code", "Requirement title", "Step status",
    "Evidence assessment", "Evidence field", "Evidence type", "Evidence text", "Evidence URL",
    "Evidence availability", "Completion recorded by", "Completion recorded at (UTC)", "Staff approval required",
    "Step", "Reviewer guidance", "Learner note", "Review feedback", "Requirement record",
    "Provided course name", "Provided course code", "Provided section", "Provided term",
    "Framework", "Framework version", "Organization", "Template", "Template version", "Group", "Goal", "Goal status",
    "Submitted at (UTC)", "Current activity attempt",
    "Activity grading status", "Activity score", "Activity maximum score", "Activity graded by",
    "Activity graded by user ID", "Activity graded at (UTC)", "Activity feedback",
    "Requirement description", "Requirement metadata", "Framework source metadata",
    "Exported at (UTC)", "Exported by", "Report purpose", "Learner ID", "Learner UUID", "Exported by user ID",
    "Framework UUID", "Enrollment UUID", "Assignment UUID", "Goal UUID", "Step UUID",
    "Evidence source UUID", "Activity run UUID", "Activity attempt UUID",
)
NO_EVIDENCE = {"Evidence availability": "No evidence recorded"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in {"p", "div", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self.parts.append("\n")
        if tag == "a" and dict(attrs).get("href"):
            self.parts.append(f" [{dict(attrs)['href']}] ")


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    raw = str(value)
    if "<" in raw and ">" in raw:
        parser = _Text()
        parser.feed(raw)
        return "".join(parser.parts).strip()
    return raw


def _name(user: User | None) -> str:
    if not user:
        return ""
    return " ".join(filter(None, [user.first_name, user.last_name])).strip() or user.username


def _date(value) -> str:
    return value.isoformat() if value else ""


def _urls(value) -> list[str]:
    if isinstance(value, list):
        return [url for item in value for url in _urls(item)]
    if isinstance(value, dict):
        return [str(value["url"])] if value.get("url") else [url for item in value.values() for url in _urls(item)]
    return []


def _scope(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> tuple[list[int], list[Goal], bool]:
    require_org_membership(actor.id, org_id, db)
    admin = is_org_admin(actor.id, org_id, db)
    ids = sorted(set(request.user_ids))
    members = set(db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id, UserOrganization.user_id.in_(ids))).all())  # type: ignore[attr-defined]
    if members != set(ids):
        raise HTTPException(status_code=403, detail="Every selected learner must belong to this organization")
    statement = select(Goal).where(Goal.org_id == org_id, Goal.subject_user_id.in_(ids), Goal.ownership == GoalOwnership.EXTERNAL)  # type: ignore[union-attr]
    if request.assignment_uuid:
        assignment = db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id, GoalAssignment.assignment_uuid == request.assignment_uuid)).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        statement = statement.where(Goal.assignment_id == assignment.id)
    if request.usergroup_id:
        group = db.get(UserGroup, request.usergroup_id)
        if not group or group.org_id != org_id:
            raise HTTPException(status_code=404, detail="Group not found")
        group_ids = set(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.org_id == org_id, UserGroupUser.usergroup_id == group.id)).all())
        if set(ids) - group_ids:
            raise HTTPException(status_code=403, detail="Every selected learner must belong to this group")
    goals = [goal for goal in db.exec(statement.order_by(Goal.id)).all()
             if admin or (goal.subject_user_id != actor.id and REVIEW in access.capabilities(db, goal, int(actor.id)))]
    if (request.assignment_uuid or not admin) and set(ids) - {goal.subject_user_id for goal in goals}:
        raise HTTPException(status_code=403, detail="You cannot export every selected learner's assignment")
    return ids, goals, admin


def _work(db: Session, goals: list[Goal]) -> dict[int, list[tuple]]:
    by_user: dict[int, list[tuple]] = {}
    for goal in goals:
        assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
        template = db.get(GoalTemplate, goal.template_id) if goal.template_id else None
        version = db.get(GoalTemplateVersion, goal.version_id) if goal.version_id else None
        group = db.get(UserGroup, assignment.usergroup_id) if assignment and assignment.usergroup_id else None
        context = {
            "Assignment UUID": assignment.assignment_uuid if assignment else "",
            "Template": template.title if template else "", "Template version": version.number if version else "",
            "Group": group.name if group else "", "Goal": goal.title, "Goal UUID": goal.goal_uuid, "Goal status": _value(goal.status),
        }
        for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position, GoalStep.id)).all():
            progress = db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()
            by_user.setdefault(int(goal.subject_user_id or 0), []).append((step, progress, context))
    return by_user


def _artifact(field: str, kind: str, value, url: str = "") -> dict:
    return {"Evidence field": field, "Evidence type": kind, "Evidence text": _text(value), "Evidence URL": url, "Evidence availability": "Recorded"}


def _evidence(db: Session, step: GoalStep, snapshot: dict, progress: StepProgress | None) -> list[dict]:
    """One row per artifact the step collected, with human labels; false and zero answers are kept."""
    slots = {str(slot.get("key")): slot.get("label") for slot in (step.config or {}).get("slots") or [] if isinstance(slot, dict)}
    rows = [_artifact(slots.get(str(entry.slot)) or entry.slot or _value(entry.kind).title(), _value(entry.kind),
                      entry.title or entry.note or entry.resource_uuid or "", entry.url)
            for entry in db.exec(select(StepEntry).where(StepEntry.step_id == step.id).order_by(StepEntry.position, StepEntry.id)).all()]  # type: ignore[arg-type]
    submission = snapshot.get("submission", progress.submission if progress else {}) or {}
    for key, value in submission.items():
        for item in value if isinstance(value, list) else [value]:
            if item is not None and item != "":
                rows.append(_artifact(key, "submission", item, "\n".join(dict.fromkeys(_urls(item)))))
    answer = snapshot.get("answer", progress.answer if progress else "")
    if answer:
        rows.append(_artifact("Answer", "answer", answer))
    return rows


def _activity_evidence(db: Session, step: GoalStep, learner_id: int) -> list[dict]:
    if not step.activity_id:
        return []
    rows = []
    for run in db.exec(select(LearningRun).where(LearningRun.goal_step_id == step.id, LearningRun.user_id == learner_id).order_by(LearningRun.id)).all():
        attempts = db.exec(select(LearningResponseAttempt, LearningPage).join(LearningPage, LearningPage.id == LearningResponseAttempt.page_id).where(
            LearningResponseAttempt.run_id == run.id, LearningResponseAttempt.user_id == learner_id, LearningPage.activity_id == run.activity_id,
        ).order_by(LearningResponseAttempt.submitted_at, LearningResponseAttempt.id)).all()
        latest = {page.id: attempt.id for attempt, page in attempts}
        for attempt, page in attempts:
            questions = {str(block.get("id")): block for blocks in iter_block_stacks(page.content) for block in blocks if block.get("type") == "question"}
            answers = (attempt.answer or {}).get("questions")
            if not isinstance(answers, dict):
                answers = {next(iter(questions), "response"): attempt.answer or {}}
            result = attempt.result or {}
            for key, answer in answers.items():
                question = questions.get(str(key), {})
                prompt = (question.get("content") or {}).get("prompt") or question.get("title") or key
                rows.append({
                    "Evidence field": f"{page.title} · {prompt}", "Evidence type": "Activity response",
                    "Evidence text": answer, "Evidence URL": "\n".join(dict.fromkeys(_urls(answer))),
                    "Evidence availability": "Recorded", "Activity run UUID": run.run_uuid, "Activity attempt UUID": attempt.attempt_uuid,
                    "Current activity attempt": "Yes" if latest[page.id] == attempt.id else "No",
                    "Submitted at (UTC)": attempt.submitted_at.isoformat() if attempt.submitted_at else "",
                    "Activity grading status": result.get("grading_status", ""),
                    "Activity score": attempt.score, "Activity maximum score": result.get("max_score"),
                    "Activity graded by": (result.get("graded_by") or {}).get("staff_name", ""),
                    "Activity graded by user ID": result.get("graded_by_user_id"),
                    "Activity graded at (UTC)": attempt.graded_at.isoformat() if attempt.graded_at else "",
                    "Activity feedback": result.get("feedback", ""),
                })
    return rows


def _step_rows(db: Session, base: dict, step: GoalStep, progress: StepProgress | None, context: dict, source) -> list[dict]:
    status = _value(progress.status) if progress else "not_started"
    completed = status == "completed"
    needs_staff = _value(step.completed_by) == "staff" or bool(step.review_required)
    assessment = {
        "submitted": "Awaiting staff review", "changes_requested": "Changes requested", "excused": "Excused step",
    }.get(status, "Completed; staff approval not established" if completed else "Not yet completed")
    # Use the stored attainment record, never the last editor as an inferred reviewer.
    if completed and needs_staff and source and source.verified_at and source.verified_by_user_id and source.verified_by_user_id != base["Learner ID"]:
        assessment = "Staff-approved step"
    snapshot = (source.evidence_snapshot or {}) if source and completed else {}
    row = {
        **base, **context, "Step": step.title, "Step UUID": step.step_uuid, "Step status": status,
        "Staff approval required": "Yes" if needs_staff else "No", "Evidence assessment": assessment,
        "Reviewer guidance": step.reviewer_guidance, "Learner note": progress.learner_note if progress else "",
        "Review feedback": progress.reviewer_note if progress else "",
        "Completion recorded by": _name(db.get(User, source.verified_by_user_id)) if source and source.verified_by_user_id and completed else "",
        "Completion recorded at (UTC)": _date(source.verified_at) if source and completed else "",
        "Evidence source UUID": source.source_uuid if source else "",
    }
    artifacts = _evidence(db, step, snapshot, progress) + _activity_evidence(db, step, base["Learner ID"])
    return [{**row, **evidence} for evidence in artifacts or [NO_EVIDENCE]]


def _source_rows(db: Session, row: dict, source: RequirementAttainmentSource) -> list[dict]:
    evidence = source.evidence_snapshot or {}
    credit = evidence.get("kind") == "staff_credit"
    source_row = {
        **row, "Requirement record": "Staff attestation" if credit else "Legacy completion",
        "Step": source.objective_title, "Evidence assessment": "Staff attestation" if credit else "Legacy completion record",
        "Evidence text": _text(evidence.get("note") or evidence), "Evidence source UUID": source.source_uuid,
        "Completion recorded by": _name(db.get(User, source.verified_by_user_id)) if source.verified_by_user_id else "",
        "Completion recorded at (UTC)": _date(source.verified_at),
    }
    if credit:
        return [source_row]
    legacy = [_artifact("Legacy evidence", "record", item) for item in evidence.get("evidence") or [] if item not in (None, "")]
    if evidence.get("learner_note"):
        legacy.append(_artifact("Learner note", "record", evidence["learner_note"]))
    return [{**source_row, **artifact} for artifact in legacy or [NO_EVIDENCE]]


def evidence_rows(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> list[dict]:
    ids, goals, admin = _scope(db, actor, org_id, request)
    by_user = _work(db, goals)
    org = db.get(Organization, org_id)
    exported_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for user_id in ids:
        user = db.get(User, user_id)
        base = {
            "Exported at (UTC)": exported_at, "Report purpose": "Requirement evidence; school determines academic credit",
            "Organization": org.name if org else "", "Learner ID": user_id,
            "Learner username": user.username if user else "", "Learner name": _name(user),
            "Provided course name": request.course_name, "Provided course code": request.course_code,
            "Provided section": request.section, "Provided term": request.term,
            "Exported by": _name(db.get(User, actor.id)), "Exported by user ID": actor.id,
            "Learner UUID": user.user_uuid if user else "",
        }
        enrollments = db.exec(select(RequirementEnrollment).where(
            RequirementEnrollment.org_id == org_id, RequirementEnrollment.user_id == user_id, RequirementEnrollment.status != "withdrawn",
        ).order_by(RequirementEnrollment.id)).all()
        if request.framework_uuid:
            enrollments = [item for item in enrollments if (item.framework_snapshot or {}).get("framework_uuid") == request.framework_uuid]
        if not enrollments:
            rows.append({**base, "Framework UUID": request.framework_uuid or "", "Requirement record": "No framework enrollment"})
        for enrollment in enrollments:
            snapshot = enrollment.framework_snapshot or {}
            sources = db.exec(select(RequirementAttainmentSource).where(
                RequirementAttainmentSource.enrollment_id == enrollment.id, RequirementAttainmentSource.revoked_at.is_(None),  # type: ignore[union-attr]
            ).order_by(RequirementAttainmentSource.id)).all()
            for node in snapshot.get("nodes", []):
                if node["node_uuid"] not in snapshot.get("leaf_node_uuids", []):
                    continue
                row = {
                    **base, "Framework": snapshot.get("name"), "Framework UUID": snapshot.get("framework_uuid"),
                    "Framework version": snapshot.get("version"), "Enrollment UUID": enrollment.enrollment_uuid,
                    "Requirement code": node.get("code"), "Requirement title": node.get("title"),
                    "Requirement description": node.get("description"), "Requirement metadata": node.get("metadata"),
                    "Framework source metadata": snapshot.get("source_metadata"),
                }
                matched = False
                for step, progress, context in by_user.get(user_id, []):
                    if not any(link.get("node_uuid") == node["node_uuid"] and link.get("framework_id") == enrollment.framework_id for link in step.requirement_links or []):
                        continue
                    source = next((item for item in sources if progress and item.node_uuid == node["node_uuid"] and item.step_progress_id == progress.id), None)
                    rows.extend(_step_rows(db, {**row, "Requirement record": "Mapped step completion" if source else "Mapped work; no attainment recorded"}, step, progress, context, source))
                    matched = True
                # Free-standing attestations and pre-goal records are explicit sources.
                # Teachers only receive their own attestations, not other goals' evidence.
                for source in sources:
                    if source.node_uuid != node["node_uuid"] or source.step_progress_id:
                        continue
                    if not admin and (request.assignment_uuid or (source.evidence_snapshot or {}).get("kind") != "staff_credit" or source.verified_by_user_id != actor.id):
                        continue
                    rows.extend(_source_rows(db, row, source))
                    matched = True
                if not matched:
                    rows.append({**row, "Requirement record": "No mapped work in export scope", "Evidence assessment": "No evidence in export scope"})
    return rows


def evidence_csv(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> str:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=HEADERS, extrasaction="raise")
    writer.writeheader()
    for row in evidence_rows(db, actor, org_id, request):
        cells = {key: _text(value) for key, value in row.items()}
        # Quoting alone does not stop Excel/Sheets interpreting a cell as a formula.
        for key, value in cells.items():
            if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")):
                cells[key] = "'" + value
        writer.writerow(cells)
    return "﻿" + buffer.getvalue()

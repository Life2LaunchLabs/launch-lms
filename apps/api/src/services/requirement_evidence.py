"""Readable, permission-scoped evidence export using existing objective approval.

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

from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress
from src.db.programs import Program, ProgramAssignment
from src.db.requirement_exports import RequirementEvidenceExport
from src.db.requirements import RequirementAttainmentSource, RequirementEnrollment
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_membership
from src.services.plan_admin import REVIEW, _value
from src.services.planning import capabilities_for
from src.services.requirement_activity_evidence import activity_evidence

HEADERS = (
    "Learner name", "Learner username", "Requirement code", "Requirement title", "Objective status",
    "Evidence assessment", "Evidence field", "Evidence type", "Evidence text", "Evidence URL",
    "Evidence availability", "Completion recorded by", "Completion recorded at (UTC)", "Staff approval required",
    "Objective", "Reviewer guidance", "Learner note", "Review feedback", "Requirement record",
    "Provided course name", "Provided course code", "Provided section", "Provided term",
    "Framework", "Framework version", "Organization", "Template", "Template version", "Group", "Plan", "Plan status",
    "Submitted at (UTC)", "Current activity attempt",
    "Activity grading status", "Activity score", "Activity maximum score", "Activity graded by",
    "Activity graded by user ID", "Activity graded at (UTC)", "Activity feedback",
    "Requirement description", "Requirement metadata", "Framework source metadata",
    "Exported at (UTC)", "Exported by", "Report purpose", "Learner ID", "Learner UUID", "Exported by user ID",
    "Framework UUID", "Enrollment UUID", "Assignment UUID", "Plan UUID", "Objective UUID",
    "Evidence source UUID", "Activity run UUID", "Activity attempt UUID",
)


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
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.parts.append(f" [{href}] ")


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    raw = str(value)
    parser = _Text()
    parser.feed(raw)
    return "".join(parser.parts).strip() if "<" in raw and ">" in raw else raw


def _name(user: User | None) -> str:
    if not user:
        return ""
    return " ".join(filter(None, [user.first_name, user.last_name])).strip() or user.username


def _date(value) -> str:
    return value.isoformat() if value else ""


def _evidence(fields: list[dict], values: dict) -> list[dict]:
    """Use human labels, one row per artifact; preserve false/zero answers."""
    definitions = {str(field.get("field_uuid") or field.get("key")): field for field in fields}
    rows = []
    for key, value in values.items():
        field = definitions.get(key, {})
        kind = str(field.get("type") or "record")
        for item in value if isinstance(value, list) else [value]:
            if item is None or item == "":
                continue
            url = item.get("url", "") if isinstance(item, dict) else str(item) if kind == "link" else ""
            rows.append({
                "Evidence field": field.get("title") or key,
                "Evidence type": kind,
                "Evidence text": _text(item.get("title") or item.get("filename") or item.get("name") or item.get("text") or item.get("value") or "") if isinstance(item, dict) and url else _text(item),
                "Evidence URL": url,
                "Evidence availability": "Recorded",
            })
    return rows or [{"Evidence availability": "No evidence recorded"}]


def _scope(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport):
    require_org_membership(actor.id, org_id, db)
    admin = is_org_admin(actor.id, org_id, db)
    ids = sorted(set(request.user_ids))
    members = set(db.exec(select(UserOrganization.user_id).where(
        UserOrganization.org_id == org_id, UserOrganization.user_id.in_(ids),
    )).all())
    if members != set(ids):
        raise HTTPException(status_code=403, detail="Every selected learner must belong to this organization")
    statement = select(Plan).where(Plan.source_org_id == org_id, Plan.subject_user_id.in_(ids))
    if request.assignment_uuid:
        assignment = db.exec(select(ProgramAssignment).where(
            ProgramAssignment.org_id == org_id, ProgramAssignment.assignment_uuid == request.assignment_uuid,
        )).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        statement = statement.where(Plan.source_assignment_id == assignment.id)
    if request.usergroup_id:
        group = db.get(UserGroup, request.usergroup_id)
        if not group or group.org_id != org_id:
            raise HTTPException(status_code=404, detail="Group not found")
        group_ids = set(db.exec(select(UserGroupUser.user_id).where(
            UserGroupUser.org_id == org_id, UserGroupUser.usergroup_id == group.id,
        )).all())
        if set(ids) - group_ids:
            raise HTTPException(status_code=403, detail="Every selected learner must belong to this group")
    plans = [plan for plan in db.exec(statement.order_by(Plan.id)).all()
             if admin or (plan.subject_user_id != actor.id and REVIEW in capabilities_for(db, plan, actor.id))]
    if (request.assignment_uuid or not admin) and set(ids) - {plan.subject_user_id for plan in plans}:
        raise HTTPException(status_code=403, detail="You cannot export every selected learner's assignment")
    return ids, plans, admin


def _work(db: Session, plans: list[Plan]) -> dict[int, list[tuple]]:
    by_user: dict[int, list[tuple]] = {}
    for plan in plans:
        assignment = db.get(ProgramAssignment, plan.source_assignment_id) if plan.source_assignment_id else None
        program = db.get(Program, plan.source_program_id) if plan.source_program_id else None
        group = db.get(UserGroup, assignment.usergroup_id) if assignment and assignment.usergroup_id else None
        context = {
            "Assignment UUID": assignment.assignment_uuid if assignment else "",
            "Template": program.name if program else "", "Template version": assignment.program_version if assignment else "",
            "Group": group.name if group else "", "Plan": plan.name, "Plan UUID": plan.plan_uuid,
            "Plan status": _value(plan.status),
        }
        for objective in db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position, PlanObjective.id)).all():
            progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
            by_user.setdefault(plan.subject_user_id, []).append((objective, progress, context))
    return by_user


def _objective_rows(db: Session, base: dict, objective, progress, context, source) -> list[dict]:
    status = _value(progress.status) if progress else "not_started"
    completed = status == "completed"
    assessment = {
        "submitted": "Awaiting staff review", "changes_requested": "Changes requested", "canceled": "Excused objective",
    }.get(status, "Completed; staff approval not established" if completed else "Not yet completed")
    # Use the stored attainment record, never the last editor as an inferred reviewer.
    if completed and objective.completion_restricted and source and source.verified_at and source.verified_by_user_id and source.verified_by_user_id != base["Learner ID"]:
        assessment = "Staff-approved objective"
    snapshot = source.evidence_snapshot or {} if source and completed else {}
    values = snapshot.get("field_values", progress.field_values or {} if progress else {})
    row = {
        **base, **context, "Objective": objective.title, "Objective UUID": objective.objective_uuid,
        "Objective status": status, "Staff approval required": "Yes" if objective.completion_restricted else "No",
        "Evidence assessment": assessment, "Reviewer guidance": objective.reviewer_guidance,
        "Learner note": snapshot.get("learner_note", progress.subject_note if progress else ""),
        "Review feedback": progress.reviewer_note if progress else "",
        "Completion recorded by": _name(db.get(User, source.verified_by_user_id)) if source and source.verified_by_user_id and completed else "",
        "Completion recorded at (UTC)": _date(source.verified_at) if source and completed else "",
        "Evidence source UUID": source.source_uuid if source else "",
    }
    artifacts = _evidence(objective.fields or [], values)
    activity = activity_evidence(db, objective, base["Learner ID"])
    if activity:
        artifacts = [item for item in artifacts if item.get("Evidence availability") != "No evidence recorded"] + activity
    return [{**row, **evidence} for evidence in artifacts]


def evidence_rows(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> list[dict]:
    ids, plans, admin = _scope(db, actor, org_id, request)
    by_user = _work(db, plans)
    org = db.get(Organization, org_id)
    exported_at = datetime.now(timezone.utc).isoformat()
    rows = []
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
        statement = select(RequirementEnrollment).where(
            RequirementEnrollment.org_id == org_id, RequirementEnrollment.user_id == user_id,
            RequirementEnrollment.status != "withdrawn",
        )
        enrollments = db.exec(statement.order_by(RequirementEnrollment.id)).all()
        if request.framework_uuid:
            enrollments = [item for item in enrollments if (item.framework_snapshot or {}).get("framework_uuid") == request.framework_uuid]
        if not enrollments:
            rows.append({**base, "Framework UUID": request.framework_uuid or "", "Requirement record": "No framework enrollment"})
        for enrollment in enrollments:
            snapshot = enrollment.framework_snapshot or {}
            sources = db.exec(select(RequirementAttainmentSource).where(
                RequirementAttainmentSource.enrollment_id == enrollment.id,
                RequirementAttainmentSource.revoked_at.is_(None),
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
                for objective, progress, context in by_user.get(user_id, []):
                    if not any(mapping.get("node_uuid") == node["node_uuid"] and mapping.get("framework_id") == enrollment.framework_id for mapping in objective.requirement_mappings or []):
                        continue
                    source = next((source for source in sources if progress and source.node_uuid == node["node_uuid"] and source.plan_objective_progress_id == progress.id), None)
                    rows.extend(_objective_rows(db, {**row, "Requirement record": "Mapped objective completion" if source else "Mapped work; no attainment recorded"}, objective, progress, context, source))
                    matched = True
                # Free-standing attestations and legacy evidence are explicit sources.
                # Teachers only receive their own attestations, not other plans' evidence.
                for source in sources:
                    if source.node_uuid != node["node_uuid"] or source.plan_objective_progress_id:
                        continue
                    if not admin and (request.assignment_uuid or source.objective_progress_id or source.verified_by_user_id != actor.id):
                        continue
                    evidence = source.evidence_snapshot or {}
                    source_row = {
                        **row, "Requirement record": "Staff attestation" if evidence.get("kind") == "staff_credit" else "Legacy objective completion",
                        "Objective": source.objective_title, "Evidence assessment": "Staff attestation" if evidence.get("kind") == "staff_credit" else "Legacy completion record",
                        "Evidence text": _text(evidence.get("note") or evidence), "Evidence source UUID": source.source_uuid,
                        "Completion recorded by": _name(db.get(User, source.verified_by_user_id)) if source.verified_by_user_id else "",
                        "Completion recorded at (UTC)": _date(source.verified_at),
                    }
                    if evidence.get("kind") == "staff_credit":
                        rows.append(source_row)
                    else:
                        for artifact in _evidence([], {"Legacy evidence": evidence.get("evidence", []), "Learner note": evidence.get("learner_note", "")}):
                            rows.append({**source_row, **artifact})
                    matched = True
                if not matched:
                    rows.append({**row, "Requirement record": "No mapped work in export scope", "Evidence assessment": "No evidence in export scope"})
    return rows


def evidence_csv(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> str:
    rows = evidence_rows(db, actor, org_id, request)
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=HEADERS, extrasaction="raise")
    writer.writeheader()
    for row in rows:
        cells = {key: _text(value) for key, value in row.items()}
        # Quoting alone does not stop Excel/Sheets interpreting a cell as a formula.
        for key, value in cells.items():
            if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")):
                cells[key] = "'" + value
        writer.writerow(cells)
    return "\ufeff" + buffer.getvalue()

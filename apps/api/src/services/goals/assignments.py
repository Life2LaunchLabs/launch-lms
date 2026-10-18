"""Handing a template out: to one person, a group, or someone invited by email.

Each learner gets their own goal, issued from the template's published version
and pending until they accept it. Group members who join later get theirs when
the assignment is synced. Someone invited by email who has no account yet gets
a goal with no learner and a learner invitation; accepting it makes them the
learner. Staff join every goal in the role chosen for them; the owner owns it.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goal_templates import AssignmentSchedule, GoalAssignmentRequest
from src.db.goals import Goal, GoalAssignment, GoalAssignmentCreate, GoalSource, GoalStatus, GoalStep, GoalTemplate, GoalTemplateVersion
from src.db.planning import PlanInvitation, PlanInvitationKind, PlanInvitationStatus, PlanRole
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_admin
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.services.goals import access, templates
from src.services.goals.assignment_summary import assignment_dict, collaborators_of
from src.services.school import staff as group_staff
from src.services.goals.document import iter_steps
from src.services.goals.issue import issue_goal

def _now() -> str:
    return datetime.now().isoformat()


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _email_user(db: Session, email: str | None) -> User | None:
    return db.exec(select(User).where(User.email == email.strip().lower())).first() if email else None


def _learners(db: Session, assignment: GoalAssignment) -> list[int]:
    if assignment.user_id:
        return [int(assignment.user_id)]
    if assignment.usergroup_id:
        return [int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == assignment.usergroup_id)).all()]
    user = _email_user(db, assignment.subject_email)
    return [int(user.id)] if user else []  # type: ignore[arg-type]


def _apply(db: Session, assignment: GoalAssignment, goal: Goal) -> None:
    """The assignment's per-step dates and staff roles on one issued goal."""
    dates = assignment.step_dates or {}
    if dates:
        for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
            rule = dates.get(step.template_key or "")
            if not rule:
                continue
            if rule.get("due_date"):
                step.due_date = date.fromisoformat(rule["due_date"])
            db.add(step)
    roles = {role.key: role for role in db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id)).all()}
    for item in collaborators_of(assignment):
        role = roles.get(item["role_key"])
        if role and item["user_id"] not in {goal.owner_user_id, goal.subject_user_id}:
            access.add_member(db, goal, int(item["user_id"]), role)
    group_staff.apply_to_goal(db, assignment, goal)
    db.flush()


def _issue(db: Session, assignment: GoalAssignment, template: GoalTemplate, version: GoalTemplateVersion, user_id: int | None, actor_user_id: int | None) -> Goal:
    owner_id = int(assignment.owner_user_id or assignment.created_by_user_id or 0) or None
    if user_id is None and not owner_id:
        raise HTTPException(status_code=422, detail="Inviting someone by email needs an owner")
    goal = issue_goal(
        db, template, version, subject_user_id=user_id, owner_user_id=owner_id,  # type: ignore[arg-type]
        org_id=assignment.org_id, source=GoalSource.ASSIGNMENT, assignment_id=assignment.id,
        staff_user_ids=list(assignment.staff_user_ids or []), start_date=assignment.start_date, due_date=assignment.due_date,
        stage_dates=assignment.stage_dates, status=GoalStatus.PENDING, actor_user_id=actor_user_id,
    )
    if user_id is None:
        _invite_subject(db, goal, assignment, version, int(owner_id))  # type: ignore[arg-type]
    _apply(db, assignment, goal)
    return goal


def _invite_subject(db: Session, goal: Goal, assignment: GoalAssignment, version: GoalTemplateVersion, owner_id: int) -> None:
    """A learner invitation for someone without an account; accepting it makes them the goal's learner."""
    from src.db.organizations import Organization
    from src.services.messages import create_inbox_message

    key = ((version.document or {}).get("roles") or {}).get("subject_role_key") or "subject"
    role = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == key)).first()
    if not role:
        raise HTTPException(status_code=422, detail="The template has no learner role")
    email = str(assignment.subject_email).strip()
    now = _now()
    invitation = PlanInvitation(
        invitation_uuid=f"plan_invitation_{uuid4()}", goal_id=goal.id, kind=PlanInvitationKind.SUBJECT, email=email,
        email_normalized=email.lower(), role_id=int(role.id), status=PlanInvitationStatus.PENDING,  # type: ignore[arg-type]
        invited_by_user_id=owner_id, creation_date=now, update_date=now,
    )
    db.add(invitation)
    db.flush()
    org = db.get(Organization, goal.org_id) if goal.org_id else None
    sender = org.name if org else "A Launch LMS member"
    create_inbox_message(
        db, recipient_user_id=None, recipient_email=email, sender_org_id=int(org.id) if org and org.id else None, sender_user_id=owner_id,
        message_type="invitation", subject=f"Invitation to {goal.title}", body=f"{sender} invited you to work on {goal.title} as {role.name}.",
        action_url=f"/goals/{goal.goal_uuid}", action_kind="goal_invitation",
        action_data={"invitation_uuid": invitation.invitation_uuid, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "role_name": role.name},
        dedupe_key=f"goal_invitation:{invitation.invitation_uuid}",
    )
    access.log(db, goal, owner_id, "invitation.created", {"invitation_uuid": invitation.invitation_uuid, "kind": "subject"})


def sync_assignment(db: Session, assignment: GoalAssignment, actor_user_id: int | None = None) -> list[Goal]:
    """Issue a goal to every learner of an active assignment who doesn't have one yet (flushed, not committed)."""
    if not assignment.active:
        return []
    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    if not template or not version:
        return []
    external = bool(assignment.subject_email) and not assignment.user_id and not assignment.usergroup_id
    if external and db.exec(select(Goal.id).where(Goal.assignment_id == assignment.id)).first():
        return []
    have = set(db.exec(select(Goal.subject_user_id).where(Goal.assignment_id == assignment.id)).all())
    learners = _learners(db, assignment)
    if external and not learners:
        return [_issue(db, assignment, template, version, None, actor_user_id)]
    return [_issue(db, assignment, template, version, user_id, actor_user_id) for user_id in learners if user_id not in have]


def _can_manage(db: Session, org_id: int, user_ids: list[int]) -> set[int]:
    """People whose organization role lets them manage goal templates."""
    eligible = set()
    for membership in db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id, UserOrganization.user_id.in_(user_ids))).all():  # type: ignore[attr-defined]
        role = db.get(Role, membership.role_id)
        rights = role.rights if role and isinstance(role.rights, dict) else {}
        if membership.role_id in ADMIN_OR_MAINTAINER_ROLE_IDS or (
            rights.get("dashboard", {}).get("action_access") and rights.get("learning_activities", {}).get("action_update")
        ):
            eligible.add(int(membership.user_id))
    return eligible


def _member(db: Session, org_id: int, user_id: int) -> bool:
    return db.exec(select(UserOrganization.id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first() is not None


def _collaborators(db: Session, org_id: int, payload: GoalAssignmentRequest, owner_id: int, roles: dict) -> list[dict]:
    keys = {item["key"] for item in roles.get("definitions") or []}
    staff_key = roles.get("staff_role_key") or "reviewer"
    chosen = {item.user_id: item.role_key or staff_key for item in payload.collaborators}
    staff = list(dict.fromkeys(list(chosen) or payload.staff_user_ids))
    if owner_id not in staff:
        staff.insert(0, owner_id)
    if _can_manage(db, org_id, staff) != set(staff):
        raise HTTPException(status_code=422, detail="Every staff member must be able to manage goal templates")
    result = []
    for user_id in staff:
        role_key = "plan_admin" if user_id == owner_id else chosen.get(user_id, staff_key)
        if role_key not in keys or (role_key in {"subject", "plan_admin"} and user_id != owner_id):
            raise HTTPException(status_code=422, detail=f"Invalid assignment collaborator role: {role_key}")
        result.append({"user_id": user_id, "role_key": role_key})
    return result


def _schedule(document: dict, schedule: AssignmentSchedule | None, stage_dates: dict) -> tuple[dict, dict]:
    """Stage start dates and step close dates from the schedule; stage starts follow stage order."""
    dates = {key: {"start_date": value.get("start_date")} for key, value in (stage_dates or {}).items() if isinstance(value, dict)}
    if not schedule:
        return dates, {}
    given = {item.stage_key: item for item in schedule.stages}
    starts = []
    for stage in document.get("stages") or []:
        item = given.get(stage["key"])
        if item and item.start_date:
            dates[stage["key"]] = {"start_date": _iso(item.start_date)}
            starts.append(item.start_date)
    if starts != sorted(starts):
        raise HTTPException(status_code=422, detail="Stage start dates must follow stage order")
    step_keys = {step["key"]: step["title"] for _, step in iter_steps(document)}
    steps = {}
    for item in schedule.steps:
        if item.step_key not in step_keys:
            raise HTTPException(status_code=422, detail="A scheduled step isn't in this template")
        steps[item.step_key] = {"due_date": _iso(item.due_date)}
    return dates, steps


def assign(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: GoalAssignmentCreate) -> dict:
    require_org_admin(current_user.id, org_id, db)
    if not isinstance(payload, GoalAssignmentRequest):
        payload = GoalAssignmentRequest(**payload.model_dump())
    email = (payload.subject_email or "").strip().lower() or None
    if sum([bool(payload.user_id), bool(payload.usergroup_id), bool(email)]) != 1:
        raise HTTPException(status_code=422, detail="Hand it to one person, one group or one email address")
    template = templates.template_or_404(db, org_id, template_uuid)
    version = templates.issuable_version(db, template)
    if payload.usergroup_id and not db.exec(select(UserGroup.id).where(UserGroup.id == payload.usergroup_id, UserGroup.org_id == org_id)).first():
        raise HTTPException(status_code=404, detail="Group not found")
    if payload.user_id and not _member(db, org_id, payload.user_id):
        raise HTTPException(status_code=404, detail="User is not connected to this organization")
    if email is not None and ("@" not in email or len(email) < 3):
        raise HTTPException(status_code=422, detail="A valid email address is required")
    owner_id = payload.owner_user_id or int(current_user.id)
    if not _member(db, org_id, owner_id):
        raise HTTPException(status_code=422, detail="The goal owner must belong to this organization")
    document = version.document or {}
    collaborators = _collaborators(db, org_id, payload, owner_id, document.get("roles") or {})
    stage_dates, step_dates = _schedule(document, payload.schedule, payload.stage_dates)
    now = _now()
    assignment = GoalAssignment(
        assignment_uuid=f"goal_assignment_{uuid4()}", org_id=org_id, template_id=int(template.id), version_id=int(version.id),  # type: ignore[arg-type]
        usergroup_id=payload.usergroup_id, user_id=payload.user_id, subject_email=email, welcome_message=payload.welcome_message,
        staff_user_ids=[item["user_id"] for item in collaborators], start_date=payload.start_date,
        due_date=payload.due_date, stage_dates=stage_dates,
        step_dates=step_dates, collaborators=collaborators, owner_user_id=owner_id, created_by_user_id=current_user.id, creation_date=now, update_date=now,
    )
    db.add(assignment)
    db.flush()
    goals = sync_assignment(db, assignment, current_user.id)
    db.commit()
    return {**assignment_dict(db, assignment), "goal_uuids": [goal.goal_uuid for goal in goals]}


def list_assignments(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    template = templates.template_or_404(db, org_id, template_uuid)
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.template_id == template.id).order_by(GoalAssignment.id.desc())).all()  # type: ignore[union-attr]
    return [assignment_dict(db, row) for row in rows]


def list_org_assignments(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Active assignments: all of them for admins, the ones they staff for everyone else."""
    from src.security.org_auth import is_org_admin, require_org_membership

    require_org_membership(current_user.id, org_id, db)
    rows = db.exec(
        select(GoalAssignment).where(GoalAssignment.org_id == org_id, GoalAssignment.active == True)  # noqa: E712
        .order_by(GoalAssignment.id.desc())  # type: ignore[union-attr]
    ).all()
    if not (current_user.is_superadmin or is_org_admin(current_user.id, org_id, db)):
        rows = [row for row in rows if current_user.id in (row.staff_user_ids or [])]
    return [assignment_dict(db, row) for row in rows]

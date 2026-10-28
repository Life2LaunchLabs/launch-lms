"""Handing a template out: to one person, a group, or someone invited by email.

Each learner gets their own goal, issued from the template's published version
and pending until they accept it. Group members who join later get theirs when
the assignment is synced. Someone invited by email who has no account yet gets
a goal with no learner and a learner invitation; accepting it makes them the
learner. Staff join every goal in the role chosen for them; the owner owns it.

An assignment is active, paused or ended, and neither pausing nor ending ever
touches a learner's plan:

- Paused: staff hold it. Nobody new gets a plan (group members who join wait
  until it resumes) and no reminders go out, but learners keep their plans and
  can keep working. Resuming issues plans to anyone who joined meanwhile.
- Ended: it's over for staff and moves to the past assignments. Nobody new gets
  a plan and it can't be edited or resumed; plans stay with their learners as
  they are, progress and all.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Iterable
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlmodel import Session, col, select

from src.db.goal_templates import AssignmentSchedule, AssignmentScheduleSave, GoalAssignmentRequest, GoalAssignmentUpdate, StageSchedule, StepSchedule
from src.db.goals import (
    CURRENT_ASSIGNMENT_STATUSES,
    AssignmentStatus,
    Goal,
    GoalAssignment,
    GoalAssignmentCreate,
    GoalSource,
    GoalStage,
    GoalStatus,
    GoalStep,
    GoalTemplate,
    GoalTemplateVersion,
)
from src.db.goal_sharing import PlanInvitation, PlanInvitationKind, PlanInvitationStatus, PlanRole
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, require_org_admin, require_org_membership
from src.services.goals import access, plan_issuers, templates
from src.services.orgs import member_status
from src.services.goals.assignment_staff import _apply_staff, _collaborators, _drop_staff, require_assignment_manager
from src.services.goals.assignment_summary import assignment_dict
from src.services.goals.document import iter_steps
from src.services.goals.issue import _step_due, issue_goal, stage_schedule

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
        # Alumni in the group (a class that moved on) don't get the group's new plans.
        return [int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).join(UserOrganization, and_(
            UserOrganization.user_id == UserGroupUser.user_id, UserOrganization.org_id == assignment.org_id,
        ), isouter=True).where(UserGroupUser.usergroup_id == assignment.usergroup_id, or_(
            col(UserOrganization.status).is_(None), UserOrganization.status != "alumni",
        ))).all()]
    user = _email_user(db, assignment.subject_email)
    return [int(user.id)] if user else []  # type: ignore[arg-type]


def _value(item) -> str:
    return getattr(item, "value", item)


def _apply(db: Session, assignment: GoalAssignment, goal: Goal) -> None:
    """The assignment's step dates and switches, and its staff in their roles, on one issued goal."""
    version = db.get(GoalTemplateVersion, goal.version_id) if goal.version_id else None
    planned = _planned(assignment, (version.document if version else None) or {})["steps"]
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
        plan = planned.get(step.template_key or "")
        if plan:
            step.start_date, step.due_date, step.open_early, step.allow_late = plan["start_date"], plan["due_date"], plan["open_early"], plan["allow_late"]
            db.add(step)
    _apply_staff(db, assignment, goal)


def _issue(db: Session, assignment: GoalAssignment, template: GoalTemplate, version: GoalTemplateVersion, user_id: int | None, actor_user_id: int | None) -> Goal:
    owner_id = int(assignment.owner_user_id or assignment.created_by_user_id or 0) or None
    if user_id is None and not owner_id:
        raise HTTPException(status_code=422, detail="Inviting someone by email needs an owner")
    goal = issue_goal(
        db, template, version, subject_user_id=user_id, owner_user_id=owner_id,  # type: ignore[arg-type]
        org_id=assignment.org_id, source=GoalSource.ASSIGNMENT, assignment_id=assignment.id,
        staff_user_ids=[], start_date=assignment.start_date, due_date=assignment.due_date,
        stage_dates=assignment.stage_dates, status=GoalStatus.PENDING, actor_user_id=actor_user_id,
    )
    if user_id is None:
        _invite_subject(db, goal, assignment, version, int(owner_id))  # type: ignore[arg-type]
    _apply(db, assignment, goal)
    return goal


def _invite_subject(db: Session, goal: Goal, assignment: GoalAssignment, version: GoalTemplateVersion, owner_id: int) -> None:
    """A learner invitation for someone without an account; accepting it makes them the goal's learner."""
    from src.db.organizations import Organization
    from src.services.goals.invitation_emails import send_plan_invitation
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
    send_plan_invitation(db, goal, invitation, role.name)
    access.log(db, goal, owner_id, "invitation.created", {"invitation_uuid": invitation.invitation_uuid, "kind": "subject"})


def sync_assignment(db: Session, assignment: GoalAssignment, actor_user_id: int | None = None) -> list[Goal]:
    """Issue a goal to every learner of an active assignment who doesn't have one yet (flushed, not committed).

    Paused and ended assignments issue nothing (see the module docstring), and nor does an
    assignment of another organization's plan once this organization may no longer run it.
    """
    if _value(assignment.status) != AssignmentStatus.ACTIVE.value or not plan_issuers.still_runs(db, assignment):
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
    issued = [_issue(db, assignment, template, version, user_id, actor_user_id) for user_id in learners if user_id not in have]
    if issued:
        _sync_chats(db, assignment)
    return issued


def _sync_chats(db: Session, assignment: GoalAssignment) -> None:
    """The assignment's staff and whole-group chats, after its staff or learners change."""
    from src.services.connect import cohort

    cohort.sync(db, assignment)


def _member(db: Session, org_id: int, user_id: int) -> bool:
    return db.exec(select(UserOrganization.id).where(UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first() is not None


def _schedule(document: dict, schedule: AssignmentSchedule | None, stage_dates: dict) -> tuple[dict, dict]:
    """Stage start dates and each step's own dates from the schedule; stage starts follow stage order."""
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
    step_keys = {step["key"] for _, step in iter_steps(document)}
    steps = {}
    for item in schedule.steps:
        if item.step_key not in step_keys:
            raise HTTPException(status_code=422, detail="A scheduled step isn't in this template")
        if item.start_date and item.due_date and item.due_date < item.start_date:
            raise HTTPException(status_code=422, detail="A step can't be due before it starts")
        if item.start_date or item.due_date or not item.allow_late:
            steps[item.step_key] = {"start_date": _iso(item.start_date), "due_date": _iso(item.due_date),
                                    "open_early": item.open_early, "allow_late": item.allow_late}
    return dates, steps


def _check_dates(assignment: GoalAssignment) -> None:
    """End after start; and an assignment on a schedule (any stage or step dates) has an end date. Self-paced may not."""
    if assignment.start_date and assignment.due_date and assignment.due_date < assignment.start_date:
        raise HTTPException(status_code=422, detail="The due date can't come before the start date")
    if scheduled(assignment) and not assignment.due_date:
        raise HTTPException(status_code=422, detail="An assignment on a schedule needs an end date")


def scheduled(assignment: GoalAssignment) -> bool:
    """On a schedule (stage or step dates set), not self-paced."""
    return bool(assignment.stage_dates or assignment.step_dates)


def assign(db: Session, current_user: PublicUser, org_id: int, template_uuid: str, payload: GoalAssignmentCreate) -> dict:
    require_org_admin(current_user.id, org_id, db, "run_assignments")
    if not isinstance(payload, GoalAssignmentRequest):
        payload = GoalAssignmentRequest(**payload.model_dump())
    email = (payload.subject_email or "").strip().lower() or None
    if sum([bool(payload.user_id), bool(payload.usergroup_id), bool(email)]) != 1:
        raise HTTPException(status_code=422, detail="Hand it to one person, one group or one email address")
    template = plan_issuers.runnable(db, org_id, template_uuid)
    version = templates.issuable_version(db, template)
    if payload.usergroup_id and not db.exec(select(UserGroup.id).where(UserGroup.id == payload.usergroup_id, UserGroup.org_id == org_id)).first():
        raise HTTPException(status_code=404, detail="Group not found")
    if payload.user_id and not _member(db, org_id, payload.user_id):
        raise HTTPException(status_code=404, detail="User is not connected to this organization")
    if email is not None and ("@" not in email or len(email) < 3):
        raise HTTPException(status_code=422, detail="A valid email address is required")
    subject = payload.user_id or (getattr(_email_user(db, email), "id", None) if email else None)
    alumni = member_status.alumni_ids(db, org_id, [int(subject)]) if subject else []
    if alumni and not payload.reactivate:
        raise HTTPException(status_code=409, detail={"code": "alumni", "user_ids": alumni,
                                                     "message": "This learner is alumni. Make them active again to hand them a plan."})
    if alumni:
        member_status.reactivate(db, org_id, alumni)
    owner_id = payload.owner_user_id or int(current_user.id)
    if not _member(db, org_id, owner_id):
        raise HTTPException(status_code=422, detail="The goal owner must belong to this organization")
    document = version.document or {}
    collaborators = _collaborators(db, org_id, payload, int(current_user.id))
    stage_dates, step_dates = _schedule(document, payload.schedule, payload.stage_dates)
    now = _now()
    assignment = GoalAssignment(
        assignment_uuid=f"goal_assignment_{uuid4()}", org_id=org_id, template_id=int(template.id), version_id=int(version.id),  # type: ignore[arg-type]
        usergroup_id=payload.usergroup_id, user_id=payload.user_id, subject_email=email, welcome_message=payload.welcome_message,
        staff_user_ids=[item["user_id"] for item in collaborators], start_date=payload.start_date,
        due_date=payload.due_date, stage_dates=stage_dates,
        step_dates=step_dates, collaborators=collaborators, owner_user_id=owner_id, created_by_user_id=current_user.id, creation_date=now, update_date=now,
    )
    _check_dates(assignment)
    db.add(assignment)
    db.flush()
    goals = sync_assignment(db, assignment, current_user.id)
    db.commit()
    return {**assignment_dict(db, assignment), "goal_uuids": [goal.goal_uuid for goal in goals]}


def list_assignments(db: Session, current_user: PublicUser, org_id: int, template_uuid: str) -> list[dict]:
    """A template's assignments here: all of them for admins; staff see it read-only, with the ones they staff."""
    templates.require_reader(db, current_user, org_id)
    template = plan_issuers.runnable(db, org_id, template_uuid)
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.template_id == template.id, GoalAssignment.org_id == org_id)
                   .order_by(GoalAssignment.id.desc())).all()  # type: ignore[union-attr]
    if not templates.can_edit(db, current_user, org_id):
        rows = [row for row in rows if current_user.id in (row.staff_user_ids or [])]
    return [assignment_dict(db, row) for row in rows]


def list_org_assignments(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """Current (active and paused) assignments: all of them for admins, the ones they staff for everyone else."""

    require_org_membership(current_user.id, org_id, db)
    rows = db.exec(
        select(GoalAssignment).where(GoalAssignment.org_id == org_id, col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES))
        .order_by(GoalAssignment.id.desc())  # type: ignore[union-attr]
    ).all()
    if not (current_user.is_superadmin or is_org_admin(current_user.id, org_id, db)):
        rows = [row for row in rows if current_user.id in (row.staff_user_ids or [])]
    return [assignment_dict(db, row) for row in rows]


def sync_group_members(db: Session, group: UserGroup, user_ids: Iterable[int], actor_user_id: int | None = None) -> list[Goal]:
    """People just added to a group: the plans of its active assignments, and their chat with the organization (flushed)."""
    from src.services.school import chats as school_chats

    issued: list[Goal] = []
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.usergroup_id == group.id, GoalAssignment.status == AssignmentStatus.ACTIVE.value)
                   .order_by(col(GoalAssignment.id))).all()
    for assignment in rows:
        issued.extend(sync_assignment(db, assignment, actor_user_id))
    for user_id in dict.fromkeys(user_ids):
        school_chats.school_chat(db, int(group.org_id), int(user_id))
    return issued


# Running an assignment: edit, pause, resume, end ------------------------------------------


def _step_plan(rule: dict, due: date | None) -> dict:
    """One step's dates and switches from its schedule entry; ``due`` is its date without one."""
    return {
        "start_date": date.fromisoformat(rule["start_date"]) if rule.get("start_date") else None,
        "due_date": date.fromisoformat(rule["due_date"]) if rule.get("due_date") else due,
        "open_early": bool(rule.get("open_early", True)), "allow_late": bool(rule.get("allow_late", True)),
    }


def _planned(assignment: GoalAssignment, document: dict) -> dict:
    """The dates an assignment gives its goals: start and due, stage starts and each step's dates by template key."""
    schedule = stage_schedule(document, assignment.start_date, assignment.stage_dates)
    steps: dict[str, dict] = {}
    for stage in document.get("stages") or []:
        begins, ends = schedule.get(stage["key"], (None, None))
        for spec in stage.get("steps") or []:
            rule = (assignment.step_dates or {}).get(spec["key"]) or {}
            steps[spec["key"]] = _step_plan(rule, _step_due(spec, begins, ends))
    return {"start": assignment.start_date, "due": assignment.due_date, "stages": {key: value[0] for key, value in schedule.items()}, "steps": steps}


def _reschedule(db: Session, goal: Goal, before: dict, after: dict) -> bool:
    """Move a goal's dates from the assignment's old plan to its new one.

    A date staff changed on this learner's plan alone (one that no longer matches the old plan) is left as it is.
    """
    changed = False

    def move(row, field: str, old, new) -> None:
        nonlocal changed
        if getattr(row, field) == old and old != new:
            setattr(row, field, new)
            db.add(row)
            changed = True

    move(goal, "start_date", before["start"], after["start"])
    move(goal, "target_date", before["due"], after["due"])
    for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all():
        if stage.template_key in after["stages"]:
            move(stage, "start_date", before["stages"].get(stage.template_key), after["stages"][stage.template_key])
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
        if step.template_key in after["steps"]:
            old, new = before["steps"].get(step.template_key) or {}, after["steps"][step.template_key]
            for field in ("start_date", "due_date", "open_early", "allow_late"):
                move(step, field, old.get(field, getattr(step, field)), new[field])
    return changed


def update(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, payload: GoalAssignmentUpdate) -> dict:
    """Edit an assignment's welcome text, dates, schedule or staff, and bring its learners' goals along."""
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    if _value(assignment.status) == AssignmentStatus.ENDED.value:
        raise HTTPException(status_code=409, detail="An ended assignment can't be changed")
    sent = payload.model_fields_set
    version = db.get(GoalTemplateVersion, assignment.version_id)
    document = (version.document if version else None) or {}
    before = _planned(assignment, document)
    if "welcome_message" in sent:
        assignment.welcome_message = payload.welcome_message or ""
    if "start_date" in sent:
        assignment.start_date = payload.start_date
    if "due_date" in sent:
        assignment.due_date = payload.due_date
    if "schedule" in sent:
        assignment.stage_dates, assignment.step_dates = _schedule(document, payload.schedule, {}) if payload.schedule else ({}, {})
    _check_dates(assignment)
    removed: set[int] = set()
    if "collaborators" in sent and payload.collaborators is not None:
        collaborators = _collaborators(db, org_id, GoalAssignmentRequest(collaborators=payload.collaborators))
        removed = set(assignment.staff_user_ids or []) - {item["user_id"] for item in collaborators}
        assignment.collaborators, assignment.staff_user_ids = collaborators, [item["user_id"] for item in collaborators]
    assignment.update_date = _now()
    db.add(assignment)
    db.flush()
    after = _planned(assignment, document)
    for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(col(Goal.id))).all():
        _reschedule(db, goal, before, after)
        if "collaborators" in sent:
            _drop_staff(db, assignment, goal, removed)
            _apply_staff(db, assignment, goal)
        db.flush()
        # Keeps the goal's chat in step with who's on it.
        access.log(db, goal, current_user.id, "goal.updated", {"assignment_uuid": assignment.assignment_uuid, "fields": sorted(sent)})
    if "collaborators" in sent:
        _sync_chats(db, assignment)
    db.commit()
    return assignment_dict(db, assignment)


def save_schedule(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, payload: AssignmentScheduleSave) -> dict:
    """Replace a running assignment's whole schedule (start, end, stage starts, steps' own dates and switches).

    Its learners' goals move along, except dates staff changed on one learner's goal.
    """
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    if _value(assignment.status) == AssignmentStatus.ENDED.value:
        raise HTTPException(status_code=409, detail="An ended assignment can't be changed")
    version = db.get(GoalTemplateVersion, assignment.version_id)
    document = (version.document if version else None) or {}
    before = _planned(assignment, document)
    assignment.start_date, assignment.due_date = payload.start_date, payload.due_date
    assignment.stage_dates, assignment.step_dates = _schedule(document, AssignmentSchedule(stages=payload.stages, steps=payload.steps), {})
    _check_dates(assignment)
    assignment.update_date = _now()
    db.add(assignment)
    db.flush()
    after = _planned(assignment, document)
    for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(col(Goal.id))).all():
        if _reschedule(db, goal, before, after):
            access.log(db, goal, current_user.id, "goal.updated", {"assignment_uuid": assignment.assignment_uuid, "fields": ["schedule"]})
    db.commit()
    return assignment_dict(db, assignment)


def current_schedule(assignment: GoalAssignment) -> AssignmentScheduleSave:
    """The assignment's schedule as save_schedule takes it."""
    return AssignmentScheduleSave(
        start_date=assignment.start_date, due_date=assignment.due_date,
        stages=[StageSchedule(stage_key=key, start_date=value.get("start_date")) for key, value in (assignment.stage_dates or {}).items()],
        steps=[StepSchedule(step_key=key, **{field: value[field] for field in ("start_date", "due_date", "open_early", "allow_late") if field in value})
               for key, value in (assignment.step_dates or {}).items()],
    )


def set_step_due(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, step_key: str, due_date: date | None) -> dict:
    """Set or clear one step's due date: the whole schedule, saved with that one change."""
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    if step_key not in {step["key"] for _, step in iter_steps((version.document if version else None) or {})}:
        raise HTTPException(status_code=404, detail="Step not found in this assignment")
    schedule = current_schedule(assignment)
    step = next((item for item in schedule.steps if item.step_key == step_key), None) or StepSchedule(step_key=step_key)
    step.due_date = due_date
    schedule.steps = [*(item for item in schedule.steps if item.step_key != step_key), step]
    return save_schedule(db, current_user, org_id, assignment_uuid, schedule)


def pause(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    if _value(assignment.status) != AssignmentStatus.ACTIVE.value:
        raise HTTPException(status_code=409, detail="Only an active assignment can be paused")
    now = _now()
    assignment.status, assignment.paused_at, assignment.update_date = AssignmentStatus.PAUSED, now, now
    db.add(assignment)
    db.commit()
    return assignment_dict(db, assignment)


def resume(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    """Pick a paused assignment back up, issuing plans to anyone who joined its group meanwhile."""
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    if _value(assignment.status) != AssignmentStatus.PAUSED.value:
        raise HTTPException(status_code=409, detail="Only a paused assignment can be resumed")
    assignment.status, assignment.paused_at, assignment.update_date = AssignmentStatus.ACTIVE, None, _now()
    db.add(assignment)
    db.flush()
    goals = sync_assignment(db, assignment, current_user.id)
    db.commit()
    return {**assignment_dict(db, assignment), "goal_uuids": [goal.goal_uuid for goal in goals]}


def end(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    """End an assignment for good. Learners keep their plans as they are (see the module docstring)."""
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    if _value(assignment.status) == AssignmentStatus.ENDED.value:
        raise HTTPException(status_code=409, detail="This assignment has already ended")
    now = _now()
    assignment.status, assignment.paused_at, assignment.ended_at = AssignmentStatus.ENDED, None, now
    assignment.ended_by_user_id, assignment.update_date = current_user.id, now
    db.add(assignment)
    db.commit()
    return assignment_dict(db, assignment)

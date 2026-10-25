"""Threads: what staff share with a learner, a staff member or a group, gathered for the thread's header and filters.

The messages come from the chats as before (a learner's chat with the organization, a direct chat,
a group's chat and its assignments' chats), narrowed to a plan or step. This adds what the thread
shows around them: who else is on it, the plans it covers with what waits on the viewer in each,
where each step of a plan stands, and how many entries each filter holds (work to review, open
questions, helpers to approve, steps past due, staff-only notes). Like past-due lines, none of it
is stored; it follows from where the plans and chats are now.
"""

from __future__ import annotations

from collections import defaultdict
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goals import Goal, GoalAssignment, GoalStage, GoalStep, GoalTemplate, StepProgress, StepStatus
from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.school import UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.connect import chats, cohort, people, visibility, workspace
from src.services.goals import assignment_messages, assignment_status, helper_requests
from src.services.goals.sharing_roles import _stamp
from src.services.school import chats as school_chats, feed, group_chats, roles, views

FILTERS = ("review", "questions", "requests", "past_due", "staff_only")
# How far back open questions are looked for.
QUESTION_WINDOW = 500


def _value(item) -> str:
    return getattr(item, "value", item)


def _empty_counts() -> dict[str, int]:
    return {name: 0 for name in FILTERS}


def _people(db: Session, ids: list[int], viewer: int) -> list[dict]:
    """People once each, the viewer first (shown as "you")."""
    ordered = [viewer] if viewer in ids else []
    ordered += [user_id for user_id in dict.fromkeys(ids) if user_id != viewer]
    return [person for person in (people.person(db, user_id) for user_id in ordered) if person]


def _cover(template: GoalTemplate | None) -> dict | None:
    if not template:
        return None
    return {"template_uuid": template.template_uuid, "thumbnail_image": template.thumbnail_image, "icon": template.icon, "color": template.color}


def _assignment_state(assignment: GoalAssignment | None, goal: Goal) -> str:
    return _value(assignment.status) if assignment else _value(goal.status)


# Open questions ---------------------------------------------------------------------------

def _scopes(db: Session, message_ids: list[int]) -> dict[int, tuple[int | None, str | None]]:
    """Each message's plan and step, from its refs (the most specific one wins)."""
    found: dict[int, tuple[int | None, str | None]] = {}
    if not message_ids:
        return found
    for message_id, goal_id, step_uuid in db.exec(select(ConversationMessageRef.message_id, ConversationMessageRef.goal_id, ConversationMessageRef.step_uuid).where(
            col(ConversationMessageRef.message_id).in_(message_ids))).all():
        current = found.get(int(message_id))
        if not current or (step_uuid and not current[1]):
            found[int(message_id)] = (int(goal_id) if goal_id else None, step_uuid)
    return found


def open_questions(db: Session, conversation: Conversation, student_id: int) -> list[tuple[ConversationMessage, int | None, str | None]]:
    """The learner's messages that no one on staff has answered since, each with its plan and step.

    A staff reply answers what the learner wrote before it about the same plan and step (or, for
    messages about no plan, anything else about no plan). Staff-only notes don't answer.
    """
    rows = list(reversed(db.exec(select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id, ConversationMessage.kind == "text", ConversationMessage.visibility == visibility.ALL,
    ).order_by(col(ConversationMessage.creation_date).desc(), col(ConversationMessage.id).desc()).limit(QUESTION_WINDOW)).all()))
    scopes = _scopes(db, [int(message.id) for message in rows])  # type: ignore[arg-type]
    waiting: dict[tuple[int | None, str | None], list[ConversationMessage]] = defaultdict(list)
    for message in rows:
        scope = scopes.get(int(message.id), (None, None))  # type: ignore[arg-type]
        if message.sender_user_id == student_id:
            waiting[scope].append(message)
        elif message.sender_user_id:
            waiting.pop(scope, None)
    found = [(message, scope[0], scope[1]) for scope, messages in waiting.items() for message in messages]
    return sorted(found, key=lambda item: (item[0].creation_date, item[0].id))


def _staff_only(db: Session, conversation: Conversation, goal: Goal | None, step_uuid: str | None = None) -> int:
    query = select(func.count()).select_from(ConversationMessage).where(ConversationMessage.conversation_id == conversation.id, ConversationMessage.visibility == visibility.STAFF)
    if goal:
        refs = select(ConversationMessageRef.message_id).where(ConversationMessageRef.conversation_id == conversation.id, ConversationMessageRef.goal_id == goal.id)
        if step_uuid:
            refs = refs.where(ConversationMessageRef.step_uuid == step_uuid)
        query = query.where(col(ConversationMessage.id).in_(refs))
    return int(db.exec(query).one())


# A plan's steps ---------------------------------------------------------------------------

def _step_state(step: GoalStep, progress: StepProgress | None, student_id: int) -> dict:
    status = _value(progress.status) if progress else StepStatus.NOT_STARTED.value
    by = progress.completed_by_user_id or progress.updated_by_user_id if progress else None
    if status == StepStatus.COMPLETED.value:
        state = "approved" if step.review_required and by and by != student_id else "done"
    else:
        state = {StepStatus.SUBMITTED.value: "review", StepStatus.CHANGES_REQUESTED.value: "changes", StepStatus.EXCUSED.value: "excused",
                 StepStatus.IN_PROGRESS.value: "started"}.get(status, "open")
    return {"state": state, "by": by if state in ("approved", "changes") else None}


def plan_steps(db: Session, goal: Goal, conversation: Conversation | None, viewer: int) -> list[dict]:
    """Every step of a learner's plan in order, with where it stands and how many thread entries are about it."""
    stages = {int(stage.id): stage.position for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}  # type: ignore[arg-type]
    steps = sorted(db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all(), key=lambda step: (stages.get(int(step.stage_id or 0), 0), step.position, step.id))
    progress = {int(row.step_id): row for row in db.exec(select(StepProgress).where(col(StepProgress.step_id).in_([int(step.id) for step in steps] or [0]))).all()}  # type: ignore[arg-type]
    updates: dict[str, int] = {}
    if conversation:
        query = select(ConversationMessageRef.step_uuid, func.count(func.distinct(ConversationMessageRef.message_id))).join(
            ConversationMessage, ConversationMessage.id == ConversationMessageRef.message_id,
        ).where(ConversationMessageRef.conversation_id == conversation.id, ConversationMessageRef.goal_id == goal.id, col(ConversationMessageRef.step_uuid).is_not(None))
        if not visibility.sees_staff(db, conversation, viewer):
            query = query.where(ConversationMessage.visibility == visibility.ALL)
        updates = {str(step_uuid): int(count) for step_uuid, count in db.exec(query.group_by(ConversationMessageRef.step_uuid)).all()}
    student = int(goal.subject_user_id or 0)
    found = []
    for step in steps:
        state = _step_state(step, progress.get(int(step.id)), student)  # type: ignore[arg-type]
        found.append({"step_uuid": step.step_uuid, "step_key": step.template_key, "title": step.title, "type": step.type, "stage_id": step.stage_id,
                      "due_date": step.due_date.isoformat() if step.due_date else None, **state,
                      "by_person": people.person(db, state["by"]) if state["by"] else None, "updates": updates.get(step.step_uuid, 0)})
    return found


# A learner's thread -----------------------------------------------------------------------

def _staff_thread(db: Session, current_user: PublicUser, org_id: int, user: User, role: str) -> dict:
    conversation = chats.ensure_direct(db, int(current_user.id), int(user.id))  # type: ignore[arg-type]
    db.commit()
    return {"kind": "staff", "person": people.person(db, user.id), "role": role, "chat_uuid": conversation.conversation_uuid if conversation else None,
            "with": [], "plans": [], "focus": None, "steps": [], "counts": _empty_counts(), "review": [], "questions": [], "requests": [], "past_due": []}


def person_thread(db: Session, current_user: PublicUser, org_id: int, user_id: int, goal_uuid: str | None = None) -> dict:
    """A learner's thread as staff see it: the plans it covers, and what each filter holds (narrowed to one plan when asked).

    With a staff member it's your direct chat with them, and has no plans.
    """
    roles.require_staff(db, current_user.id, org_id)
    viewer = int(current_user.id)  # type: ignore[arg-type]
    user = db.get(User, user_id)
    role = roles.org_role(db, org_id, user_id) if user else None
    if not user or not role or user_id == viewer:
        raise HTTPException(status_code=404, detail="Person not found")
    if role in roles.STAFF_ROLES:
        return _staff_thread(db, current_user, org_id, user, role)
    views._require(db, current_user, org_id, user_id)
    conversation = school_chats.school_chat(db, org_id, user_id)
    db.commit()
    admin = is_org_admin(viewer, org_id, db)

    goals = workspace.org_goals(db, org_id, user_id)
    focus = next((goal for goal in goals if goal.goal_uuid == goal_uuid), None) if goal_uuid else None
    if goal_uuid and not focus:
        raise HTTPException(status_code=404, detail="Plan not found in this thread")
    assignments = {int(item.id): item for item in db.exec(select(GoalAssignment).where(col(GoalAssignment.id).in_([goal.assignment_id for goal in goals if goal.assignment_id] or [0]))).all()}  # type: ignore[arg-type]
    templates = {int(item.id): item for item in db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_([goal.template_id for goal in goals if goal.template_id] or [0]))).all()}  # type: ignore[arg-type]

    assignment_of = {goal.goal_uuid: assignments[int(goal.assignment_id)].assignment_uuid for goal in goals if goal.assignment_id and int(goal.assignment_id) in assignments}
    review = [{"goal_uuid": goal.goal_uuid, "assignment_uuid": assignment_of.get(goal.goal_uuid), "step_uuid": step.step_uuid, "step_key": step.template_key,
               "title": step.title, "submitted_at": progress.update_date} for goal, step, progress in feed.turn_ins(db, viewer, org_id, user_id)]
    requests = [{**helper_requests._dict(db, invitation, goal), "goal_uuid": goal.goal_uuid} for invitation, goal in feed.waiting_helpers(db, org_id, user_id)] if admin else []
    goal_ids = {int(goal.id): goal for goal in goals}  # type: ignore[arg-type]
    questions = [{"message_uuid": message.message_uuid, "goal_uuid": goal_ids[goal_id].goal_uuid if goal_id in goal_ids else None, "step_uuid": step_uuid}
                 for message, goal_id, step_uuid in open_questions(db, conversation, user_id)]
    past_due = []
    for goal in goals:
        assignment = assignments.get(int(goal.assignment_id)) if goal.assignment_id else None
        if assignment and _value(assignment.status) == "active":
            past_due += [{**line, "goal_uuid": goal.goal_uuid, "assignment_uuid": assignment.assignment_uuid} for line in assignment_messages._past_due(db, assignment, goal, viewer)]

    def about(items: list[dict], goal: Goal) -> list[dict]:
        return [item for item in items if item.get("goal_uuid") == goal.goal_uuid]

    plans = []
    for goal in goals:
        assignment = assignments.get(int(goal.assignment_id)) if goal.assignment_id else None
        plans.append({"goal_uuid": goal.goal_uuid, "title": goal.title, "assignment_uuid": assignment.assignment_uuid if assignment else None,
                      "group_id": assignment.usergroup_id if assignment else None, "status": _assignment_state(assignment, goal),
                      "cover": _cover(templates.get(int(goal.template_id)) if goal.template_id else None),
                      "needs": len(about(review, goal)) + len(about(requests, goal)) + len(about(questions, goal))})

    scoped = (lambda items: about(items, focus)) if focus else (lambda items: items)
    in_scope = [assignments[int(goal.assignment_id)] for goal in ([focus] if focus else goals) if goal.assignment_id and int(goal.assignment_id) in assignments]
    staff = [user_id for assignment in in_scope if _value(assignment.status) != "ended" for user_id in assignment.staff_user_ids]
    staff += [row.user_id for row in school_chats.team(db, org_id, user_id)]
    counts = {"review": len(scoped(review)), "questions": len(scoped(questions)), "requests": len(scoped(requests)), "past_due": len(scoped(past_due)),
              "staff_only": _staff_only(db, conversation, focus)}
    return {"kind": "learner", "person": people.person(db, user_id), "role": role, "chat_uuid": conversation.conversation_uuid, "with": _people(db, staff, viewer),
            "plans": plans, "focus": focus.goal_uuid if focus else None, "steps": plan_steps(db, focus, conversation, viewer) if focus else [], "counts": counts,
            "review": scoped(review), "questions": scoped(questions), "requests": scoped(requests), "past_due": scoped(past_due)}


# A group's thread -------------------------------------------------------------------------

def _behind(db: Session, assignment: GoalAssignment, viewer: int) -> dict[str, dict]:
    """Per step, the learners past due on it."""
    found: dict[str, dict] = {}
    for learner in assignment_status.board(db, assignment, viewer).learners:
        for key, name in learner.cells.items():
            if name == "behind" and key in learner.steps:
                entry = found.setdefault(key, {"step_key": key, "title": learner.steps[key].title, "due_date": None, "learners": []})
                closes = learner.closes.get(key)
                entry["due_date"] = entry["due_date"] or (closes.isoformat() if closes else None)
                if learner.goal.subject_user_id:
                    entry["learners"].append(people.person(db, learner.goal.subject_user_id))
    return found


def _asked(db: Session, assignment: GoalAssignment) -> list[dict]:
    """Per step, who asked about it in their own thread and is still waiting for an answer."""
    goals = {int(goal.id): goal for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).all() if goal.subject_user_id}  # type: ignore[arg-type]
    keys = {step.step_uuid: step for step in db.exec(select(GoalStep).where(col(GoalStep.goal_id).in_(list(goals) or [0]))).all()}
    found: dict[str, dict] = {}
    for goal in goals.values():
        conversation = school_chats.find(db, int(assignment.org_id), int(goal.subject_user_id))  # type: ignore[arg-type]
        if not conversation:
            continue
        for _, goal_id, step_uuid in open_questions(db, conversation, int(goal.subject_user_id)):  # type: ignore[arg-type]
            step = keys.get(step_uuid or "")
            if goal_id != goal.id or not step:
                continue
            entry = found.setdefault(step.template_key or step.step_uuid, {"step_key": step.template_key, "title": step.title, "learners": []})
            learner = people.person(db, goal.subject_user_id)
            if learner and learner not in entry["learners"]:
                entry["learners"].append(learner)
    return list(found.values())


def group_thread(db: Session, current_user: PublicUser, org_id: int, group_id: int, assignment_uuid: str | None = None) -> dict:
    """A group's thread: its own chat, and one per assignment it's working on, with who's past due and who asked about what."""
    roles.require_staff(db, current_user.id, org_id)
    viewer = int(current_user.id)  # type: ignore[arg-type]
    group = db.get(UserGroup, group_id)
    if not group or group.org_id != org_id or (not is_org_admin(viewer, org_id, db) and viewer not in group_chats.people_of(db, group_id)):
        raise HTTPException(status_code=404, detail="Group not found")
    chat = group_chats.find(db, group_id) if group_chats.visible(db, org_id) else None
    runs = list(db.exec(select(GoalAssignment).where(GoalAssignment.usergroup_id == group_id).order_by(col(GoalAssignment.id))).all())
    focus = next((item for item in runs if item.assignment_uuid == assignment_uuid), None) if assignment_uuid else None
    if assignment_uuid and not focus:
        raise HTTPException(status_code=404, detail="Assignment not found in this thread")
    templates = {int(item.id): item for item in db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_([run.template_id for run in runs] or [0]))).all()}  # type: ignore[arg-type]
    plans, past_due, staff = [], [], []
    for run in runs:
        active = _value(run.status) == "active"
        behind = list(_behind(db, run, viewer).values()) if active else []
        conversation = cohort.chat(db, run, cohort.GROUP) if _value(run.status) != "ended" else cohort.find(db, run, cohort.GROUP)
        template = templates.get(int(run.template_id))
        plans.append({"assignment_uuid": run.assignment_uuid, "title": template.title if template else "", "status": _value(run.status), "chat_uuid": conversation.conversation_uuid if conversation else None,
                      "cover": _cover(template), "needs": len(behind)})
        if focus is None or run is focus:
            past_due += [{**line, "assignment_uuid": run.assignment_uuid} for line in behind]
            if active:
                staff += list(run.staff_user_ids)
    db.commit()
    if focus is None:
        staff += list(db.exec(select(UserGroupStaff.user_id).where(UserGroupStaff.usergroup_id == group_id)).all())
    asked = _asked(db, focus) if focus and _value(focus.status) == "active" else []
    learners = int(db.exec(select(func.count()).select_from(UserGroupUser).where(UserGroupUser.usergroup_id == group_id)).one())
    focus_chat = next((plan["chat_uuid"] for plan in plans if focus and plan["assignment_uuid"] == focus.assignment_uuid), None)
    staff_only = 0
    if focus_chat:
        conversation = db.exec(select(Conversation).where(Conversation.conversation_uuid == focus_chat)).first()
        staff_only = _staff_only(db, conversation, None) if conversation else 0
    counts = {**_empty_counts(), "questions": sum(len(item["learners"]) for item in asked), "past_due": len(past_due), "staff_only": staff_only}
    return {"kind": "group", "group": {"id": group.id, "name": group.name, "learner_count": learners}, "chat_uuid": chat.conversation_uuid if chat else None,
            "with": _people(db, [int(item) for item in staff], viewer), "plans": plans, "focus": focus.assignment_uuid if focus else None,
            "counts": counts, "past_due": past_due, "asked": asked}


# The all-staff room ----------------------------------------------------------------------

STAFF_ROOM = "staff_room"
STAFF_ROOM_TITLE = "All staff"


def _staff_key(org_id: int) -> str:
    # Shares the direct-chat key column so each organization has exactly one room.
    return f"staff:{org_id}"


def staff_room(db: Session, org_id: int) -> Conversation:
    """The organization's room for all its staff, created if needed, with its members brought up to date (flushed)."""
    conversation = db.exec(select(Conversation).where(Conversation.direct_key == _staff_key(org_id))).first()
    now = _stamp()
    if not conversation:
        conversation = Conversation(conversation_uuid=f"chat_{uuid4()}", kind=STAFF_ROOM, direct_key=_staff_key(org_id), title=STAFF_ROOM_TITLE,
                                    org_id=org_id, creation_date=now, update_date=now)
        db.add(conversation)
        db.flush()
    wanted = roles.staff_ids(db, org_id)
    current = {member.user_id: member for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
    for user_id in wanted - set(current):
        db.add(ConversationMember(conversation_id=int(conversation.id), user_id=user_id, status="active", creation_date=now, update_date=now))  # type: ignore[arg-type]
    for user_id, member in current.items():
        if user_id not in wanted:
            db.delete(member)
    db.flush()
    return conversation


def staff_room_thread(db: Session, current_user: PublicUser, org_id: int) -> dict:
    roles.require_staff(db, current_user.id, org_id)
    conversation = staff_room(db, org_id)
    db.commit()
    viewer = int(current_user.id)  # type: ignore[arg-type]
    return {"kind": STAFF_ROOM, "title": STAFF_ROOM_TITLE, "chat_uuid": conversation.conversation_uuid,
            "with": _people(db, sorted(roles.staff_ids(db, org_id)), viewer), "counts": _empty_counts()}


def _room_row(db: Session, org_id: int, viewer: int) -> dict:
    conversation = staff_room(db, org_id)
    member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == viewer)).first()
    last = chats._last(db, conversation, viewer)
    return {"key": STAFF_ROOM, "kind": STAFF_ROOM, "title": STAFF_ROOM_TITLE, "chat_uuid": conversation.conversation_uuid,
            "unread": chats._unread(db, conversation, member) if member else 0, "at": conversation.last_message_at,
            "preview": feed._last_line(chats._message_dict(db, last, viewer) if last else None, True) if last else "Talk with everyone on staff"}


# The organization's thread ---------------------------------------------------------------

ORG = "org"
LOG_LIMIT = 200


def _iso(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value or "")


def org_log(db: Session, org_id: int) -> list[dict]:
    """What happened to the organization, oldest first: it was made, staff joined, learners joined (a line a day), invitations went out.

    Nothing is stored for it: each line follows from the organization's members and invitations.
    """
    org = db.get(Organization, org_id)
    entries: list[dict] = [{"kind": "org_created", "at": org.creation_date, "org": {"name": org.name}}] if org and org.creation_date else []
    staff_roles = roles.staff_role_ids(db, org_id)
    learners: dict[str, list[UserOrganization]] = defaultdict(list)
    for membership in db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id).order_by(col(UserOrganization.creation_date))).all():
        if int(membership.role_id) in staff_roles:
            entries.append({"kind": "staff_joined", "at": membership.creation_date, "person": people.person(db, membership.user_id),
                            "role": "admin" if int(membership.role_id) == ADMIN_ROLE_ID else "staff"})
        else:
            learners[(membership.creation_date or "")[:10]].append(membership)
    for day, rows in learners.items():
        entries.append({"kind": "learners_joined", "at": rows[-1].creation_date, "count": len(rows),
                        "people": [person for person in (people.person(db, row.user_id) for row in rows[:5]) if person]})
    invited: dict[tuple[str, int | None, str], list[OrganizationInvitation]] = defaultdict(list)
    for invitation in db.exec(select(OrganizationInvitation).where(OrganizationInvitation.org_id == org_id).order_by(col(OrganizationInvitation.created_at))).all():
        role = "staff" if int(invitation.role_id) in staff_roles else "learner"
        invited[(_iso(invitation.created_at)[:10], invitation.created_by_user_id, role)].append(invitation)
    for (_, by, role), rows in invited.items():
        entries.append({"kind": "invited", "at": _iso(rows[-1].created_at), "role": role, "count": len(rows), "by": people.person(db, by) if by else None,
                        "pending": sum(1 for row in rows if row.status == "pending")})
    entries.sort(key=lambda entry: entry["at"] or "")
    return entries[-LOG_LIMIT:]


def org_thread(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The organization's own thread: a log nobody writes in."""
    roles.require_staff(db, current_user.id, org_id)
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"kind": ORG, "org": {"id": org.id, "name": org.name, "slug": org.slug, "logo_image": org.logo_image}, "can_post": False, "entries": org_log(db, org_id)}


def _org_row(db: Session, org_id: int) -> dict:
    org = db.get(Organization, org_id)
    log = org_log(db, org_id)
    last = log[-1] if log else None
    return {"key": ORG, "kind": ORG, "title": org.name if org else "", "at": last["at"] if last else None, "preview": _log_line(last) if last else ""}


def _log_line(entry: dict) -> str:
    name = lambda person: (person or {}).get("name") or "Someone"  # noqa: E731
    if entry["kind"] == "org_created":
        return "The organization was created"
    if entry["kind"] == "staff_joined":
        return f"{name(entry['person'])} joined as {entry['role']}"
    if entry["kind"] == "learners_joined":
        return f"{entry['count']} learner{'s' if entry['count'] != 1 else ''} joined"
    return f"{name(entry['by'])} invited {entry['count']} {entry['role']}{'s' if entry['count'] != 1 and entry['role'] == 'learner' else ''}"


def pinned(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    """The rows on top of every staff member's Threads list: the all-staff room and the organization."""
    viewer = int(current_user.id)  # type: ignore[arg-type]
    rows = [_room_row(db, org_id, viewer), _org_row(db, org_id)]
    db.commit()
    return rows

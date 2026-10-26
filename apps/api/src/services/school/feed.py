"""People as one list: whoever has something new for the viewer on top, then everyone else A to Z.

The top ("active") merges the viewer's chats with the organization's people and groups, their
students' chats with the organization, steps turned in on plans they review, and, for admins,
helpers waiting on approval. Each source is one query (or one grouped query), so the list costs the
same however many students the viewer has. The top is capped; the rest is paged.

A person's activity (helpers waiting on approval, steps waiting on the viewer) shows as cards in
their conversation; it's merged at read time, so nothing new is stored.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import String, and_, func, literal, or_, union_all
from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.goals import Goal, GoalAssignment, GoalStatus, GoalStep, GoalTemplate, StepCompleter, StepProgress, StepStatus
from src.db.goal_sharing import PlanCollaborator, PlanInvitation
from src.db.school import UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin
from src.security.superadmin import is_user_superadmin
from src.services.connect import chats, people
from src.services.goals import access, helper_requests
from src.services.goals.sharing_roles import _now
from src.services.school import chats as school_chats, directory, group_chats, plan_requests, roles

ACTIVE_CAP = 30
PAGE = directory.PAGE
NEW_GROUP_DAYS = 7


def _admin(db: Session, user_id: int, org_id: int) -> bool:
    return is_org_admin(user_id, org_id, db) or is_user_superadmin(user_id, db)


def _value(item) -> str:
    return getattr(item, "value", item)


# Sources ---------------------------------------------------------------------------------

def turn_ins(db: Session, viewer_id: int, org_id: int, subject_id: int | None = None) -> list[tuple[Goal, GoalStep, StepProgress]]:
    """Learner steps turned in and waiting on review, on assigned plans the viewer reviews (never their own).

    One query for the candidates; the review capability is checked once per goal that has any.
    """
    on_plan = select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == viewer_id, PlanCollaborator.active == True)  # noqa: E712
    query = select(Goal, GoalStep, StepProgress).join(GoalStep, GoalStep.goal_id == Goal.id).join(StepProgress, StepProgress.step_id == GoalStep.id).where(
        Goal.org_id == org_id, col(Goal.assignment_id).is_not(None), Goal.status == GoalStatus.ACTIVE.value, Goal.subject_user_id != viewer_id,
        or_(Goal.owner_user_id == viewer_id, col(Goal.id).in_(on_plan)), StepProgress.status == StepStatus.SUBMITTED.value,
    )
    if subject_id is not None:
        query = query.where(Goal.subject_user_id == subject_id)
    reviewer: dict[int, bool] = {}
    found = []
    for goal, step, progress in db.exec(query.order_by(col(StepProgress.update_date))).all():
        if _value(step.completed_by) != StepCompleter.LEARNER.value:
            continue
        if goal.id not in reviewer:
            from src.services.goals.review import REVIEW

            reviewer[int(goal.id)] = REVIEW in access.capabilities(db, goal, viewer_id)  # type: ignore[arg-type]
        if reviewer[int(goal.id)]:  # type: ignore[arg-type]
            found.append((goal, step, progress))
    return found


def waiting_helpers(db: Session, org_id: int, user_id: int | None = None) -> list[tuple[PlanInvitation, Goal]]:
    """Helper invitations waiting on an admin; about one person (the learner, or the helper themselves) when given."""
    query = select(PlanInvitation, Goal).join(Goal, Goal.id == PlanInvitation.goal_id).where(Goal.org_id == org_id, PlanInvitation.status == helper_requests.AWAITING)
    if user_id is not None:
        query = query.where(or_(Goal.subject_user_id == user_id, PlanInvitation.target_user_id == user_id))
    return list(db.exec(query.order_by(col(PlanInvitation.id))).all())


def _school_chats(db: Session, viewer_id: int, org_id: int) -> list[tuple[int, Conversation]]:
    """The chats with this organization of the viewer's students (those in groups they staff), as (student, chat).

    These are the chats Message opens for them, as in ``connect.chats.open_direct``.
    """
    students = school_chats.students_of(db, org_id, viewer_id)
    if not students:
        return []
    rows = db.exec(select(Conversation).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).where(
        Conversation.kind == school_chats.SCHOOL, Conversation.org_id == org_id, ConversationMember.user_id == viewer_id,
    )).all()
    found = []
    for conversation in rows:
        parts = (conversation.direct_key or "").split(":")
        if len(parts) == 3 and parts[2].isdigit() and int(parts[2]) in students:
            found.append((int(parts[2]), conversation))
    return found


def _unread(db: Session, viewer_id: int, conversation_ids: list[int]) -> dict[int, int]:
    """Messages from others since the viewer last read, per chat, in one grouped query."""
    if not conversation_ids:
        return {}
    rows = db.exec(select(ConversationMessage.conversation_id, func.count()).join(ConversationMember, and_(
        ConversationMember.conversation_id == ConversationMessage.conversation_id, ConversationMember.user_id == viewer_id,
    )).where(
        col(ConversationMessage.conversation_id).in_(conversation_ids), col(ConversationMessage.sender_user_id).is_distinct_from(viewer_id),
        or_(col(ConversationMember.last_read_at).is_(None), ConversationMessage.update_date > ConversationMember.last_read_at),
    ).group_by(ConversationMessage.conversation_id)).all()
    return {int(conversation_id): int(count) for conversation_id, count in rows}


# The list --------------------------------------------------------------------------------

def _plural(count: int, one: str, many: str) -> str:
    return one if count == 1 else many.format(count)


def _preview(row: dict) -> str:
    counts = row["counts"]
    parts = []
    if counts["turn_ins"]:
        parts.append(_plural(counts["turn_ins"], f"Turned in “{row['_step_title']}”", "Turned in {} steps"))
    if counts["approvals"]:
        parts.append(_plural(counts["approvals"], row["_approval"], "{} requests to answer"))
    if counts["messages"] and (parts or not row["_last"]):
        parts.append(_plural(counts["messages"], "1 new message", "{} new messages"))
    if parts:
        return " · ".join(parts)
    return row["_last"] or ""


def _last_line(message: dict | None, group: bool) -> str:
    if not message:
        return ""
    text = message.get("preview") or message.get("body") or ""
    card = message.get("card") or {}
    if card.get("type") == group_chats.EVENT:
        # A line about what happened, which already names who did it.
        return f"You {card['verb']}" if message.get("mine") and card.get("verb") else text
    if message.get("mine"):
        return f"You: {text}"
    sender = (message.get("sender") or {}).get("name")
    return f"{sender}: {text}" if group and sender else text


def _matches(needle: str, *values: str | None) -> bool:
    return not needle or any(needle in (value or "").lower() for value in values)


def active_rows(db: Session, current_user: PublicUser, org_id: int, needle: str = "", admin: bool | None = None) -> tuple[list[dict], bool]:
    """Everyone with something for the viewer, newest first, then their other recent chats; capped. Also whether groups are on."""
    viewer = int(current_user.id)  # type: ignore[arg-type]
    admin = _admin(db, viewer, org_id) if admin is None else admin
    listed = directory.chat_list(db, current_user, org_id)
    rows: dict[str, dict] = {}

    def row(kind: str, item_id: int) -> dict:
        key = f"{kind}:{item_id}"
        return rows.setdefault(key, {"key": key, "kind": kind, "_id": item_id, "counts": {"messages": 0, "turn_ins": 0, "approvals": 0},
                                     "at": "", "chat_uuid": None, "_last": "", "_last_at": "", "_step_title": "", "_approval": "", "group": None})

    def touch(entry: dict, at: str | None) -> None:
        if at and at > entry["at"]:
            entry["at"] = at

    for chat in listed["chats"]:
        if chat["kind"] == group_chats.GROUP:
            entry = row("group", int(chat["group_id"]))
            entry["group"] = {"id": chat["group_id"], "name": chat["title"], "member_count": chat["member_count"]}
        elif chat["people"]:
            entry = row("person", int(chat["people"][0]["id"]))
            entry["_person"] = chat["people"][0]
        else:
            continue
        entry["counts"]["messages"] += int(chat["unread"] or 0) + (1 if chat["status"] == "request" and not chat["unread"] else 0)
        entry["chat_uuid"] = chat["conversation_uuid"]
        if (chat["last_message_at"] or "") >= entry["_last_at"]:
            entry["_last_at"], entry["_last"] = chat["last_message_at"] or "", _last_line(chat.get("last_message"), chat["kind"] == group_chats.GROUP)
        touch(entry, chat["last_message_at"])

    if listed["groups_enabled"]:
        # A group the viewer just created stays near the top for a while, even when they aren't in its chat.
        since = (_now() - timedelta(days=NEW_GROUP_DAYS)).isoformat()
        for group_id, conversation in group_chats.created_by(db, org_id, viewer, since):
            group = None if f"group:{group_id}" in rows else db.get(UserGroup, group_id)
            if not group:
                continue
            entry = row("group", group_id)
            entry["group"] = _group_rows(db, [group])[0]["group"]
            last = chats._last(db, conversation, viewer)
            entry["_last_at"], entry["_last"] = conversation.last_message_at or "", _last_line(chats._message_dict(db, last, viewer) if last else None, True)
            touch(entry, conversation.last_message_at)

    school = [(student, conversation) for student, conversation in _school_chats(db, viewer, org_id) if conversation.last_message_at]
    unread = _unread(db, viewer, [int(conversation.id) for _, conversation in school])  # type: ignore[arg-type]
    for student, conversation in school:
        entry = row("person", student)
        entry["counts"]["messages"] += unread.get(int(conversation.id), 0)  # type: ignore[arg-type]
        entry["chat_uuid"] = conversation.conversation_uuid
        entry["_school"] = conversation
        touch(entry, conversation.last_message_at)

    for goal, step, progress in turn_ins(db, viewer, org_id):
        entry = row("person", int(goal.subject_user_id))  # type: ignore[arg-type]
        entry["counts"]["turn_ins"] += 1
        entry["_step_title"] = step.title
        touch(entry, progress.update_date)

    if admin:
        for invitation, goal in waiting_helpers(db, org_id):
            if not goal.subject_user_id:
                continue
            entry = row("person", int(goal.subject_user_id))
            entry["counts"]["approvals"] += 1
            helper = people.person(db, invitation.target_user_id) if invitation.target_user_id else None
            entry["_approval"] = f"{(helper or {}).get('name') or 'A helper'} asks to help on “{goal.title}”"
            touch(entry, invitation.creation_date)

    applicants: set[int] = set()
    if admin or plan_requests.can_decide(db, viewer, org_id):
        for request in plan_requests.waiting(db, org_id):
            entry = row("person", int(request.user_id))
            entry["counts"]["approvals"] += 1
            template = db.get(GoalTemplate, request.template_id)
            entry["_approval"] = f"Asks for “{template.title if template else 'a plan'}”"
            applicants.add(int(request.user_id))
            touch(entry, request.creation_date)

    members = {int(user_id): int(role_id) for user_id, role_id in db.exec(select(UserOrganization.user_id, UserOrganization.role_id).where(UserOrganization.org_id == org_id)).all()}
    staff_roles = roles.staff_role_ids(db, org_id)
    found = []
    for entry in rows.values():
        if entry["kind"] == "person":
            if entry["_id"] == viewer:
                continue
            person = entry.get("_person") or people.person(db, entry["_id"])
            if not person:
                continue
            role_id = members.get(entry["_id"])
            entry.update(person=person, role=directory._label(role_id, staff_roles) if role_id is not None else plan_requests.APPLICANT if entry["_id"] in applicants else "helper")
            name_fields = (person.get("name"), person.get("username"))
        else:
            entry.update(person=None, role=None)
            name_fields = ((entry["group"] or {}).get("name"), None)
        if not _matches(needle, *name_fields):
            continue
        entry["total"] = sum(entry["counts"].values())
        found.append(entry)
    # Anything new first, newest first; then the rest of the viewer's recent chats.
    found.sort(key=lambda item: (item["total"] > 0, item["at"] or ""), reverse=True)
    found = found[:ACTIVE_CAP]
    for entry in found:
        school_chat = entry.pop("_school", None)
        if school_chat is not None and (school_chat.last_message_at or "") >= entry["_last_at"]:
            last = chats._last(db, school_chat, viewer)
            entry["_last"] = _last_line(chats._message_dict(db, last, viewer) if last else None, True)
        entry["preview"] = _preview(entry)
        for key in [key for key in entry if key.startswith("_")]:
            entry.pop(key)
    return found, bool(listed["groups_enabled"])


def _group_rows(db: Session, groups: list[UserGroup]) -> list[dict]:
    ids = [int(group.id) for group in groups]  # type: ignore[arg-type]
    if not ids:
        return []
    members = dict(db.exec(select(UserGroupUser.usergroup_id, func.count()).where(col(UserGroupUser.usergroup_id).in_(ids)).group_by(UserGroupUser.usergroup_id)).all())
    staff = dict(db.exec(select(UserGroupStaff.usergroup_id, func.count()).where(col(UserGroupStaff.usergroup_id).in_(ids)).group_by(UserGroupStaff.usergroup_id)).all())
    return [{"key": f"group:{group.id}", "kind": "group", "person": None, "role": None,
             "group": {"id": group.id, "name": group.name, "member_count": int(members.get(group.id, 0)), "staff_count": int(staff.get(group.id, 0))}} for group in groups]


def everyone_else(db: Session, current_user: PublicUser, org_id: int, needle: str, skip: set[str], groups_on: bool, admin: bool,
                  offset: int = 0, limit: int = PAGE, status: str = "active", kind: str = "all") -> dict:
    """The organization's people and groups A to Z, without the viewer and whoever is already on top, one page at a time.

    Alumni are left out unless ``status`` is "alumni" (only them, and no groups) or "all".
    """
    viewer = int(current_user.id)  # type: ignore[arg-type]
    skip_people = [int(key.split(":")[1]) for key in skip if key.startswith("person:")] + [viewer]
    skip_groups = [int(key.split(":")[1]) for key in skip if key.startswith("group:")]
    members = select(User.id.label("id"), literal("person", String).label("kind"), func.lower(func.coalesce(User.first_name, User.username)).label("sort")).join(  # type: ignore[union-attr]
        UserOrganization, UserOrganization.user_id == User.id).where(UserOrganization.org_id == org_id, col(User.id).not_in(skip_people))
    if status in ("active", "alumni"):
        members = members.where(UserOrganization.status == status)
    if needle:
        members = directory._like(members, needle)
    if kind in ("learners", "staff"):
        staff_roles = list(roles.staff_role_ids(db, org_id))
        members = members.where(col(UserOrganization.role_id).in_(staff_roles) if kind == "staff" else col(UserOrganization.role_id).not_in(staff_roles))
    parts = [members] if kind != "groups" else []
    if groups_on and status != "alumni" and kind in ("all", "groups"):
        groups = select(UserGroup.id.label("id"), literal("group", String).label("kind"), func.lower(UserGroup.name).label("sort")).where(  # type: ignore[union-attr]
            UserGroup.org_id == org_id, col(UserGroup.id).not_in(skip_groups or [0]))
        if not admin:
            groups = groups.where(col(UserGroup.id).in_([int(group.id) for group in group_chats.groups_of(db, org_id, viewer)] or [0]))  # type: ignore[arg-type]
        if needle:
            groups = groups.where(col(UserGroup.name).ilike(f"%{needle}%"))
        parts.append(groups)
    if not parts:
        return {"rest": [], "total": 0, "offset": offset, "limit": limit}
    listed = (union_all(*parts) if len(parts) > 1 else parts[0]).subquery()
    total = int(db.exec(select(func.count()).select_from(listed)).one())  # type: ignore[call-overload]
    page = db.exec(select(listed.c.kind, listed.c.id).order_by(listed.c.sort, listed.c.kind, listed.c.id).offset(max(offset, 0)).limit(limit)).all()  # type: ignore[call-overload]
    user_ids = [int(item_id) for kind, item_id in page if kind == "person"]
    group_ids = [int(item_id) for kind, item_id in page if kind == "group"]
    users = {int(user.id): (user, int(role_id)) for user, role_id in db.exec(select(User, UserOrganization.role_id).join(  # type: ignore[arg-type]
        UserOrganization, UserOrganization.user_id == User.id).where(UserOrganization.org_id == org_id, col(User.id).in_(user_ids))).all()} if user_ids else {}
    person_rows = {int(item["user"]["id"]): item for item in directory.person_rows(db, org_id, list(users.values()))}
    group_rows = {int(item["group"]["id"]): item for item in _group_rows(db, list(db.exec(select(UserGroup).where(col(UserGroup.id).in_(group_ids))).all()))} if group_ids else {}
    rest = []
    for kind, item_id in page:
        if kind == "person" and int(item_id) in person_rows:
            item = person_rows[int(item_id)]
            rest.append({"key": f"person:{item_id}", "kind": "person", "person": item["user"], "role": item["role"], "role_name": item["role_name"], "groups": item["groups"],
                         "status": item["status"], "group": None})
        elif kind == "group" and int(item_id) in group_rows:
            rest.append(group_rows[int(item_id)])
    if needle and offset == 0 and status != "alumni" and kind in ("all", "learners"):
        rest.extend({"key": f"person:{item['user']['id']}", "kind": "person", "person": item["user"], "role": "helper", "role_name": "Helper", "groups": [],
                     "helping_on": item["helping_on"], "group": None} for item in directory.matching_helpers(db, org_id, needle) if f"person:{item['user']['id']}" not in skip)
    return {"rest": rest, "total": total, "offset": offset, "limit": limit}


KINDS = ("all", "learners", "staff", "groups")


def _of_kind(entry: dict, kind: str) -> bool:
    if kind == "groups":
        return entry["kind"] == "group"
    if kind == "staff":
        return entry["kind"] == "person" and entry.get("role") in roles.STAFF_ROLES
    if kind == "learners":
        return entry["kind"] == "person" and entry.get("role") not in roles.STAFF_ROLES
    return True


def people_feed(db: Session, current_user: PublicUser, org_id: int, query: str = "", offset: int = 0, limit: int = PAGE, status: str = "active",
                kind: str = "all") -> dict:
    """Threads' list: ``active`` (who has something for you, on the first page only) and ``rest`` (everyone else A to Z, paged).

    ``status`` "alumni" lists only alumni (A to Z, nothing on top); "all" lists alumni with everyone else. ``kind`` keeps only
    learners, staff or groups. ``pinned`` holds the all-staff room and the organization's own thread, on the first page of the
    whole list or of staff.
    """
    from src.services.school import threads

    roles.require_staff(db, current_user.id, org_id)
    needle = (query or "").strip().lstrip("@").lower()
    limit = max(1, min(limit, 100))
    admin = _admin(db, int(current_user.id), org_id)  # type: ignore[arg-type]
    # The top doesn't move between pages, so later pages skip the same people.
    active, groups_on = active_rows(db, current_user, org_id, needle, admin)
    if status == "alumni":
        active = []
    active = [entry for entry in active if _of_kind(entry, kind)]
    rest = everyone_else(db, current_user, org_id, needle, {item["key"] for item in active}, groups_on, admin, offset, limit, status, kind)
    pinned = threads.pinned(db, current_user, org_id) if offset == 0 and not needle and status != "alumni" and kind in ("all", "staff") else []
    # Groups stay listed after a Full trial ends, but nobody can make new ones.
    enabled = groups_on and group_chats.enabled(db, org_id)
    return {"pinned": pinned, "active": active if offset == 0 else [], **rest, "groups_enabled": enabled, "groups_read_only": groups_on and not enabled, "is_admin": admin}


# A person's activity cards ---------------------------------------------------------------

def person_activity(db: Session, current_user: PublicUser, org_id: int, username: str) -> dict:
    """What waits on the viewer about someone, for cards in their conversation: helpers to approve (admins) and steps to review."""
    roles.require_staff(db, current_user.id, org_id)
    user = db.exec(select(User).where(User.username == username)).first()
    if not user or not roles.org_role(db, org_id, int(user.id)):  # type: ignore[arg-type]
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Person not found")
    admin = _admin(db, int(current_user.id), org_id)  # type: ignore[arg-type]
    approvals = [helper_requests._dict(db, invitation, goal) for invitation, goal in waiting_helpers(db, org_id, int(user.id))] if admin else []  # type: ignore[arg-type]
    assignments: dict[int, GoalAssignment | None] = {}
    steps = []
    for goal, step, progress in turn_ins(db, int(current_user.id), org_id, int(user.id)):  # type: ignore[arg-type]
        if goal.assignment_id not in assignments:
            assignments[int(goal.assignment_id)] = db.get(GoalAssignment, goal.assignment_id)  # type: ignore[arg-type]
        assignment = assignments[int(goal.assignment_id)]  # type: ignore[arg-type]
        steps.append({"goal_uuid": goal.goal_uuid, "plan_title": goal.title, "step_uuid": step.step_uuid, "step_key": step.template_key, "step_title": step.title,
                      "assignment_uuid": assignment.assignment_uuid if assignment else None, "submitted_at": progress.update_date or goal.creation_date})
    return {"approvals": approvals, "turn_ins": steps, "can_approve": admin}


# A group's header ------------------------------------------------------------------------

def group_detail(db: Session, current_user: PublicUser, org_id: int, group_id: int) -> dict:
    """A group as People's header shows it: its name, its staff and members (staff first), and what the viewer can do."""
    from fastapi import HTTPException

    roles.require_staff(db, current_user.id, org_id)
    group = db.get(UserGroup, group_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    viewer = int(current_user.id)  # type: ignore[arg-type]
    admin = _admin(db, viewer, org_id)
    inside = viewer in group_chats.people_of(db, group_id)
    if not admin and not inside:
        raise HTTPException(status_code=404, detail="Group not found")
    staff_ids = [int(item) for item in db.exec(select(UserGroupStaff.user_id).where(UserGroupStaff.usergroup_id == group_id).order_by(col(UserGroupStaff.id))).all()]
    member_ids = [int(item) for item in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group_id).order_by(col(UserGroupUser.id))).all()]
    memberships = db.exec(select(UserOrganization.user_id, UserOrganization.role_id, UserOrganization.status).where(
        UserOrganization.org_id == org_id, col(UserOrganization.user_id).in_([*staff_ids, *member_ids] or [0]))).all()
    org_roles = {int(user_id): int(role_id) for user_id, role_id, _ in memberships}
    statuses = {int(user_id): status or "active" for user_id, _, status in memberships}
    staff_roles = roles.staff_role_ids(db, org_id)

    def entry(user_id: int, as_: str) -> dict | None:
        person = people.person(db, user_id)
        role_id = org_roles.get(user_id)
        return {"user": person, "as": as_, "role": directory._label(role_id, staff_roles) if role_id is not None else "learner",
                "status": statuses.get(user_id, "active")} if person else None

    staff = [item for item in (entry(user_id, "staff") for user_id in staff_ids) if item]
    seen = set(staff_ids)
    members = [item for item in (entry(user_id, "member") for user_id in member_ids if user_id not in seen) if item]
    # Staff first: group staff, then members whose org role is staff, then learners.
    members.sort(key=lambda item: item["role"] not in roles.STAFF_ROLES)
    learners = sum(1 for item in members if item["role"] == "learner")
    alumni = sum(1 for item in members if item["role"] == "learner" and item["status"] == "alumni")
    return {"id": group.id, "name": group.name, "description": group.description, "people": [*staff, *members],
            "learner_count": learners, "alumni_count": alumni, "staff_count": len(staff) + len(members) - learners,
            "can_manage": admin, "can_set_status": is_org_admin(viewer, org_id, db, "manage_learners"),
            "in_chat": inside, "groups_enabled": group_chats.enabled(db, org_id)}

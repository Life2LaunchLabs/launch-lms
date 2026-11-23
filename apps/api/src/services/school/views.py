"""What staff see in Users: a student's school team and chat, and who's waiting on them."""

from __future__ import annotations


from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import ConversationMember, ConversationMessage
from src.db.goals import CURRENT_ASSIGNMENT_STATUSES, Goal, GoalAssignment, GoalStatus, GoalStep, StepProgress, StepStatus
from src.db.goal_sharing import PlanCollaborator, PlanRole
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin
from src.services.connect import chats, people, visibility
from src.services.goals.assignment_staff import assignment_role
from src.services.goals.assignment_summary import collaborators_of
from src.services.goals.sharing_roles import org_summary
from src.services.school import chats as school_chats
from src.services.school import roles as school_roles

ROLE_NAMES = {"viewer": "Viewer", "commenter": "Commenter", "editor": "Editor"}
PLAN_ROLE_NAMES = {"lead": "Lead", "review": "Review", "comment": "Comment"}


def _can_see(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> bool:
    return is_org_admin(current_user.id, org_id, db) or student_id in school_chats.students_of(db, org_id, current_user.id)


def _require(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> User:
    student = db.get(User, student_id)
    if not student or not _can_see(db, current_user, org_id, student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    return student


def _plan_team(db: Session, org_id: int, student_id: int) -> list[tuple[int, Goal, str, str]]:
    """(staff id, goal, role key, role name) for the staff on the student's open plans with this organization.

    An assigned plan's staff come from its assignment (Lead, Review, Comment): the person who assigns it
    owns the learner's goal rather than joining it, so a Lead who assigned it isn't a collaborator on it.
    Staff added to a plan another way show with their plan role.
    """
    goals = db.exec(select(Goal).where(Goal.org_id == org_id, Goal.subject_user_id == student_id,
                                       col(Goal.status).in_([GoalStatus.PENDING.value, GoalStatus.ACTIVE.value])).order_by(col(Goal.id))).all()
    if not goals:
        return []
    staff = school_roles.staff_ids(db, org_id)
    rows: list[tuple[int, Goal, str, str]] = []
    for goal in goals:
        seen: set[int] = set()
        assignment = db.get(GoalAssignment, goal.assignment_id) if goal.assignment_id else None
        if assignment and assignment.status in CURRENT_ASSIGNMENT_STATUSES:
            for item in collaborators_of(assignment):
                user_id, role = int(item["user_id"]), assignment_role(item.get("role_key")) or "review"
                if user_id in staff and user_id != student_id and user_id not in seen:
                    seen.add(user_id)
                    rows.append((user_id, goal, role, PLAN_ROLE_NAMES.get(role, role)))
        members = db.exec(select(PlanCollaborator, PlanRole).join(PlanRole, col(PlanRole.id) == col(PlanCollaborator.role_id))
                          .where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.active == True)).all()  # noqa: E712
        for member, plan_role in members:
            if member.user_id in staff and member.user_id != student_id and member.user_id not in seen:
                seen.add(member.user_id)
                rows.append((member.user_id, goal, plan_role.key, plan_role.name))
    return rows


def team_of(db: Session, org_id: int, student_id: int) -> list[dict]:
    """Each staff member once, with their role per group and on each of the student's open plans (DEV-207)."""
    groups = {group.id: group.name for group in db.exec(select(UserGroup).where(col(UserGroup.id).in_(school_chats.student_groups(db, org_id, student_id)))).all()}
    people_by_id: dict[int, dict] = {}

    def entry(user_id: int) -> dict:
        return people_by_id.setdefault(user_id, {"user": people.person(db, user_id), "groups": [], "plans": []})

    for row in school_chats.team(db, org_id, student_id):
        entry(row.user_id)["groups"].append({"group_id": row.usergroup_id, "name": groups.get(row.usergroup_id, ""), "role_key": row.role_key, "role": ROLE_NAMES.get(row.role_key, row.role_key)})
    for user_id, goal, role_key, role in _plan_team(db, org_id, student_id):
        entry(user_id)["plans"].append({"goal_uuid": goal.goal_uuid, "title": goal.title, "role_key": role_key, "role": role})
    return [item for item in people_by_id.values() if item["user"]]


def student_chat(db: Session, current_user: PublicUser, org_id: int, student_id: int, before: str | None = None, goal_uuid: str | None = None, step_uuid: str | None = None,
                 audience: str | None = None) -> dict:
    """The learner's chat with the organization: to read, filtered by plan or step, and to write in if you're in it."""
    _require(db, current_user, org_id, student_id)
    conversation = school_chats.school_chat(db, org_id, student_id)
    db.commit()
    member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id)).first()
    if member:
        return chats.get_chat(db, current_user, conversation.conversation_uuid, before, goal_uuid, step_uuid, audience)
    # Admins who aren't in the chat can read it but don't post in it.
    return {"conversation_uuid": conversation.conversation_uuid, "kind": conversation.kind, "title": conversation.title,
            "people": [item for item in (people.person(db, row.user_id) for row in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()) if item],
            "status": "active", "accepted": True, "waiting_for_them": False, "unavailable": False, "unread": 0, "last_message": None,
            "last_message_at": conversation.last_message_at, "can_post": False, "org": org_summary(db, org_id),
            **chats.messages_of(db, conversation, current_user.id, before, goal_uuid, step_uuid, audience)}


def student(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> dict:
    """The student's team. Their chat, staff-only messages and all, comes from student_chat."""
    _require(db, current_user, org_id, student_id)
    return {"student": people.person(db, student_id), "team": team_of(db, org_id, student_id)}


def _reviews(db: Session, org_id: int, student_id: int, staff_id: int | None) -> int:
    """Steps the student turned in that wait on review, on goals this staff member works on (or any, for admins)."""
    goals = select(Goal.id).where(Goal.org_id == org_id, Goal.subject_user_id == student_id)
    if staff_id is not None:
        goals = goals.where(col(Goal.id).in_(select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == staff_id, PlanCollaborator.active == True)))  # noqa: E712
    steps = select(GoalStep.id).where(col(GoalStep.goal_id).in_(goals))
    query = select(func.count()).select_from(StepProgress).where(col(StepProgress.step_id).in_(steps), StepProgress.status == StepStatus.SUBMITTED.value)
    return int(db.exec(query).one())


def _unanswered(db: Session, conversation, student_id: int) -> int:
    """For admins looking across staff: the student's messages since staff last wrote to them (staff-only notes don't answer)."""
    recent = db.exec(select(ConversationMessage.sender_user_id).where(ConversationMessage.conversation_id == conversation.id, ConversationMessage.kind == "text",
                                                                      ConversationMessage.visibility == visibility.ALL)
                     .order_by(col(ConversationMessage.creation_date).desc(), col(ConversationMessage.id).desc()).limit(chats.PAGE)).all()
    count = 0
    for sender in recent:
        if sender != student_id:
            break
        count += 1
    return count


def waiting(db: Session, current_user: PublicUser, org_id: int, mine: bool = True) -> dict:
    """Students with something for you: unread school chat messages, mentions, and work to review."""
    admin = is_org_admin(current_user.id, org_id, db)
    if not mine and not admin:
        raise HTTPException(status_code=403, detail="Only admins can see everyone's students")
    if mine:
        students = school_chats.students_of(db, org_id, current_user.id)
    else:
        # Students in every group that has staff.
        groups = list(set(db.exec(select(UserGroupStaff.usergroup_id).where(UserGroupStaff.org_id == org_id)).all()))
        students = {int(item) for item in db.exec(select(UserGroupUser.user_id).where(col(UserGroupUser.usergroup_id).in_(groups)).distinct()).all()} if groups else set()
    me = current_user.user_uuid
    rows = []
    for student_id in sorted(students):
        conversation = school_chats.find(db, org_id, student_id)
        member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id)).first() if conversation else None
        unread = _unanswered(db, conversation, student_id) if conversation and not mine else chats._unread(db, conversation, member) if conversation and member else 0
        mentions = 0
        if conversation and member:
            for card, refs in db.exec(select(ConversationMessage.card, ConversationMessage.refs).where(
                ConversationMessage.conversation_id == conversation.id, ConversationMessage.update_date > (member.last_read_at or ""),
            )).all():
                tagged = current_user.id in ((card or {}).get("mentioned_user_ids") or []) or any(ref.get("user_uuid") == me for ref in refs or [])
                mentions += int(tagged)
        reviews = _reviews(db, org_id, student_id, current_user.id if mine else None)
        if unread or mentions or reviews:
            last = chats._last(db, conversation, current_user.id) if conversation else None
            rows.append({"student": people.person(db, student_id), "unread": unread, "mentions": mentions, "reviews": reviews,
                         "last_message": chats._message_dict(db, last, current_user.id) if last else None})
    rows.sort(key=lambda row: (-row["mentions"], -row["unread"], -row["reviews"]))
    return {"mine": mine, "can_see_everyone": admin, "students": rows}

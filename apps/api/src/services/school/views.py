"""What staff see in Users: a student's school team, chat and notes, and who's waiting on them."""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, func, select

from src.db.conversations import ConversationMember, ConversationMessage
from src.db.goals import Goal, GoalStep, StepProgress, StepStatus
from src.db.planning import PlanCollaborator
from src.db.school import StaffNote, UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin
from src.services.connect import chats, people
from src.services.goals.sharing_roles import _stamp
from src.services.school import chats as school_chats

ROLE_NAMES = {"viewer": "Viewer", "commenter": "Commenter", "editor": "Editor"}


def _can_see(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> bool:
    return is_org_admin(current_user.id, org_id, db) or student_id in school_chats.students_of(db, org_id, current_user.id)


def _require(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> User:
    student = db.get(User, student_id)
    if not student or not _can_see(db, current_user, org_id, student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    return student


def team_of(db: Session, org_id: int, student_id: int) -> list[dict]:
    """Each staff member once, with their role per group."""
    groups = {group.id: group.name for group in db.exec(select(UserGroup).where(col(UserGroup.id).in_(school_chats.student_groups(db, org_id, student_id)))).all()}
    people_by_id: dict[int, dict] = {}
    for row in school_chats.team(db, org_id, student_id):
        entry = people_by_id.setdefault(row.user_id, {"user": people.person(db, row.user_id), "groups": []})
        entry["groups"].append({"group_id": row.usergroup_id, "name": groups.get(row.usergroup_id, ""), "role_key": row.role_key, "role": ROLE_NAMES.get(row.role_key, row.role_key)})
    return list(people_by_id.values())


def _notes(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> list[dict]:
    admin = is_org_admin(current_user.id, org_id, db)
    rows = db.exec(select(StaffNote).where(StaffNote.org_id == org_id, StaffNote.subject_user_id == student_id).order_by(col(StaffNote.id).desc())).all()
    return [{"note_uuid": row.note_uuid, "body": row.body, "author": people.person(db, row.author_user_id), "creation_date": row.creation_date,
             "can_delete": admin or row.author_user_id == current_user.id} for row in rows]


def student(db: Session, current_user: PublicUser, org_id: int, student_id: int) -> dict:
    """The student's school team, their school chat (to read, and to write in if you're on the team) and staff notes."""
    _require(db, current_user, org_id, student_id)
    conversation = school_chats.school_chat(db, org_id, student_id)
    db.commit()
    member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id)).first()
    if member:
        chat = chats.get_chat(db, current_user, conversation.conversation_uuid)
    else:
        # Admins who aren't on the team can read the chat but don't post in it.
        messages = db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == conversation.id)
                           .order_by(col(ConversationMessage.creation_date).desc(), col(ConversationMessage.id).desc()).limit(chats.PAGE)).all()
        chat = {"conversation_uuid": conversation.conversation_uuid, "kind": conversation.kind, "title": conversation.title,
                "messages": [chats._message_dict(db, item, current_user.id) for item in reversed(messages)]}
    return {
        "student": people.person(db, student_id), "team": team_of(db, org_id, student_id),
        "chat": {**chat, "can_post": member is not None}, "notes": _notes(db, current_user, org_id, student_id),
    }


def add_note(db: Session, current_user: PublicUser, org_id: int, student_id: int, body: str) -> list[dict]:
    _require(db, current_user, org_id, student_id)
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write a note first")
    now = _stamp()
    db.add(StaffNote(note_uuid=f"staff_note_{uuid4()}", org_id=org_id, subject_user_id=student_id, author_user_id=current_user.id, body=text, creation_date=now, update_date=now))
    db.commit()
    return _notes(db, current_user, org_id, student_id)


def delete_note(db: Session, current_user: PublicUser, org_id: int, student_id: int, note_uuid: str) -> list[dict]:
    _require(db, current_user, org_id, student_id)
    row = db.exec(select(StaffNote).where(StaffNote.org_id == org_id, StaffNote.subject_user_id == student_id, StaffNote.note_uuid == note_uuid)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    if row.author_user_id != current_user.id and not is_org_admin(current_user.id, org_id, db):
        raise HTTPException(status_code=403, detail="You can only delete your own notes")
    db.delete(row)
    db.commit()
    return _notes(db, current_user, org_id, student_id)


def _reviews(db: Session, org_id: int, student_id: int, staff_id: int | None) -> int:
    """Steps the student turned in that wait on review, on goals this staff member works on (or any, for admins)."""
    goals = select(Goal.id).where(Goal.org_id == org_id, Goal.subject_user_id == student_id)
    if staff_id is not None:
        goals = goals.where(col(Goal.id).in_(select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == staff_id, PlanCollaborator.active == True)))  # noqa: E712
    steps = select(GoalStep.id).where(col(GoalStep.goal_id).in_(goals))
    query = select(func.count()).select_from(StepProgress).where(col(StepProgress.step_id).in_(steps), StepProgress.status == StepStatus.SUBMITTED.value)
    return int(db.exec(query).one())


def _unanswered(db: Session, conversation, student_id: int) -> int:
    """For admins looking across staff: the student's messages since staff last wrote."""
    recent = db.exec(select(ConversationMessage.sender_user_id).where(ConversationMessage.conversation_id == conversation.id, ConversationMessage.kind == "text")
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
    rows = []
    for student_id in sorted(students):
        conversation = school_chats.find(db, org_id, student_id)
        member = db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == current_user.id)).first() if conversation else None
        unread = chats._unread(db, conversation, member) if conversation and member else _unanswered(db, conversation, student_id) if conversation and not mine else 0
        mentions = 0
        if conversation and member:
            for card in db.exec(select(ConversationMessage.card).where(ConversationMessage.conversation_id == conversation.id, ConversationMessage.kind == "card",
                                                                      ConversationMessage.update_date > (member.last_read_at or ""))).all():
                mentions += int(current_user.id in ((card or {}).get("mentioned_user_ids") or []))
        reviews = _reviews(db, org_id, student_id, current_user.id if mine else None)
        if unread or mentions or reviews:
            last = chats._last(db, conversation) if conversation else None
            rows.append({"student": people.person(db, student_id), "unread": unread, "mentions": mentions, "reviews": reviews,
                         "last_message": chats._message_dict(db, last, current_user.id) if last else None})
    rows.sort(key=lambda row: (-row["mentions"], -row["unread"], -row["reviews"]))
    return {"mine": mine, "can_see_everyone": admin, "students": rows}

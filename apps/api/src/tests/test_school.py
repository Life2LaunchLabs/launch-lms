"""The school side: staff on a group, students' school chats, staff notes, and who's waiting on staff."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import DirectChatOpen
from src.db.goals import Goal, GoalAssignmentCreate
from src.db.goal_sharing import PlanCollaborator
from src.db.school import GroupStaffSet
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.connect import chats
from src.services.goals import access, assignments
from src.services.school import chats as school_chats, feed, staff, views
from src.tests.test_goal_sharing import _session as _goal_session
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _published, _user

TEACHER = 4


def _session():
    db = _goal_session()
    db.add(User(id=TEACHER, user_uuid="user_4", username="teach", email="teach@example.com", first_name="Tess", last_name="Teacher", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=TEACHER, org_id=1, role_id=2, creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _assign(db, title: str = "Visit a campus") -> dict:
    template = _published(db, {"key": "visit", "type": "task", "title": title})
    return assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))


def _goal(db, user_id: int, assignment_uuid: str) -> Goal:
    from src.db.goals import GoalAssignment

    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid)).one()
    return db.exec(select(Goal).where(Goal.assignment_id == assignment.id, Goal.subject_user_id == user_id)).one()


def _staff(db, **extra) -> dict:
    return staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=TEACHER, **extra))


def test_group_staff_join_the_goals_they_cover_and_each_students_school_chat():
    with _session() as db:
        first = _assign(db)["assignment_uuid"]
        second = _assign(db, "Write an essay")["assignment_uuid"]
        # Only the organization's staff are offered, and only until they're added.
        assert "teach" in {item["username"] for item in staff.list_staff(db, _user(ADMIN), 1, 1)["candidates"]}
        assert "lee" not in {item["username"] for item in staff.list_staff(db, _user(ADMIN), 1, 1)["candidates"]}
        listed = _staff(db, role_key="commenter")
        assert [(item["user"]["username"], item["all_goals"], item["goal_count"]) for item in listed["staff"]] == [("teach", True, 2)]
        assert "teach" not in {item["username"] for item in listed["candidates"]}
        granted = access.capabilities(db, _goal(db, LEARNER, first), TEACHER)
        assert "comment" in granted and "edit_structure" not in granted
        chat = school_chats.find(db, 1, LEARNER)
        assert chat.title == "Studio" and {member["username"] for member in chats.get_chat(db, _user(TEACHER), chat.conversation_uuid)["people"]} == {"lee", "teacher"}
        # Narrowed to one goal: they come off the other.
        _staff(db, role_key="editor", assignment_uuids=[first])
        assert "edit_schedule" in access.capabilities(db, _goal(db, OTHER, first), TEACHER)
        assert "view_plan" not in access.capabilities(db, _goal(db, OTHER, second), TEACHER)
        # Goals assigned later get them too.
        later = _assign(db, "Shadow a nurse")["assignment_uuid"]
        assert "view_plan" not in access.capabilities(db, _goal(db, LEARNER, later), TEACHER)
        _staff(db, role_key="viewer")
        third = _assign(db, "Tour a hospital")["assignment_uuid"]
        assert "view_plan" in access.capabilities(db, _goal(db, LEARNER, third), TEACHER)
        staff.remove_staff(db, _user(ADMIN), 1, 1, TEACHER)
        assert not db.exec(select(PlanCollaborator).where(PlanCollaborator.user_id == TEACHER, PlanCollaborator.active == True)).all()  # noqa: E712
        with pytest.raises(HTTPException):
            chats.get_chat(db, _user(TEACHER), chat.conversation_uuid)


def test_only_admins_set_staff_and_only_org_staff_can_be_staff():
    with _session() as db:
        with pytest.raises(HTTPException) as student:
            staff.set_staff(db, _user(ADMIN), 1, 1, GroupStaffSet(user_id=OTHER))
        assert student.value.status_code == 422
        with pytest.raises(HTTPException) as not_admin:
            staff.set_staff(db, _user(OTHER), 1, 1, GroupStaffSet(user_id=TEACHER))
        assert not_admin.value.status_code == 403


def test_staff_and_students_talk_in_the_school_chat_and_mentions_wait_on_staff():
    with _session() as db:
        uuid = _assign(db)["assignment_uuid"]
        _staff(db, role_key="commenter")
        opened = chats.open_direct(db, _user(TEACHER), DirectChatOpen(handle="lee"))
        assert opened["kind"] == "school" and opened["conversation_uuid"] == school_chats.find(db, 1, LEARNER).conversation_uuid
        goal = _goal(db, LEARNER, uuid)
        chats.send(db, _user(LEARNER), opened["conversation_uuid"], f"<user:user_4> is <plan:{goal.goal_uuid}> ok?")
        school = chats.get_chat(db, _user(TEACHER), opened["conversation_uuid"])
        assert school["last_message"]["preview"] == "@Tess Teacher is College ready ok?"
        waiting = views.waiting(db, _user(TEACHER), 1)
        assert [(row["student"]["username"], row["unread"], row["mentions"]) for row in waiting["students"]] == [("lee", 1, 1)]
        chats.mark_read(db, _user(TEACHER), opened["conversation_uuid"])
        assert views.waiting(db, _user(TEACHER), 1)["students"] == []
        # Admins looking across staff see students whose messages nobody on staff has answered.
        chats.send(db, _user(LEARNER), opened["conversation_uuid"], "Hello?")
        everyone_rows = views.waiting(db, _user(ADMIN), 1, mine=False)["students"]
        assert [(row["student"]["username"], row["unread"]) for row in everyone_rows] == [("lee", 2)]
        # A staff-only note about Lee doesn't answer Lee.
        chats.send(db, _user(TEACHER), opened["conversation_uuid"], "Following up tomorrow", staff_only=True)
        assert [row["unread"] for row in views.waiting(db, _user(ADMIN), 1, mine=False)["students"]] == [2]
        chats.send(db, _user(TEACHER), opened["conversation_uuid"], "Hi Lee")
        assert views.waiting(db, _user(ADMIN), 1, mine=False)["students"] == []
        with pytest.raises(HTTPException) as everyone:
            views.waiting(db, _user(OTHER), 1, mine=False)
        assert everyone.value.status_code == 403


def test_a_students_page_shows_their_team_and_chat_with_staff_only_messages():
    with _session() as db:
        _assign(db)
        _staff(db, role_key="commenter")
        seen = views.student(db, _user(ADMIN), 1, LEARNER)
        assert [(item["user"]["username"], item["groups"][0]["role"]) for item in seen["team"]] == [("teach", "Commenter")]
        # Admins with a role on the student's plans are in their chat; other admins only read it.
        assert views.student_chat(db, _user(ADMIN), 1, LEARNER)["can_post"] is True
        chat = views.student_chat(db, _user(TEACHER), 1, LEARNER)
        assert chat["can_post"] is True and chat["can_post_staff_only"] is True
        chats.send(db, _user(TEACHER), chat["conversation_uuid"], "Talked about nursing programs", staff_only=True)
        assert [m["body"] for m in views.student_chat(db, _user(ADMIN), 1, LEARNER, audience="staff")["messages"]] == ["Talked about nursing programs"]
        assert chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])["messages"] == []
        with pytest.raises(HTTPException) as classmate:
            views.student(db, _user(OTHER), 1, LEARNER)
        assert classmate.value.status_code == 404


def test_what_waits_on_staff_is_the_top_of_their_people_feed(monkeypatch):
    # A free org that isn't the owner org, so groups (and their chats) are off.
    monkeypatch.setattr("src.security.access.access.owner_org_id", lambda *_args: None)
    with _session() as db:
        _assign(db)
        _staff(db, role_key="commenter")
        opened = chats.open_direct(db, _user(TEACHER), DirectChatOpen(handle="lee"))
        chats.send(db, _user(LEARNER), opened["conversation_uuid"], "<user:user_4> can you look at this?")
        waiting = views.waiting(db, _user(TEACHER), 1)["students"]
        top = feed.people_feed(db, _user(TEACHER), 1)["active"]
        # The same students, with the same new messages, and a preview of the latest.
        assert [(row["student"]["id"], row["unread"]) for row in waiting] == [(row["person"]["id"], row["counts"]["messages"]) for row in top if row["total"]]
        assert top[0]["preview"].startswith("Lee Arner: @Tess Teacher")
        chats.mark_read(db, _user(TEACHER), opened["conversation_uuid"])
        assert [row["total"] for row in feed.people_feed(db, _user(TEACHER), 1)["active"]] == [0]

"""Each Canvas course becomes a group (DEV-179): students join on launch, a teacher lands on it as staff."""

from html import unescape
from re import search

from sqlmodel import select

from src.db.canvas import CanvasCourseGroup
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.tests.test_canvas_launch import INSTRUCTOR, LTI, _launch, _session, client, db, store  # noqa: F401


def _destination(page_html: str) -> str:
    return unescape(search(r'var dest="([^"]+)"', page_html).group(1))


def _user(db, email):  # noqa: F811
    return db.exec(select(User).where(User.email == email)).first()


def test_students_join_their_course_group_on_launch(client, db):  # noqa: F811
    assert _session(client, _launch(client)[0].text).status_code == 200
    second = _launch(client, sub="canvas-user-2", email="leo@ridge.example.com", name="Leo Park", given_name="Leo", family_name="Park")
    assert _session(client, second[0].text).status_code == 200

    link = db.exec(select(CanvasCourseGroup)).one()
    group = db.get(UserGroup, link.usergroup_id)
    assert (link.canvas_course_id, group.name, group.org_id) == ("course-9", "Careers 101", 2)
    members = set(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group.id)).all())
    assert members == {_user(db, "maya@ridge.example.com").id, _user(db, "leo@ridge.example.com").id}

    # Opening it again doesn't add them twice.
    assert _session(client, _launch(client)[0].text).status_code == 200
    assert len(db.exec(select(UserGroupUser).where(UserGroupUser.usergroup_id == group.id)).all()) == 2


def test_a_teacher_joins_as_staff_and_lands_on_the_course_group(client, db):  # noqa: F811
    page = _session(client, _launch(client, sub="canvas-teacher", email="rivera@ridge.example.com", name="Ana Rivera",
                                    **{f"{LTI}roles": [INSTRUCTOR]})[0].text)
    teacher = _user(db, "rivera@ridge.example.com")
    group = db.exec(select(UserGroup)).one()
    assert _destination(page.text).endswith(f"/admin/threads/profiles/groups/{group.id}")
    staff = db.exec(select(UserGroupStaff).where(UserGroupStaff.usergroup_id == group.id)).one()
    assert (staff.user_id, staff.role_key) == (teacher.id, "commenter")
    assert db.exec(select(UserGroupUser).where(UserGroupUser.user_id == teacher.id)).first() is None


def test_a_renamed_course_renames_its_group(client, db):  # noqa: F811
    _session(client, _launch(client)[0].text)
    _session(client, _launch(client, **{f"{LTI}context": {"id": "course-9", "title": "Careers 102"}})[0].text)
    assert [group.name for group in db.exec(select(UserGroup)).all()] == ["Careers 102"]


def test_a_launch_from_outside_a_course_makes_no_group(client, db):  # noqa: F811
    page = _session(client, _launch(client, **{f"{LTI}context": None})[0].text)
    assert page.status_code == 200 and _destination(page.text).endswith("/plans")
    assert db.exec(select(UserGroup)).first() is None


def test_a_course_group_takes_group_plans_on_every_tier(client, db):  # noqa: F811
    """UT-42: on Free a teacher gives their course group a plan, so Insights can show the class's progress."""
    import pytest
    from fastapi import HTTPException

    from src.db.goals import GoalAssignment
    from src.routers.goal_admin import _require_assignment_plan, _require_group_plans
    from src.security.access.access import org_access
    from src.services.canvas.courses import assignable_course_groups, course_group_ids

    _session(client, _launch(client)[0].text)
    _session(client, _launch(client, sub="canvas-teacher", email="rivera@ridge.example.com", name="Ana Rivera", **{f"{LTI}roles": [INSTRUCTOR]})[0].text)
    course = db.exec(select(UserGroup)).one()
    other = UserGroup(org_id=2, name="Homeroom", description="", usergroup_uuid="usergroup_homeroom", creation_date="", update_date="")
    db.add(other)
    db.commit()
    assert not org_access(2, db).has("groups")
    assert course_group_ids(db, 2) == {course.id} and course_group_ids(db, 2, [other.id]) == set() and course_group_ids(db, 1) == set()

    teacher = _user(db, "rivera@ridge.example.com")
    assert assignable_course_groups(db, teacher.id, 2) == [{"id": course.id, "name": "Careers 101", "member_count": 1, "canvas_course": True}]
    with pytest.raises(HTTPException):
        assignable_course_groups(db, _user(db, "maya@ridge.example.com").id, 2)

    _require_group_plans(2, db, read=True, usergroup_id=course.id)
    with pytest.raises(HTTPException):
        _require_group_plans(2, db, read=True, usergroup_id=other.id)

    for uuid, group in (("goal_assignment_course", course), ("goal_assignment_homeroom", other)):
        db.add(GoalAssignment(assignment_uuid=uuid, org_id=2, template_id=None, version_id=None, usergroup_id=group.id, creation_date="", update_date=""))
    db.commit()
    _require_assignment_plan(2, "goal_assignment_course", db)
    with pytest.raises(HTTPException):
        _require_assignment_plan(2, "goal_assignment_homeroom", db)

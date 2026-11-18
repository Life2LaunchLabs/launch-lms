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

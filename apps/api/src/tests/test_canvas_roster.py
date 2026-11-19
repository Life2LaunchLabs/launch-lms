"""A Canvas course's class list arrives in its group as invitations (DEV-193)."""

from urllib.parse import parse_qs

import httpx
import jwt
import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.canvas import CanvasCourseGroup
from src.db.school import UserGroupStaff
from src.db.organization_invitations import OrganizationInvitation
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.security.access.access import count_usage
from src.services.canvas import keys, roster
from src.tests.test_canvas_launch import INSTRUCTOR, LEARNER, LTI, _launch, _session, client, db, store  # noqa: F401

NRPS = "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice"
LIST_URL = "https://ridge.instructure.com/api/lti/courses/9/names_and_roles"
TOKEN_URL = "https://sso.canvaslms.com/login/oauth2/token"
TEACHER = {"sub": "canvas-teacher", "email": "rivera@ridge.example.com", "name": "Ana Rivera", f"{LTI}roles": [INSTRUCTOR],
           NRPS: {"context_memberships_url": LIST_URL, "service_versions": ["2.0"]}}


def _student(user_id, email, name, status="Active", roles=(LEARNER,)):
    member = {"user_id": user_id, "name": name, "status": status, "roles": list(roles)}
    if email:
        member["email"] = email
    return member


class FakeCanvas:
    """Canvas's token and class list addresses."""

    def __init__(self, members, token_status=200, page_size=None):
        self.members = members
        self.token_status = token_status
        self.page_size = page_size
        self.token_requests: list[dict] = []
        self.list_requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_URL:
            self.token_requests.append({k: v[0] for k, v in parse_qs(request.content.decode()).items()})
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_scope"})
            return httpx.Response(200, json={"access_token": "canvas-token", "token_type": "Bearer", "expires_in": 3600})
        if str(request.url).startswith(LIST_URL):
            self.list_requests.append(request)
            if not self.page_size:
                return httpx.Response(200, json={"id": LIST_URL, "members": self.members})
            page = int(request.url.params.get("page", "1"))
            chunk = self.members[(page - 1) * self.page_size: page * self.page_size]
            headers = {"Link": f'<{LIST_URL}?page={page + 1}>; rel="next"'} if page * self.page_size < len(self.members) else {}
            return httpx.Response(200, json={"members": chunk}, headers=headers)
        return httpx.Response(404)


@pytest.fixture
def canvas(monkeypatch, db):  # noqa: F811
    fake = FakeCanvas([])
    real_client = httpx.Client
    monkeypatch.setattr(roster.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(fake)))
    monkeypatch.setattr("src.core.events.database.engine", db.get_bind())
    monkeypatch.setattr("src.services.audit_logs.record_audit_log", lambda *args, **kwargs: None)
    return fake


def _user(db, email):  # noqa: F811
    return db.exec(select(User).where(User.email == email)).first()


def _group(db):  # noqa: F811
    return db.exec(select(UserGroup)).one()


def _members(db, group):  # noqa: F811
    return set(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group.id)).all())


def _staff(db, group):  # noqa: F811
    return set(db.exec(select(UserGroupStaff.user_id).where(UserGroupStaff.usergroup_id == group.id)).all())


def _invitations(db, status="pending"):  # noqa: F811
    db.expire_all()
    return db.exec(select(OrganizationInvitation).where(OrganizationInvitation.status == status)).all()


def _school_learner(db, email, first):  # noqa: F811
    user = User(email=email, username=first.lower(), first_name=first, last_name="Kim", password="x", user_uuid=f"user_{first}")
    db.add(user)
    db.flush()
    db.add(UserOrganization(user_id=user.id, org_id=2, role_id=4, creation_date="", update_date=""))
    db.commit()
    return user


def test_a_teacher_launch_pulls_the_class_list_as_invitations(client, db, canvas):  # noqa: F811
    _session(client, _launch(client)[0].text)  # Maya opened it already
    jo = _school_learner(db, "jo@ridge.example.com", "Jo")  # in the school, not yet in the course group
    canvas.members = [
        _student("canvas-teacher", "rivera@ridge.example.com", "Ana Rivera", roles=(INSTRUCTOR,)),
        _student("canvas-tom", "tom@ridge.example.com", "Tom Reyes", roles=(INSTRUCTOR,)),
        _student("canvas-user-1", "maya@ridge.example.com", "Maya Lopez"),
        _student("canvas-jo", "Jo@Ridge.example.com", "Jo Kim"),
        _student("canvas-leo", "leo@ridge.example.com", "Leo Park"),
        _student("canvas-sam", None, "Sam Hidden"),
        _student("canvas-old", "old@ridge.example.com", "Old Student", status="Inactive"),
    ]
    page = _session(client, _launch(client, **TEACHER)[0].text)
    assert page.status_code == 200

    db.expire_all()
    group = _group(db)
    link = db.exec(select(CanvasCourseGroup)).one()
    assert link.memberships_url == LIST_URL and link.roster_error is None and link.roster_pulled_at
    # The token request is signed with Life2Launch's key, for Canvas's token address, asking only for the class list.
    sent = canvas.token_requests[0]
    assert sent["grant_type"] == "client_credentials" and sent["scope"] == roster.NRPS_SCOPE
    assertion = jwt.decode(sent["client_assertion"], jwt.PyJWK(keys.public_jwk(db)).key, algorithms=["RS256"], audience=TOKEN_URL)
    assert assertion["iss"] == assertion["sub"] == "10000000000042" and assertion["jti"]
    assert canvas.list_requests[0].headers["Authorization"] == "Bearer canvas-token"

    # Jo was in the school: she joins the group. Leo isn't: he's invited, without an account or an email. Tom, a
    # teacher not yet here, is invited as staff, not leaning on whether the teacher who launched may grant that.
    assert _members(db, group) == {_user(db, "maya@ridge.example.com").id, jo.id}
    assert _staff(db, group) == {_user(db, "rivera@ridge.example.com").id}
    leo, tom = sorted(_invitations(db), key=lambda item: item.email)
    assert (leo.email, leo.usergroup_id, leo.source, leo.role_id) == ("leo@ridge.example.com", group.id, "canvas", 4)
    assert leo.delivery_status == "not_sent" and not leo.email_sent
    assert leo.created_by_user_id == _user(db, "rivera@ridge.example.com").id
    assert (tom.email, tom.role_id, tom.created_by_user_id) == ("tom@ridge.example.com", 2, None)
    assert _user(db, "leo@ridge.example.com") is None
    # They hold seats like any invitation.
    assert count_usage("learners", 2, db) == 3

    # Staff see who is still invited (teachers first), by the name Canvas gave, against the school's seats.
    summary = roster.summary_for_group(db, 2, group.id, _user(db, "rivera@ridge.example.com").id)
    assert [(item["name"], item["role"]) for item in summary["invited"]] == [("Tom Reyes", "staff"), ("Leo Park", "learner")]
    assert summary["seats"]["learners"]["used"] == 3 and summary["seats"]["learners"]["over"] == 0
    assert summary["offered"] and summary["error"] is None and summary["can_pull"] is False  # default staff can't manage learners

    # A second teacher launch soon after doesn't ask Canvas again.
    _session(client, _launch(client, **TEACHER)[0].text)
    assert len(canvas.token_requests) == 1


def test_a_student_launch_takes_up_their_invitation(client, db, canvas, store):  # noqa: F811
    canvas.members = [_student("canvas-leo", "leo@ridge.example.com", "Leo Park")]
    _session(client, _launch(client, **TEACHER)[0].text)
    group = _group(db)
    assert len(_invitations(db)) == 1

    _session(client, _launch(client, sub="canvas-leo", email="leo@ridge.example.com", name="Leo Park")[0].text)
    leo = _user(db, "leo@ridge.example.com")
    assert leo.id in _members(db, group)
    [accepted] = _invitations(db, "accepted")
    assert accepted.target_user_id == leo.id and not _invitations(db)
    db.refresh(db.exec(select(CanvasCourseGroup)).one())
    assert db.exec(select(CanvasCourseGroup)).one().invited_names == {}

    # The next pull finds him in the school and leaves things as they are.
    store.values.clear()
    _session(client, _launch(client, **TEACHER)[0].text)
    assert not _invitations(db) and leo.id in _members(db, group)


def test_a_student_who_left_the_course_has_their_invitation_withdrawn(client, db, canvas, store):  # noqa: F811
    canvas.members = [_student("canvas-leo", "leo@ridge.example.com", "Leo Park"), _student("canvas-ivy", "ivy@ridge.example.com", "Ivy Chen")]
    _session(client, _launch(client, **TEACHER)[0].text)
    assert len(_invitations(db)) == 2

    canvas.members = [_student("canvas-ivy", "ivy@ridge.example.com", "Ivy Chen")]
    store.values.clear()
    _session(client, _launch(client, **TEACHER)[0].text)
    assert [item.email for item in _invitations(db)] == ["ivy@ridge.example.com"]
    assert [item.email for item in _invitations(db, "revoked")] == ["leo@ridge.example.com"]
    assert set(db.exec(select(CanvasCourseGroup)).one().invited_names) == {"ivy@ridge.example.com"}


def test_a_big_class_on_a_free_school_is_invited_in_full_and_shows_it_is_over(client, db, canvas):  # noqa: F811
    canvas.members = [_student(f"canvas-{n}", f"student{n}@ridge.example.com", f"Student {n}") for n in range(30)]
    canvas.page_size = 10  # three pages
    _session(client, _launch(client, **TEACHER)[0].text)
    assert len(_invitations(db)) == 30 and len(canvas.list_requests) == 3
    group = _group(db)
    seats = roster.summary_for_group(db, 2, group.id, _user(db, "rivera@ridge.example.com").id)["seats"]["learners"]
    assert (seats["limit"], seats["used"], seats["over"]) == (25, 30, 5)

    # The class list doesn't keep its own students out: one opening Life2Launch from Canvas joins while there's room.
    _session(client, _launch(client, sub="canvas-3", email="student3@ridge.example.com", name="Student 3")[0].text)
    assert _user(db, "student3@ridge.example.com").id in _members(db, group)
    assert len(_invitations(db)) == 29


def test_a_class_list_invitation_needs_a_free_seat_to_accept(client, db, canvas, monkeypatch):  # noqa: F811
    from src.services.orgs.invitation_security import validate_invitation_acceptance

    canvas.members = [_student("canvas-leo", "leo@ridge.example.com", "Leo Park")]
    _session(client, _launch(client, **TEACHER)[0].text)
    [invitation] = _invitations(db)
    validate_invitation_acceptance(invitation, db)  # room
    monkeypatch.setattr("src.services.orgs.invitation_security.count_usage", lambda *args, **kwargs: 25)
    with pytest.raises(HTTPException) as refused:
        validate_invitation_acceptance(invitation, db)
    assert refused.value.status_code == 403


def test_update_from_canvas_needs_manage_learners_and_says_why_it_failed(client, db, canvas, store):  # noqa: F811
    canvas.token_status = 400
    _session(client, _launch(client, **TEACHER)[0].text)
    group = _group(db)
    link = db.exec(select(CanvasCourseGroup)).one()
    db.refresh(link)
    assert link.roster_error == roster.NO_SCOPE and link.roster_pulled_at is None

    teacher = _user(db, "rivera@ridge.example.com")
    with pytest.raises(HTTPException) as forbidden:
        roster.pull_now(db, teacher.id, 2, group.id)
    assert forbidden.value.status_code == 403

    admin = _school_learner(db, "admin@ridge.example.com", "Ada")
    membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == admin.id)).one()
    membership.role_id = 1
    db.add(membership)
    db.commit()
    with pytest.raises(HTTPException) as failed:
        roster.pull_now(db, admin.id, 2, group.id)
    assert failed.value.status_code == 409 and "save it again" in failed.value.detail

    canvas.token_status = 200
    canvas.members = [_student("canvas-leo", "leo@ridge.example.com", "Leo Park")]
    store.values.clear()
    result = roster.pull_now(db, admin.id, 2, group.id)
    assert result["invited"] == 1 and result["canvas"]["can_pull"] and result["canvas"]["error"] is None
    with pytest.raises(HTTPException) as again:
        roster.pull_now(db, admin.id, 2, group.id)
    assert again.value.status_code == 429


def test_a_class_list_on_another_site_is_never_sent_a_token(client, db, canvas):  # noqa: F811
    elsewhere = {**TEACHER, NRPS: {"context_memberships_url": "https://attacker.example.com/names_and_roles"}}
    _session(client, _launch(client, **elsewhere)[0].text)
    link = db.exec(select(CanvasCourseGroup)).one()
    db.refresh(link)
    assert not canvas.token_requests and link.roster_error == roster.NOT_OFFERED


def test_joining_the_school_another_way_settles_class_list_invitations(client, db, canvas):  # noqa: F811
    canvas.members = [_student("canvas-ivy", "ivy@ridge.example.com", "Ivy Chen")]
    _session(client, _launch(client, **TEACHER)[0].text)
    group = _group(db)
    ivy = _school_learner(db, "Ivy@ridge.example.com", "Ivy")  # e.g. accepted a school invitation or link
    assert roster.settle_for_member(db, 2, ivy) == 1
    assert ivy.id in _members(db, group) and not _invitations(db)


def test_an_invited_teacher_joins_the_group_staff(client, db, canvas):  # noqa: F811
    canvas.members = [_student("canvas-tom", "tom@ridge.example.com", "Tom Reyes", roles=(INSTRUCTOR,))]
    _session(client, _launch(client, **TEACHER)[0].text)
    group = _group(db)
    [invitation] = _invitations(db)
    assert invitation.role_id == 2
    _session(client, _launch(client, sub="canvas-tom", email="tom@ridge.example.com", name="Tom Reyes", **{f"{LTI}roles": [INSTRUCTOR]})[0].text)
    tom = _user(db, "tom@ridge.example.com")
    assert tom.id in _staff(db, group) and tom.id not in _members(db, group)
    assert not _invitations(db)


def test_a_class_list_invitation_starts_the_sign_up_form_with_canvas_names(client, db, canvas):  # noqa: F811
    from src.services.orgs.invite_landing import preview

    canvas.members = [{**_student("canvas-leo", "leo@ridge.example.com", "Leo Park"), "given_name": "Leo", "family_name": "Park"}]
    _session(client, _launch(client, **TEACHER)[0].text)
    [invitation] = _invitations(db)
    card = preview(db, 2, invitation=invitation.invitation_uuid)
    assert (card["email"], card["first_name"], card["last_name"]) == ("leo@ridge.example.com", "Leo", "Park")


def test_the_invitation_list_names_class_list_invitations_and_the_group_list_marks_canvas(client, db, canvas):  # noqa: F811
    from src.services.school.feed import _group_rows

    canvas.members = [{**_student("canvas-leo", "leo@ridge.example.com", "Leo Park"), "given_name": "Leo", "family_name": "Park"}]
    _session(client, _launch(client, **TEACHER)[0].text)
    [invitation] = _invitations(db)
    rows = [{"invitation_uuid": invitation.invitation_uuid, "source": "canvas"}, {"invitation_uuid": "other", "source": "email"}]
    assert roster.name_invitations(db, 2, rows) == [{**rows[0], "name": "Leo Park"}, rows[1]]
    group = _group(db)
    assert _group_rows(db, [group])[0]["group"]["canvas"] is True


def test_the_tool_configuration_asks_for_the_class_list(client):  # noqa: F811
    assert client.get("/api/v1/lti/canvas.json").json()["scopes"] == [roster.NRPS_SCOPE]


def test_a_student_who_left_the_course_leaves_its_group_but_not_the_school(client, db, canvas, store):  # noqa: F811
    # UT-44: Maya opened Life2Launch from the course, so she's in its group; then she transferred to another class.
    _session(client, _launch(client)[0].text)
    maya = _user(db, "maya@ridge.example.com")
    jo = _school_learner(db, "jo@ridge.example.com", "Jo")  # staff put her in the group by hand; she isn't in Canvas
    canvas.members = [_student("canvas-user-1", "maya@ridge.example.com", "Maya Lopez"), _student("canvas-ivy", "ivy@ridge.example.com", "Ivy Chen")]
    _session(client, _launch(client, **TEACHER)[0].text)
    group = _group(db)
    from src.services.canvas.courses import add_member
    add_member(db, group, jo.id)
    db.commit()
    assert _members(db, group) == {maya.id, jo.id}

    # Canvas no longer lists her (or lists her as inactive): the next pull takes her off the group.
    canvas.members = [_student("canvas-user-1", "maya@ridge.example.com", "Maya Lopez", status="Inactive"),
                      _student("canvas-ivy", "ivy@ridge.example.com", "Ivy Chen")]
    teacher = _user(db, "rivera@ridge.example.com")
    link = db.exec(select(CanvasCourseGroup)).one()
    result = roster.apply_roster(db, link, canvas.members, teacher.id)
    db.expire_all()
    assert result.left == 1
    assert _members(db, group) == {jo.id}  # Jo, added by staff, stays
    # Maya keeps her place in the school.
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == maya.id, UserOrganization.org_id == 2)).first()

    # Back in the course: the next pull puts her back in the group.
    result = roster.apply_roster(db, link, [_student("canvas-user-1", "maya@ridge.example.com", "Maya Lopez")], teacher.id)
    db.expire_all()
    assert result.joined == 1 and maya.id in _members(db, group)

    # A class list naming nobody active takes nobody off.
    result = roster.apply_roster(db, link, [], teacher.id)
    db.expire_all()
    assert result.left == 0 and _members(db, group) == {maya.id, jo.id}

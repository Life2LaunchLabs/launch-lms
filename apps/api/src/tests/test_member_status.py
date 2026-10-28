"""Learner status: the organization marks learners active or alumni, and only active learners count toward its limit."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal, GoalAssignmentCreate
from src.db.goal_templates import GoalAssignmentRequest
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.security.access.access import count_usage
from src.services.goals import assignments
from src.services.orgs import member_status
from src.services.school import directory, feed, profile
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _published, _user
from src.tests.test_school import TEACHER, _session as _school_session

STAFF = {"dashboard": {"action_access": True}}


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setattr("src.security.access.access.owner_org_id", lambda *_args: None)
    session = _school_session()
    for model in (OrganizationInvitation, OrganizationJoinLink):
        model.__table__.create(session.get_bind(), checkfirst=True)
    session.add_all([
        Role(id=1, name="Admin", rights=STAFF, role_uuid="role_admin"),
        Role(id=2, name="Staff", rights=STAFF, role_uuid="role_staff"),
        Role(id=4, name="Learner", rights={}, role_uuid="role_learner"),
        OrganizationConfig(org_id=1, config={"config_version": "3.0", "tier": "free"}),
    ])
    session.commit()
    yield session
    session.close()


def _status(db, user_id: int) -> str:
    return db.exec(select(UserOrganization.status).where(UserOrganization.user_id == user_id)).one()


def _limit_to(db, learners: int) -> None:
    """Shrink the free tier's 25 learners to ``learners`` with a negative grant, so tests stay small."""
    row = db.exec(select(OrganizationConfig)).one()
    row.config = {**row.config, "grants": {"learners": {"extra": learners - 25}}}
    db.add(row)
    db.commit()


def test_alumni_stop_counting_toward_the_limit(db):
    assert count_usage("learners", 1, db) == 2
    member_status.set_member_status(db, _user(ADMIN), 1, LEARNER, "alumni")
    assert _status(db, LEARNER) == "alumni" and count_usage("learners", 1, db) == 1
    # Staff count toward staff seats and can't be alumni.
    with pytest.raises(HTTPException) as staff:
        member_status.set_member_status(db, _user(ADMIN), 1, TEACHER, "alumni")
    assert staff.value.status_code == 422
    with pytest.raises(HTTPException) as learner:
        member_status.set_member_status(db, _user(OTHER), 1, LEARNER, "active")
    assert learner.value.status_code == 403


def test_a_whole_group_moves_on_and_comes_back_while_there_is_room(db):
    result = member_status.set_group_status(db, _user(ADMIN), 1, 1, "alumni")
    assert result["changed"] == 2 and count_usage("learners", 1, db) == 0
    assert member_status.set_group_status(db, _user(ADMIN), 1, 1, "alumni")["changed"] == 0
    _limit_to(db, 1)
    with pytest.raises(HTTPException) as full:
        member_status.set_group_status(db, _user(ADMIN), 1, 1, "active")
    assert full.value.status_code == 403 and "alumni in People" in full.value.detail
    member_status.set_member_status(db, _user(ADMIN), 1, LEARNER, "active")
    assert (_status(db, LEARNER), _status(db, OTHER)) == ("active", "alumni")


def test_people_leaves_alumni_out_unless_asked(db):
    member_status.set_member_status(db, _user(ADMIN), 1, OTHER, "alumni")
    listed = {row["user"]["username"]: row["status"] for row in directory.directory(db, _user(ADMIN), 1)["people"]}
    assert "sam" not in listed and listed["lee"] == "active"
    alumni = directory.directory(db, _user(ADMIN), 1, status="alumni")["people"]
    assert [(row["user"]["username"], row["status"]) for row in alumni] == [("sam", "alumni")]
    assert len(directory.directory(db, _user(ADMIN), 1, status="all")["people"]) == 4


def test_group_plans_skip_alumni_and_a_plan_for_an_alumnus_asks_to_reactivate(db):
    member_status.set_member_status(db, _user(ADMIN), 1, OTHER, "alumni")
    template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
    assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[ADMIN]))
    assert {goal.subject_user_id for goal in db.exec(select(Goal)).all()} == {LEARNER}

    with pytest.raises(HTTPException) as asked:
        assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(user_id=OTHER))
    assert asked.value.status_code == 409 and asked.value.detail["code"] == "alumni"
    assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentRequest(user_id=OTHER, reactivate=True))
    assert _status(db, OTHER) == "active" and OTHER in {goal.subject_user_id for goal in db.exec(select(Goal)).all()}


def test_the_learner_sees_their_relationship(db):
    template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
    assignments.assign(db, _user(ADMIN), 1, template.template_uuid, GoalAssignmentCreate(usergroup_id=1, staff_user_ids=[TEACHER]))
    member_status.set_member_status(db, _user(ADMIN), 1, LEARNER, "alumni")
    mine = member_status.relationship(db, _user(LEARNER), 1)
    assert (mine["status"], mine["role"]) == ("alumni", "learner") and mine["status_since"]
    assert len(mine["plans"]) == 1 and mine["plans"][0]["goal_uuid"]
    assert {person["username"] for person in mine["staff"]} >= {"teach"}
    with pytest.raises(HTTPException) as stranger:
        member_status.relationship(db, _user(99), 1)
    assert stranger.value.status_code == 404


def test_people_pages_show_status_and_who_may_change_it(db):
    member_status.set_member_status(db, _user(ADMIN), 1, OTHER, "alumni")
    sam = profile.profile(db, _user(ADMIN), 1, "sam")
    assert (sam["status"], sam["manage"]["status"], sam["manage"]["permissions"]) == ("alumni", True, False) and sam["status_since"]
    tess = profile.profile(db, _user(ADMIN), 1, "teach")
    assert tess["permissions"] == ["review_work", "run_assignments"] and tess["manage"]["permissions"] and not tess["manage"]["status"]
    # Staff without manage_learners see the status but can't change it.
    assert profile.profile(db, _user(TEACHER), 1, "sam")["manage"]["status"] is False
    group = feed.group_detail(db, _user(ADMIN), 1, 1)
    assert (group["alumni_count"], group["can_set_status"]) == (1, True)


def test_the_people_feed_hides_alumni_unless_asked(db):
    member_status.set_member_status(db, _user(ADMIN), 1, OTHER, "alumni")
    names = lambda rows: {row["person"]["username"] for row in rows if row["kind"] == "person"}  # noqa: E731
    default = feed.people_feed(db, _user(ADMIN), 1)
    assert "sam" not in names(default["active"] + default["rest"])
    alumni = feed.people_feed(db, _user(ADMIN), 1, status="alumni")
    assert alumni["active"] == [] and names(alumni["rest"]) == {"sam"} and alumni["rest"][0]["status"] == "alumni"
    assert "sam" in names(feed.people_feed(db, _user(ADMIN), 1, status="all")["rest"])

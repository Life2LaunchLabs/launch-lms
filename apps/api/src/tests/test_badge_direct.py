"""Awarding a plan's badge directly: who may, to whom (people and groups' active learners), sign-off, skips, and what follows."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.audit_logs import AuditLog
from src.db.badges import BadgeAward
from src.db.messages import InboxMessage
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.badges import direct, open_badges
from src.tests.plan_world import NOW, PARTNER, STRANGER, _world
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user

STAFF = 4


def _people(db) -> None:
    """OTHER is an alumnus at Partner; STAFF is Partner staff without review_work; a group holds both learners."""
    AuditLog.__table__.create(db.get_bind(), checkfirst=True)
    db.add(User(id=STAFF, user_uuid="user_4", username="staffer", email="staffer@example.com", first_name="Sam", last_name="Staff", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=OTHER, org_id=PARTNER, role_id=4, status="alumni", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=STAFF, org_id=PARTNER, role_id=2, permissions=["run_assignments"], creation_date=NOW, update_date=NOW))
    db.add(UserGroup(id=7, org_id=PARTNER, name="Class of 2027", description="", usergroup_uuid="usergroup_7", creation_date=NOW, update_date=NOW))
    for user_id in (LEARNER, OTHER):
        db.add(UserGroupUser(usergroup_id=7, user_id=user_id, org_id=PARTNER, creation_date=NOW, update_date=NOW))
    db.commit()


def _payload(template_uuid: str, **values) -> direct.DirectAward:
    return direct.DirectAward(**{"template_uuid": template_uuid, "statement": "Ran the summer internship project", "confirmed": True, **values})


def test_a_group_award_reaches_its_active_learners_once_with_the_sign_off_on_the_credential():
    db, (plan, other) = _world()
    with db:
        _people(db)
        listed = direct.awardable(db, _user(ADMIN), PARTNER)
        assert [item["template_uuid"] for item in listed] == [plan.template_uuid, other.template_uuid]
        assert listed[0]["owned"] is False and listed[0]["owner"]["name"] == "Studio" and listed[0]["steps"] == 2

        # Before awarding: who it reaches and who has it already.
        assert direct.holder_ids(db, _user(ADMIN), PARTNER, plan.template_uuid) == []
        reach = direct.preview(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, group_ids=[7], user_ids=[LEARNER]))
        assert [item["user_id"] for item in reach["learners"]] == [LEARNER] and reach["skipped"] == []

        result = direct.award_directly(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, group_ids=[7], evidence_url="https://example.com/work",
                                                                            notes={LEARNER: "Led the team"}))
        # The alumnus in the group is left out.
        assert [item["learner"]["id"] for item in result["awarded"]] == [LEARNER] and result["skipped"] == []
        award = db.exec(select(BadgeAward)).one()
        assert (award.source, award.awarded_by_user_id, award.issuing_org_id, award.semver) == ("direct_award", ADMIN, PARTNER, "1.0.0")
        assert award.statement == "Ran the summer internship project\n\nLed the team"
        evidence = open_badges.credential(db, award)["evidence"][0]
        assert evidence["id"] == "https://example.com/work" and "summer internship" in evidence["description"]
        message = db.exec(select(InboxMessage)).one()
        assert (message.recipient_user_id, message.action_url) == (LEARNER, f"/b/{award.code}")
        assert db.exec(select(AuditLog)).one().request_metadata["user_ids"] == [LEARNER]

        # Awarding again skips whoever has it.
        again = direct.award_directly(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, user_ids=[LEARNER]))
        assert again["awarded"] == [] and again["skipped"][0]["user_id"] == LEARNER
        assert direct.holder_ids(db, _user(ADMIN), PARTNER, plan.template_uuid) == [LEARNER]
        assert direct.preview(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, group_ids=[7]))["skipped"][0]["name"] == "Lee Arner"
        assert len(db.exec(select(BadgeAward)).all()) == 1


def test_direct_awards_need_review_work_a_plan_the_org_runs_a_statement_and_confirmation():
    db, (plan, _) = _world()
    with db:
        _people(db)
        with pytest.raises(HTTPException) as denied:
            direct.award_directly(db, _user(STAFF), PARTNER, _payload(plan.template_uuid, user_ids=[LEARNER]))
        assert denied.value.status_code == 403
        with pytest.raises(HTTPException) as unrun:
            direct.award_directly(db, _user(ADMIN), STRANGER, _payload(plan.template_uuid, user_ids=[LEARNER]))
        assert unrun.value.status_code == 404
        for values in ({"statement": "  "}, {"confirmed": False}):
            with pytest.raises(HTTPException) as invalid:
                direct.award_directly(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, user_ids=[LEARNER], **values))
            assert invalid.value.status_code == 422
        with pytest.raises(HTTPException) as outsider:
            direct.award_directly(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, user_ids=[STAFF + 10]))
        assert outsider.value.status_code == 404
        assert db.exec(select(BadgeAward)).all() == []


def test_staff_see_a_learners_badges_and_whether_they_may_award():
    db, (plan, _) = _world()
    with db:
        _people(db)
        direct.award_directly(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, user_ids=[LEARNER]))
        seen = direct.learner_awards(db, _user(STAFF), PARTNER, LEARNER)
        assert [item["achievement"]["name"] for item in seen["awards"]] == ["Adaptability"] and seen["can_award"] is False
        assert direct.learner_awards(db, _user(ADMIN), PARTNER, LEARNER)["can_award"] is True

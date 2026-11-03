"""School support: staff ask, the learner accepts a consent card, staff open the learner, and ending it stops access."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel, select

from src.db.learner_support import LearnerSupport, LearnerSupportUpdate
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.services import portfolio as portfolio_service
from src.services.connect import chats
from src.services.school import support
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _user
from src.tests.test_portfolio_people import _session as _portfolio_session

TEACHER = 4


def _session():
    from src.db.users import User

    db = _portfolio_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[LearnerSupport.__table__])  # type: ignore[attr-defined]
    db.add(User(id=TEACHER, user_uuid="user_4", username="teach", email="teach@example.com", first_name="Tess", last_name="Teacher", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=TEACHER, org_id=1, role_id=2, creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _card(db, user_id: int = LEARNER) -> dict:
    listed = chats.list_chats(db, _user(user_id))["chats"]
    return next(chat["last_message"]["card"] for chat in listed if (chat["last_message"] or {}).get("card", {}) and chat["last_message"]["card"]["type"] == support.SUPPORT_REQUEST)


def _open(db, user_id: int = TEACHER) -> dict:
    return support.open_learner(db, _user(user_id), 1, LEARNER)


def test_staff_see_nothing_until_the_learner_accepts_and_nothing_after_it_ends():
    with _session() as db:
        portfolio_service.get_or_create_portfolio(_user(LEARNER), db)
        assert support.status(db, _user(TEACHER), 1, LEARNER)["status"] == "none"
        with pytest.raises(HTTPException) as before:
            _open(db)
        assert before.value.status_code == 404

        asked = support.request(db, _user(TEACHER), 1, LEARNER)
        assert asked["status"] == "requested"
        # Asking twice doesn't post a second card.
        support.request(db, _user(TEACHER), 1, LEARNER)
        card = _card(db)
        assert card["state"] == "pending" and card["for_me"] and card["org_name"] == "Studio"
        assert "can't see anything you marked private" in card["text"]
        with pytest.raises(HTTPException):
            _open(db)

        accepted = support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
        assert accepted["status"] == "active" and accepted["org"]["name"] == "Studio"
        assert _card(db)["state"] == "accepted"
        row = db.exec(select(LearnerSupport)).one()
        assert row.consent_version == support.CONSENT_VERSION and row.consent_at
        opened = _open(db)
        assert opened["learner"]["username"] == "lee" and opened["record"]["status"] == "active"
        assert opened["portfolio"] is not None and "email" not in opened["learner"]

        support.end(db, _user(LEARNER), card["support_uuid"])
        assert _card(db)["state"] == "ended"
        with pytest.raises(HTTPException):
            _open(db)
        with pytest.raises(HTTPException):
            support.update(db, _user(TEACHER), 1, LEARNER, LearnerSupportUpdate(student_id="123"))
        assert support.mine(db, _user(LEARNER))["supports"] == []


def test_only_this_organizations_staff_open_a_learner_and_never_someone_else():
    with _session() as db:
        db.add(Organization(id=2, name="Elsewhere", slug="elsewhere", email="e@example.com", org_uuid="org_2", creation_date=NOW, update_date=NOW))
        db.add(UserOrganization(user_id=OTHER, org_id=2, role_id=2, creation_date=NOW, update_date=NOW))
        db.commit()
        support.request(db, _user(TEACHER), 1, LEARNER)
        card = _card(db)
        # Another learner can't answer it, and the learner can't answer with an old card.
        with pytest.raises(HTTPException):
            support.answer(db, _user(OTHER), card["support_uuid"], True)
        with pytest.raises(HTTPException):
            support.answer(db, _user(LEARNER), card["support_uuid"], True, "request_old")
        support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
        assert _open(db)["record"]["status"] == "active"
        # Staff elsewhere, a learner, and a superadmin who isn't staff here are all refused.
        for user_id, org_id in ((OTHER, 2), (OTHER, 1), (LEARNER, 1)):
            with pytest.raises(HTTPException):
                support.open_learner(db, _user(user_id), org_id, LEARNER)
        assert support.is_supported(db, 1, TEACHER, LEARNER)
        assert not support.is_supported(db, 2, OTHER, LEARNER)
        # Staff can't ask to support another staff member.
        with pytest.raises(HTTPException):
            support.request(db, _user(TEACHER), 1, ADMIN)


def test_staff_keep_the_school_record_and_can_end_the_link():
    with _session() as db:
        support.request(db, _user(TEACHER), 1, LEARNER)
        card = _card(db)
        support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
        saved = support.update(db, _user(TEACHER), 1, LEARNER, LearnerSupportUpdate(student_id=" 400123 ", diploma_track="modified", graduation_year=2028, counselor_user_id=TEACHER))
        assert (saved["student_id"], saved["diploma_track"], saved["graduation_year"], saved["counselor"]["username"]) == ("400123", "modified", 2028, "teach")
        with pytest.raises(HTTPException):
            support.update(db, _user(TEACHER), 1, LEARNER, LearnerSupportUpdate(diploma_track="honors"))
        with pytest.raises(HTTPException):
            support.update(db, _user(TEACHER), 1, LEARNER, LearnerSupportUpdate(counselor_user_id=OTHER))
        # Clearing one field leaves the others.
        assert support.update(db, _user(TEACHER), 1, LEARNER, LearnerSupportUpdate(graduation_year=None))["student_id"] == "400123"

        assert support.staff_end(db, _user(TEACHER), 1, LEARNER)["status"] == "ended"
        with pytest.raises(HTTPException):
            _open(db)
        # Asking again sends a fresh card; the old one can no longer be answered.
        support.request(db, _user(TEACHER), 1, LEARNER)
        with pytest.raises(HTTPException):
            support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
        fresh = _card(db)
        assert fresh["request_uuid"] != card["request_uuid"] and fresh["state"] == "pending"
        support.answer(db, _user(LEARNER), fresh["support_uuid"], False, fresh["request_uuid"])
        assert _card(db)["state"] == "declined"
        with pytest.raises(HTTPException):
            _open(db)


def test_leaving_the_organization_stops_access():
    with _session() as db:
        support.request(db, _user(TEACHER), 1, LEARNER)
        card = _card(db)
        support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == LEARNER, UserOrganization.org_id == 1)).one()
        db.delete(membership)
        db.commit()
        with pytest.raises(HTTPException):
            _open(db)

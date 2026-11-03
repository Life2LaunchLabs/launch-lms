"""My people access: link someone to their account and switch on their portfolio and plans access."""

import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel

from src.db.life_plans import LifePlan
from src.db.portfolio_people import PersonAccess, PersonLink
from src.db.portfolio_records import ContactWrite
from src.services import people_access, portfolio_people, portfolio_records as records
from src.services.life_plans import plans
from src.tests.test_goals import LEARNER, OTHER, _user
from src.tests.test_portfolio_people import _session as _people_session


def _session():
    db = _people_session()
    SQLModel.metadata.create_all(db.get_bind(), tables=[LifePlan.__table__])  # type: ignore[attr-defined]
    return db


def _plan(db):
    db.add(LifePlan(plan_uuid="lp_1", user_id=LEARNER, document={"phases": []}, revision=1, creation_date="", update_date=""))
    db.commit()


def test_a_person_with_an_account_gets_two_switches_and_sees_only_what_is_on():
    with _session() as db:
        _plan(db)
        sam = people_access.add_account(PersonLink(handle="@sam"), _user(LEARNER), db)
        assert sam["account"] == {"username": "sam", "user_uuid": _user(OTHER).user_uuid, "portfolio": False, "plans": False}
        with pytest.raises(HTTPException):
            plans.shared_plan(db, _user(OTHER), _user(LEARNER).user_uuid)

        # Plans on, portfolio off: the budget opens but the private portfolio stays closed.
        sam = people_access.set_access(sam["contact_uuid"], PersonAccess(plans=True), _user(LEARNER), db)
        assert sam["account"]["plans"] and not sam["account"]["portfolio"]
        assert plans.shared_plan(db, _user(OTHER), _user(LEARNER).user_uuid)["plan"]["plan_uuid"] == "lp_1"
        assert [person["username"] for person in plans.shared_plans(db, _user(OTHER))] == ["lee"]
        with pytest.raises(HTTPException):
            portfolio_people.shared_shell(db, _user(OTHER), 1, "lee")

        sam = people_access.set_access(sam["contact_uuid"], PersonAccess(portfolio=True, plans=True), _user(LEARNER), db)
        access = portfolio_people.shared_shell(db, _user(OTHER), 1, "lee")["access"]
        assert (access["role"], access["can_comment"], access["plans"]) == ("commenter", True, True)

        # Both off takes everything back.
        people_access.set_access(sam["contact_uuid"], PersonAccess(), _user(LEARNER), db)
        with pytest.raises(HTTPException):
            plans.shared_plan(db, _user(OTHER), _user(LEARNER).user_uuid)


def test_someone_without_an_account_can_be_linked_and_removing_them_takes_access_back():
    with _session() as db:
        _plan(db)
        grandpa = records.create_contact(ContactWrite(name="Grandpa Joe"), _user(LEARNER), db)
        assert grandpa["account"] is None
        with pytest.raises(HTTPException):
            people_access.set_access(grandpa["contact_uuid"], PersonAccess(plans=True), _user(LEARNER), db)

        linked = people_access.link(grandpa["contact_uuid"], PersonLink(handle="@sam"), _user(LEARNER), db)
        assert linked["account"]["username"] == "sam"
        people_access.set_access(grandpa["contact_uuid"], PersonAccess(plans=True), _user(LEARNER), db)
        assert plans.shared_plan(db, _user(OTHER), _user(LEARNER).user_uuid)

        records.delete_contact(grandpa["contact_uuid"], _user(LEARNER), db)
        with pytest.raises(HTTPException):
            plans.shared_plan(db, _user(OTHER), _user(LEARNER).user_uuid)

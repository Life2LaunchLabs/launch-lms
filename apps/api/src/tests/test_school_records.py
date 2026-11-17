"""PL-6: each organization chooses whether it uses school records and the EPP (DEV-152, DEV-153)."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.organization_config import OrganizationConfig, OrganizationConfigDocument
from src.services.orgs import school_records
from src.services.school import support
from src.tests.test_goals import ADMIN, LEARNER, _user
from src.tests.test_learner_support import TEACHER, _card, _session


def _set_config(db, **fields) -> None:
    row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first()
    if not row:
        row = OrganizationConfig(org_id=1, config={})
    row.config = {**(row.config or {}), **fields}
    db.add(row)
    db.commit()


@pytest.mark.parametrize(("config", "expected"), [
    ({}, True),  # made before /start asked a role
    ({"setup": {"role": "teacher"}}, True),
    ({"setup": {"role": "district"}}, True),
    ({"setup": {"role": "training"}}, False),
    ({"setup": {"role": "program"}}, False),
    ({"setup": {"role": "parent"}}, False),
    ({"setup": {"role": "training"}, "school_records": True}, True),
    ({"setup": {"role": "teacher"}, "school_records": False}, False),
])
def test_unset_follows_the_start_role_and_a_choice_wins(config, expected):
    assert school_records.enabled_in(config) is expected


def test_the_config_document_keeps_the_choice():
    assert OrganizationConfigDocument.model_validate({"school_records": False}).school_records is False
    assert OrganizationConfigDocument.model_validate({}).school_records is None


def test_only_admins_change_it_and_staff_can_read_it():
    with _session() as db:
        assert school_records.get_setting(db, _user(TEACHER), 1) == {"enabled": True}
        with pytest.raises(HTTPException) as staff:
            school_records.update_setting(db, _user(TEACHER), 1, school_records.SchoolRecordsSetting(enabled=False))
        assert staff.value.status_code == 403
        with pytest.raises(HTTPException):
            school_records.get_setting(db, _user(LEARNER), 1)
        assert school_records.update_setting(db, _user(ADMIN), 1, school_records.SchoolRecordsSetting(enabled=False)) == {"enabled": False}
        assert school_records.enabled(db, 1) is False
        with pytest.raises(HTTPException) as off:
            school_records.require(db, 1)
        assert off.value.status_code == 404


def test_off_hides_the_ask_the_card_and_the_school_from_the_learner_and_on_brings_them_back():
    with _session() as db:
        support.request(db, _user(TEACHER), 1, LEARNER)
        card = _card(db)
        assert card["state"] == "pending"
        assert [item["org"]["name"] for item in support.mine(db, _user(LEARNER))["supports"]] == ["Studio"]

        _set_config(db, school_records=False)
        assert support.mine(db, _user(LEARNER))["supports"] == []
        assert _card(db)["state"] == "expired"
        with pytest.raises(HTTPException) as answered:
            support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])
        assert answered.value.status_code == 404

        # Turning it back on keeps what was there.
        _set_config(db, school_records=True)
        assert _card(db)["state"] == "pending"
        assert support.answer(db, _user(LEARNER), card["support_uuid"], True, card["request_uuid"])["status"] == "active"


def test_epp_and_school_support_routes_refuse_an_organization_with_school_records_off():
    from src.routers import epp, school

    def guarded(route) -> bool:
        return any(dep.call is school_records.route_guard for dep in route.dependant.dependencies)

    # Every EPP route, and every school support route for a learner, goes through the guard.
    assert epp.router.routes and all(guarded(route) for route in epp.router.routes)
    support_routes = [route for route in school.router.routes if route.path.endswith(("/support", "/record")) and "/students/" in route.path]
    assert len(support_routes) == 5 and all(guarded(route) for route in support_routes)
    with _session() as db:
        school_records.route_guard(1, db)
        _set_config(db, school_records=False)
        with pytest.raises(HTTPException) as off:
            school_records.route_guard(1, db)
        assert off.value.status_code == 404 and off.value.detail == school_records.OFF_DETAIL

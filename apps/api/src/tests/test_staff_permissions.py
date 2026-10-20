"""Staff permissions: an admin decides what each staff member may do; admins can do everything."""

import importlib.util
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalAssignmentCreate
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.security.org_auth import is_org_admin, staff_permissions as effective
from src.services.goals import assignments, templates
from src.services.orgs import staff_permissions
from src.tests.test_goals import ADMIN, LEARNER, NOW, _published, _user
from src.tests.test_member_status import db  # noqa: F401  (fixture)
from src.tests.test_school import TEACHER

ORG_ADMIN = 6


def _org_admin(db) -> None:  # noqa: F811
    db.add(User(id=ORG_ADMIN, user_uuid="user_6", username="ada", email="ada@example.com", first_name="Ada", last_name="Min", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=ORG_ADMIN, org_id=1, role_id=1, creation_date=NOW, update_date=NOW))
    db.commit()


def test_new_staff_run_assignments_and_review_but_need_permission_to_build(db):  # noqa: F811
    template = _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"})
    assignments.assign(db, _user(TEACHER), 1, template.template_uuid, GoalAssignmentCreate(user_id=LEARNER))
    with pytest.raises(HTTPException) as building:
        templates.create_template(db, _user(TEACHER), 1, title="Mine")
    assert building.value.status_code == 403 and "permission to create and edit plan templates" in building.value.detail

    _org_admin(db)
    staff_permissions.set_permissions(db, _user(ORG_ADMIN), 1, TEACHER, ["build_plans"])
    templates.create_template(db, _user(TEACHER), 1, title="Mine")
    # Without run_assignments now, they can't hand out plans.
    with pytest.raises(HTTPException):
        assignments.assign(db, _user(TEACHER), 1, template.template_uuid, GoalAssignmentCreate(user_id=LEARNER))


def test_only_admins_set_permissions_and_only_for_staff(db):  # noqa: F811
    _org_admin(db)
    with pytest.raises(HTTPException) as staff:
        staff_permissions.set_permissions(db, _user(TEACHER), 1, TEACHER, ["see_reports"])
    assert staff.value.status_code == 403
    with pytest.raises(HTTPException) as unknown:
        staff_permissions.set_permissions(db, _user(ORG_ADMIN), 1, TEACHER, ["launch_rockets"])
    assert unknown.value.status_code == 422
    with pytest.raises(HTTPException) as learner:
        staff_permissions.set_permissions(db, _user(ORG_ADMIN), 1, LEARNER, ["see_reports"])
    assert learner.value.status_code == 422
    assert staff_permissions.set_permissions(db, _user(ORG_ADMIN), 1, TEACHER, ["see_reports", "review_work"])["permissions"] == ["review_work", "see_reports"]


def test_admins_have_every_permission_and_learners_none(db):  # noqa: F811
    _org_admin(db)
    rows = {row.user_id: row for row in db.exec(select(UserOrganization)).all()}
    assert effective(rows[ORG_ADMIN]) == set(staff_permissions.STAFF_PERMISSIONS)
    assert effective(rows[TEACHER]) == {"run_assignments", "review_work"}
    assert effective(rows[LEARNER]) == set()
    assert is_org_admin(ORG_ADMIN, 1, db, "manage_learners") and not is_org_admin(TEACHER, 1, db, "manage_learners")
    assert is_org_admin(ADMIN, 1, db, "manage_learners")  # superadmin
    catalog = staff_permissions.catalog(db, _user(TEACHER), 1)["permissions"]
    assert [item["key"] for item in catalog if item["default"]] == ["run_assignments", "review_work"]


def test_migration_grants_orgs_with_more_staff_than_their_tier():
    path = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "d5e2b8f3c1a6_staff_permissions.py"
    spec = importlib.util.spec_from_file_location("staff_permissions_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)  # type: ignore[union-attr]
    assert migration.grant_staff_overage({"tier": "free"}, 5)["grants"] == {"staff_seats": {"extra": 3}}
    assert migration.grant_staff_overage({"tier": "free"}, 2) == {"tier": "free", "grants": {}}
    assert migration.grant_staff_overage({"tier": "enterprise"}, 99) == {"tier": "enterprise"}

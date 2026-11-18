"""Organization › Canvas: an admin connects the school's Canvas (DEV-176)."""

import pytest

from src.db.canvas import CanvasConnection
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.auth import get_authenticated_user
from src.tests.test_canvas_launch import client, db, store  # noqa: F401  (shared fixtures)

URL = "/api/v1/lti/orgs/{org}/connection"
GOOD = {"canvas_host": "https://ridge.instructure.com/", "client_id": "10000000000077", "deployment_ids": "12:aa11, 12:bb22",
        "issuer": "", "enabled": True, "ages_confirmed": True}


def _person(session, user_id: int, org_id: int, role_id: int) -> PublicUser:
    user = User(id=user_id, user_uuid=f"user_{user_id}", username=f"person{user_id}", first_name="A", last_name="B",
                email=f"person{user_id}@ridge.example.com", password="x")
    session.add(user)
    session.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date="now", update_date="now"))
    session.commit()
    return PublicUser.model_validate(user, from_attributes=True)


@pytest.fixture
def school(db):  # noqa: F811
    db.add(Organization(id=3, org_uuid="org_new", name="Valley Middle", slug="valley", email="v@example.test"))
    db.commit()
    return db


def _as(client, user):  # noqa: F811
    client.app.dependency_overrides[get_authenticated_user] = lambda: user


def test_an_admin_sees_what_their_canvas_admin_needs(client, school):  # noqa: F811
    _as(client, _person(school, 50, 3, 1))
    body = client.get(URL.format(org=3)).json()
    assert body["connection"] is None
    assert body["tool"]["config_url"].endswith("/api/v1/lti/canvas.json")
    assert body["tool"]["launch_url"].endswith("/api/v1/lti/launch")


def test_staff_and_other_orgs_admins_cant_open_it(client, school):  # noqa: F811
    _as(client, _person(school, 51, 3, 2))
    assert client.get(URL.format(org=3)).status_code == 403
    _as(client, _person(school, 52, 2, 1))
    assert client.put(URL.format(org=3), json=GOOD).status_code == 403


def test_saving_cleans_the_details_and_records_the_ages_confirmation(client, school):  # noqa: F811
    _as(client, _person(school, 53, 3, 1))
    response = client.put(URL.format(org=3), json=GOOD)
    assert response.status_code == 200, response.text
    connection = response.json()["connection"]
    assert connection["canvas_host"] == "ridge.instructure.com"
    assert connection["issuer"] == "https://canvas.instructure.com"
    assert connection["deployment_ids"] == ["12:aa11", "12:bb22"]
    assert connection["enabled"] and connection["ages_confirmed"]
    stored = school.get(CanvasConnection, school.exec(CanvasConnection.__table__.select().where(CanvasConnection.org_id == 3)).first().id)
    assert stored.ages_confirmed_by == 53

    # Switching off and on again later doesn't ask again.
    assert client.put(URL.format(org=3), json={**GOOD, "enabled": False, "ages_confirmed": False}).status_code == 200
    again = client.put(URL.format(org=3), json={**GOOD, "ages_confirmed": False}).json()["connection"]
    assert again["enabled"] and again["ages_confirmed"]


@pytest.mark.parametrize("change, message", [
    ({"ages_confirmed": False}, "13 and over"),
    ({"client_id": ""}, "client id"),
    ({"deployment_ids": ""}, "deployment id"),
    ({"client_id": "100 000"}, "number Canvas shows"),
    ({"deployment_ids": "not a deployment <script>"}, "deployment id looks like"),
    ({"canvas_host": "javascript:alert(1)"}, "Canvas address"),
    ({"issuer": "http://canvas.example.com"}, "https address"),
])
def test_switching_on_needs_complete_valid_details(client, school, change, message):  # noqa: F811
    _as(client, _person(school, 54, 3, 1))
    response = client.put(URL.format(org=3), json={**GOOD, **change})
    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_an_admin_can_save_a_partial_setup_while_it_stays_off(client, school):  # noqa: F811
    _as(client, _person(school, 55, 3, 1))
    response = client.put(URL.format(org=3), json={**GOOD, "client_id": "", "enabled": False, "ages_confirmed": False})
    assert response.status_code == 200
    assert response.json()["connection"]["enabled"] is False


def test_one_developer_key_belongs_to_one_organization(client, school):  # noqa: F811
    _as(client, _person(school, 56, 3, 1))
    taken = {**GOOD, "client_id": "10000000000042"}  # Ridge High's key in the shared fixture
    response = client.put(URL.format(org=3), json=taken)
    assert response.status_code == 409


def test_every_tier_can_connect_canvas(client, school):  # noqa: F811
    # Valley Middle is on no paid tier (no config at all) and saving still works.
    _as(client, _person(school, 57, 3, 1))
    assert client.put(URL.format(org=3), json=GOOD).status_code == 200

"""Who a Canvas launch is (DEV-173): sign in once to link an account from outside the school, and a full school."""

from html import unescape
from re import search

from fastapi import HTTPException
from sqlmodel import select

from src.db.canvas import CanvasUserLink
from src.db.notifications import NotificationEvent
from src.db.user_organizations import UserOrganization
from src.db.organizations import Organization
from src.db.users import PublicUser, User
from src.security.auth import get_current_user
from src.services.notifications.kinds import RENDER
from src.tests.test_canvas_launch import _launch, _session, client, db, store  # noqa: F401  (shared fixtures)


def _outside_account(session, user_id=60, email="maya@ridge.example.com"):
    session.add(User(id=user_id, email=email, username=f"u{user_id}", first_name="M", last_name="L", password="x",
                     user_uuid=f"user_{user_id}", creation_date="", update_date=""))
    session.add(UserOrganization(user_id=user_id, org_id=1, role_id=4, creation_date="", update_date=""))
    session.commit()
    return session.get(User, user_id)


def _link_url(client) -> str:  # noqa: F811
    page = _session(client, _launch(client)[0].text)
    assert page.status_code == 409
    url = unescape(search(r'href="([^"]+/api/v1/lti/link\?t=[^"]+)"', page.text).group(1))
    assert 'target="_blank"' in page.text
    return url.split("/api/v1", 1)[1]


def _signed_in_as(client, user):  # noqa: F811
    client.app.dependency_overrides[get_current_user] = (
        (lambda: PublicUser.model_validate(user, from_attributes=True)) if user else (lambda: None)
    )


def test_signing_in_once_links_the_account_and_the_next_launch_opens_it(client, db):  # noqa: F811
    maya = _outside_account(db)
    path = "/api/v1" + _link_url(client)

    _signed_in_as(client, None)
    page = client.get(path)
    assert "Sign in to link" in page.text and "/login?next=%2Fapi%2Fv1%2Flti%2Flink" in page.text

    _signed_in_as(client, maya)
    page = client.get(path)
    assert "Link my account" in page.text and "Ridge High" in page.text
    ticket = unescape(search(r'name="t" value="([^"]+)"', page.text).group(1))
    done = client.post("/api/v1/lti/link", data={"t": ticket})
    assert done.status_code == 200 and "Linked" in done.text
    assert db.exec(select(CanvasUserLink).where(CanvasUserLink.user_id == 60)).first().canvas_user_id == "canvas-user-1"
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == 60, UserOrganization.org_id == 2)).first().role_id == 4

    # The link is used once.
    assert client.post("/api/v1/lti/link", data={"t": ticket}).status_code == 401
    # Opening Life2Launch from Canvas again signs Maya into her own account.
    client.app.dependency_overrides.pop(get_current_user)
    again = _session(client, _launch(client)[0].text)
    assert again.status_code == 200
    assert db.exec(select(User).where(User.email == "maya@ridge.example.com")).all() == [maya]


def test_a_different_signed_in_account_cant_take_the_link(client, db):  # noqa: F811
    _outside_account(db)
    someone = _outside_account(db, 61, "someone@else.example.com")
    path = "/api/v1" + _link_url(client)
    ticket = path.split("t=", 1)[1]
    _signed_in_as(client, someone)
    assert "different account" in client.get(path).text
    refused = client.post("/api/v1/lti/link", data={"t": ticket})
    assert refused.status_code == 403
    assert db.exec(select(CanvasUserLink)).first() is None
    # The ticket survives for the right person.
    _signed_in_as(client, db.get(User, 60))
    assert "Link my account" in client.get(path).text


def test_a_full_school_tells_its_admins_once_a_day(client, db, monkeypatch):  # noqa: F811
    db.add(User(id=70, email="admin@ridge.example.com", username="ridgeadmin", first_name="A", last_name="D", password="x",
                user_uuid="user_70", creation_date="", update_date=""))
    db.add(UserOrganization(user_id=70, org_id=2, role_id=1, creation_date="", update_date=""))
    db.commit()

    def full(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="This organization has reached its limit of 25 learners")

    monkeypatch.setattr("src.services.canvas.people.require_role_capacity", full)
    for _ in range(2):
        page = _session(client, _launch(client)[0].text)
        assert page.status_code == 403 and "admin has been told" in page.text
    events = db.exec(select(NotificationEvent).where(NotificationEvent.kind == "seat_limit_reached")).all()
    assert [(event.recipient_user_id, event.data["seat"], event.data["person_name"]) for event in events] == [(70, "learners", "Maya Lopez")]
    item = RENDER["seat_limit_reached"](events[0], db.get(Organization, 2))
    assert "Maya Lopez" in item.line and "Careers 101" in item.line and "learner limit" in item.line
    assert item.link.endswith("/orgs/ridge/admin/org/settings/plan")

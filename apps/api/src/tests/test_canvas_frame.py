"""Inside Canvas (DEV-174): who may frame our pages, and the new-tab ticket."""

from sqlmodel import select

from src.db.canvas import CanvasConnection
from src.db.users import PublicUser, User
from src.security.auth import get_authenticated_user
from src.tests.test_canvas_launch import _launch, _session, _set_cookies, client, db, store  # noqa: F401


def test_each_school_site_allows_only_its_own_switched_on_canvas(client, db):  # noqa: F811
    db.add(CanvasConnection(org_id=1, canvas_host="owner.instructure.com", issuer="https://canvas.instructure.com",
                            client_id="1", deployment_ids=[], enabled=False))
    db.commit()
    assert client.get("/api/v1/lti/framing", params={"org": "ridge"}).json() == {"origins": ["https://ridge.instructure.com"]}
    assert client.get("/api/v1/lti/framing", params={"org": "nobody"}).json() == {"origins": []}
    # The main site is where every school's learners land, so it allows every switched-on Canvas.
    assert client.get("/api/v1/lti/framing").json() == {"origins": ["https://ridge.instructure.com"]}
    assert client.get("/api/v1/lti/framing", params={"org": "life2launch"}).json() == {"origins": ["https://ridge.instructure.com"]}
    ridge = db.exec(select(CanvasConnection).where(CanvasConnection.org_id == 2)).first()
    ridge.enabled = False
    db.add(ridge)
    db.commit()
    assert client.get("/api/v1/lti/framing", params={"org": "ridge"}).json() == {"origins": []}


def _as_launched_student(client, db):  # noqa: F811
    session = _session(client, _launch(client)[0].text)
    assert session.status_code == 200
    maya = db.exec(select(User).where(User.email == "maya@ridge.example.com")).first()
    client.app.dependency_overrides[get_authenticated_user] = lambda: PublicUser.model_validate(maya, from_attributes=True)
    return maya


def test_the_new_tab_ticket_signs_the_same_person_in_first_party(client, db):  # noqa: F811
    _as_launched_student(client, db)
    response = client.post("/api/v1/lti/tab-ticket", json={"org_id": 2, "path": "/plans?tab=done"},
                           cookies={"launchlms_canvas": "1"}, headers={"Origin": "https://life2launch.app"})
    assert response.status_code == 200, response.text
    ticket = response.json()["ticket"]
    tab = client.post("/api/v1/lti/session", data={"ticket": ticket, "mode": "tab"}, follow_redirects=False)
    assert tab.status_code == 303 and tab.headers["location"].endswith("/plans?tab=done")
    cookies = _set_cookies(tab)
    assert "SameSite=lax" in cookies["access_token_cookie"] and "Partitioned" not in cookies["access_token_cookie"]
    # One use only.
    assert client.post("/api/v1/lti/session", data={"ticket": ticket, "mode": "tab"}).status_code == 401


def test_the_new_tab_ticket_is_only_for_canvas_sessions_and_our_own_paths(client, db):  # noqa: F811
    _as_launched_student(client, db)
    client.cookies.clear()  # an ordinary first-party session
    assert client.post("/api/v1/lti/tab-ticket", json={"org_id": 2, "path": "/plans"}).status_code == 403
    response = client.post("/api/v1/lti/tab-ticket", json={"org_id": 2, "path": "//evil.example/x"},
                           cookies={"launchlms_canvas": "1"}, headers={"Origin": "https://life2launch.app"})
    tab = client.post("/api/v1/lti/session", data={"ticket": response.json()["ticket"], "mode": "tab"}, follow_redirects=False)
    assert tab.headers["location"].endswith("/") and "evil" not in tab.headers["location"]

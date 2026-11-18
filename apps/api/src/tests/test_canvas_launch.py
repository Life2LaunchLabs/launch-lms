"""Canvas (LTI 1.3) launch: login, the signed launch, the session handoff and partitioned cookies (DEV-171, DEV-172)."""

import time
from datetime import datetime
from html import unescape
from re import search
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.core.events.database import get_db_session
from src.db.canvas import CanvasConnection, CanvasUserLink
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.security.auth import decode_jwt
from src.services.canvas import launch as lti
from src.services.canvas import session as canvas_session

ISSUER = "https://canvas.instructure.com"
CLIENT_ID = "10000000000042"
DEPLOYMENT = "7:abc"
LTI = "https://purl.imsglobal.org/spec/lti/claim/"
LEARNER = "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"
INSTRUCTOR = "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
CANVAS_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeRedis:
    def __init__(self):
        self.values = {}

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def getdel(self, key):
        return self.values.pop(key, None)


@pytest.fixture
def store(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(lti, "_redis", lambda: fake)
    monkeypatch.setattr(canvas_session, "_redis", lambda: fake)
    monkeypatch.setattr(lti, "_signing_key", lambda connection, token: CANVAS_KEY.public_key())
    return fake


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)
    monkeypatch.setattr("src.services.messages.create_welcome_message_safely", lambda *_args: None)
    with Session(engine) as session:
        stamp = datetime.utcnow().isoformat()
        session.add(Organization(id=1, org_uuid="org_owner", name="Life2Launch", slug="life2launch", email="o@example.test"))
        session.add(Organization(id=2, org_uuid="org_school", name="Ridge High", slug="ridge", email="r@example.test"))
        for org_id in (1, 2):
            session.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", "tier": "free"},
                                           creation_date=stamp, update_date=stamp))
        session.add(Role(id=1, name="Admin", role_uuid="role_1", rights={"dashboard": {"action_access": True}}))
        session.add(Role(id=2, name="Staff", role_uuid="role_2", rights={"dashboard": {"action_access": True}}))
        session.add(Role(id=4, name="Learner", role_uuid="role_4", rights={"dashboard": {"action_access": False}}))
        session.add(CanvasConnection(org_id=2, canvas_host="ridge.instructure.com", issuer=ISSUER, client_id=CLIENT_ID,
                                     deployment_ids=[DEPLOYMENT], enabled=True))
        session.commit()
        yield session


@pytest.fixture
def client(db, store):
    from src.routers import canvas as canvas_router

    app = FastAPI()
    app.include_router(canvas_router.router, prefix="/api/v1/lti")
    app.dependency_overrides[get_db_session] = lambda: db
    with TestClient(app, base_url="https://life2launch.app") as test_client:
        yield test_client


def _login(client, **extra):
    params = {"iss": ISSUER, "client_id": CLIENT_ID, "login_hint": "hint", "target_link_uri": "x",
              "lti_deployment_id": DEPLOYMENT, **extra}
    response = client.get("/api/v1/lti/login", params=params)
    return response


def _form_value(html: str, name: str) -> str:
    return unescape(search(rf'name="{name}" value="([^"]*)"', html).group(1))


def _token(signed_nonce: str, **claims) -> str:
    now = int(time.time())
    body = {
        "iss": ISSUER, "aud": CLIENT_ID, "sub": "canvas-user-1", "iat": now, "exp": now + 300, "nonce": signed_nonce,
        "email": "Maya@Ridge.test", "given_name": "Maya", "family_name": "Lopez", "name": "Maya Lopez",
        f"{LTI}deployment_id": DEPLOYMENT, f"{LTI}message_type": "LtiResourceLinkRequest", f"{LTI}version": "1.3.0",
        f"{LTI}roles": [LEARNER], f"{LTI}context": {"id": "course-9", "title": "Careers 101"},
    }
    body.update(claims)
    return jwt.encode({k: v for k, v in body.items() if v is not None}, CANVAS_KEY, algorithm="RS256",
                      headers={"kid": "canvas"})


def _launch(client, **claims):
    login = _login(client)
    assert login.status_code == 200, login.text
    state, nonce = _form_value(login.text, "state"), _form_value(login.text, "nonce")
    return client.post("/api/v1/lti/launch", data={"id_token": _token(nonce, **claims), "state": state}), state


def _session(client, launch_html: str):
    ticket = _form_value(launch_html, "ticket")
    return client.post("/api/v1/lti/session", data={"ticket": ticket, "mode": "frame"})


def _set_cookies(response) -> dict:
    return {header.split("=", 1)[0]: header for header in response.headers.get_list("set-cookie")}


def test_public_key_and_tool_configuration(client):
    keys = client.get("/api/v1/lti/jwks").json()["keys"]
    assert keys[0]["kty"] == "RSA" and keys[0]["alg"] == "RS256" and keys[0]["kid"]
    assert client.get("/api/v1/lti/jwks").json()["keys"][0]["kid"] == keys[0]["kid"]  # one key, kept
    config = client.get("/api/v1/lti/canvas.json").json()
    assert config["oidc_initiation_url"].endswith("/api/v1/lti/login")
    assert config["target_link_uri"].endswith("/api/v1/lti/launch")
    assert config["public_jwk_url"].endswith("/api/v1/lti/jwks")
    assert config["extensions"][0]["privacy_level"] == "public"


def test_login_sends_the_browser_to_canvas_with_a_partitioned_state_cookie(client, store):
    response = _login(client)
    assert response.status_code == 200
    assert 'action="https://sso.canvaslms.com/api/lti/authorize_redirect"' in response.text
    state = _form_value(response.text, "state")
    assert f"lti:state:{state}" in store.values
    cookie = _set_cookies(response)["launchlms_lti_state"]
    assert "Partitioned" in cookie and "SameSite=none" in cookie and "Secure" in cookie


@pytest.mark.parametrize("params,status", [
    ({"iss": "https://evil.test"}, 404),
    ({"client_id": "999"}, 404),
    ({"lti_deployment_id": "other"}, 403),
    ({"login_hint": ""}, 400),
])
def test_login_refuses_unknown_schools(client, params, status):
    assert _login(client, **params).status_code == status


def test_switched_off_connection_says_not_connected(client, db):
    connection = db.exec(select(CanvasConnection)).one()
    connection.enabled = False
    db.add(connection)
    db.commit()
    response = _login(client)
    assert response.status_code == 404 and "switched off" in response.text


def test_a_student_launch_creates_their_account_and_signs_in_with_partitioned_cookies(client, db):
    client.cookies.clear()
    launch, state = _launch(client)
    assert launch.status_code == 200, launch.text
    assert 'action="http://ridge.' in launch.text or 'action="https://ridge.' in launch.text
    session = _session(client, launch.text)
    assert session.status_code == 200, session.text
    cookies = _set_cookies(session)
    for name in ("access_token_cookie", "refresh_token_cookie", "launchlms_has_session", "launchlms_canvas"):
        assert "Partitioned" in cookies[name] and "SameSite=none" in cookies[name] and "Secure" in cookies[name], name
    access = cookies["access_token_cookie"].split("=", 1)[1].split(";")[0]
    assert decode_jwt(access)["sub"] == "maya@ridge.test"
    user = db.exec(select(User).where(User.email == "maya@ridge.test")).one()
    assert (user.first_name, user.last_name, user.email_verified) == ("Maya", "Lopez", True)
    membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == user.id)).one()
    assert (membership.org_id, membership.role_id) == (2, 4)
    assert db.exec(select(CanvasUserLink)).one().canvas_user_id == "canvas-user-1"
    assert '"/plans"' in session.text or "/plans" in session.text


def test_the_state_is_used_once(client):
    login = _login(client)
    state, nonce = _form_value(login.text, "state"), _form_value(login.text, "nonce")
    token = _token(nonce)
    assert client.post("/api/v1/lti/launch", data={"id_token": token, "state": state}).status_code == 200
    replay = client.post("/api/v1/lti/launch", data={"id_token": token, "state": state})
    assert replay.status_code == 400 and "already used" in replay.text


@pytest.mark.parametrize("claims,status", [
    ({"aud": "someone-else"}, 401),
    ({"iss": "https://evil.test"}, 401),
    ({"nonce": "wrong"}, 401),
    ({"exp": int(time.time()) - 3600}, 400),
    ({f"{LTI}deployment_id": "other"}, 403),
    ({f"{LTI}message_type": "LtiDeepLinkingRequest"}, 400),
    ({"email": None}, 400),
])
def test_launch_refuses_tokens_that_dont_check_out(client, claims, status):
    assert _launch(client, **claims)[0].status_code == status


def test_a_token_signed_by_another_key_is_refused(client):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    login = _login(client)
    state, nonce = _form_value(login.text, "state"), _form_value(login.text, "nonce")
    now = int(time.time())
    forged = jwt.encode({"iss": ISSUER, "aud": CLIENT_ID, "sub": "x", "iat": now, "exp": now + 60, "nonce": nonce,
                         f"{LTI}deployment_id": DEPLOYMENT}, other, algorithm="RS256")
    assert client.post("/api/v1/lti/launch", data={"id_token": forged, "state": state}).status_code == 401


def test_without_the_state_cookie_the_page_checks_platform_storage(client):
    login = _login(client, lti_storage_target="post_message_forwarding")
    state, nonce = _form_value(login.text, "state"), _form_value(login.text, "nonce")
    assert "lti.put_data" in login.text and "post_message_forwarding" in login.text
    client.cookies.clear()
    launch = client.post("/api/v1/lti/launch", data={"id_token": _token(nonce), "state": state,
                                                     "lti_storage_target": "post_message_forwarding"})
    assert launch.status_code == 200
    assert "lti.get_data" in launch.text and "if(false)" in launch.text


def test_a_teacher_arrives_as_staff(client, db):
    session = _session(client, _launch(client, **{f"{LTI}roles": [INSTRUCTOR], "sub": "t-1", "email": "t@ridge.test"})[0].text)
    teacher = db.exec(select(User).where(User.email == "t@ridge.test")).one()
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == teacher.id)).one().role_id == 2
    assert "/admin" in session.text


def test_an_email_already_in_the_school_lands_in_that_account(client, db):
    db.add(User(id=50, email="maya@ridge.test", username="maya", first_name="M", last_name="L", password="x",
                user_uuid="user_50", creation_date="", update_date=""))
    db.add(UserOrganization(user_id=50, org_id=2, role_id=4, creation_date="", update_date=""))
    db.commit()
    _session(client, _launch(client)[0].text)
    assert db.exec(select(User).where(User.email == "maya@ridge.test")).one().id == 50
    assert db.exec(select(CanvasUserLink)).one().user_id == 50


def test_an_email_owned_outside_the_school_is_never_handed_over(client, db):
    db.add(User(id=60, email="maya@ridge.test", username="maya", first_name="M", last_name="L", password="x",
                user_uuid="user_60", creation_date="", update_date=""))
    db.add(UserOrganization(user_id=60, org_id=1, role_id=4, creation_date="", update_date=""))
    db.commit()
    session = _session(client, _launch(client)[0].text)
    assert session.status_code == 409 and "Sign in to it once" in session.text
    assert "access_token_cookie" not in _set_cookies(session)
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == 60, UserOrganization.org_id == 2)).first() is None


def test_tickets_are_single_use_and_the_new_tab_gets_first_party_cookies(client):
    session = _session(client, _launch(client)[0].text)
    tab_ticket = search(r'name="ticket" value="([^"]+)"><input type="hidden" name="mode" value="tab"', session.text).group(1)
    tab = client.post("/api/v1/lti/session", data={"ticket": tab_ticket, "mode": "tab"}, follow_redirects=False)
    assert tab.status_code == 303 and tab.headers["location"].endswith("/plans")
    cookies = _set_cookies(tab)
    assert "Partitioned" not in cookies["access_token_cookie"] and "samesite=lax" in cookies["access_token_cookie"].lower()
    assert "launchlms_canvas" not in cookies
    assert client.post("/api/v1/lti/session", data={"ticket": tab_ticket, "mode": "tab"}).status_code == 401


def test_a_second_student_on_the_same_device_gets_their_own_account(client):
    first = _set_cookies(_session(client, _launch(client)[0].text))["access_token_cookie"]
    second = _set_cookies(_session(client, _launch(client, sub="canvas-user-2", email="leo@ridge.test")[0].text))["access_token_cookie"]
    sub = lambda header: decode_jwt(header.split("=", 1)[1].split(";")[0])["sub"]  # noqa: E731
    assert (sub(first), sub(second)) == ("maya@ridge.test", "leo@ridge.test")


def test_a_full_school_refuses_the_next_student(client, db, monkeypatch):
    from fastapi import HTTPException

    def full(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="This organization has reached its limit of 25 learners")

    monkeypatch.setattr("src.services.canvas.people.require_role_capacity", full)
    session = _session(client, _launch(client)[0].text)
    assert session.status_code == 403 and "limit of 25 learners" in session.text
    assert db.exec(select(User).where(User.email == "maya@ridge.test")).first() is None


def test_api_cookie_setters_keep_a_canvas_session_partitioned():
    from starlette.requests import Request
    from starlette.responses import Response

    from src.routers.auth import set_auth_cookies, unset_auth_cookies

    def request(cookie: str) -> Request:
        return Request({"type": "http", "method": "POST", "path": "/", "scheme": "https", "query_string": b"",
                        "headers": [(b"host", b"life2launch.app"), (b"cookie", cookie.encode())],
                        "client": ("127.0.0.1", 1)})

    for setter in (lambda r, q: set_auth_cookies(r, "a", "b", q), lambda r, q: unset_auth_cookies(r, q)):
        canvas, normal = Response(), Response()
        setter(canvas, request("launchlms_canvas=1"))
        setter(normal, request(""))
        assert all("Partitioned" in h and "SameSite=none" in h for h in canvas.headers.getlist("set-cookie"))
        assert all("Partitioned" not in h and "SameSite=lax" in h for h in normal.headers.getlist("set-cookie"))


def test_cloud_and_self_hosted_canvas_sign_from_the_right_place():
    from src.services.canvas import connections

    cloud = SimpleNamespace(issuer=ISSUER, canvas_host="ridge.instructure.com")
    beta = SimpleNamespace(issuer="https://canvas.beta.instructure.com", canvas_host="ridge.beta.instructure.com")
    own = SimpleNamespace(issuer=ISSUER, canvas_host="canvas.ridge.edu")
    assert connections.authorize_url(cloud) == "https://sso.canvaslms.com/api/lti/authorize_redirect"
    assert connections.platform_jwks_url(beta) == "https://sso.beta.canvaslms.com/api/lti/security/jwks"
    assert connections.authorize_url(own) == "https://canvas.ridge.edu/api/lti/authorize_redirect"
    assert connections.clean_host("https://Ridge.Instructure.com/courses/4") == "ridge.instructure.com"
    assert connections.clean_host("not a host") == ""

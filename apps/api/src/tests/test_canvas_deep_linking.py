# ruff: noqa: F811  (pytest fixtures imported from test_canvas_launch)
"""Canvas deep linking: a teacher picks a plan inside Canvas, and the module item opens straight into it (PF-4)."""

from datetime import datetime
from html import unescape
from re import findall

import jwt
from cryptography.hazmat.primitives import serialization
from sqlmodel import select

from src.db.goals import Goal
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.canvas import keys
from src.tests.test_canvas_launch import (  # noqa: F401 (fixtures)
    CLIENT_ID, DEPLOYMENT, INSTRUCTOR, ISSUER, LEARNER, LTI, _form_value, _launch, _session, client, db, store,
)

DL = "https://purl.imsglobal.org/spec/lti-dl/claim/"
RETURN_URL = "https://ridge.instructure.com/courses/9/deep_linking_response?modal=true"
STEPS = [{"key": "one", "type": "task", "title": "First step"}, {"key": "two", "type": "task", "title": "Second step"}]


def _admin(db) -> PublicUser:
    stamp = datetime.utcnow().isoformat()
    db.add(User(id=50, user_uuid="user_50", username="ridgeadmin", email="admin@ridge.example.com", first_name="Ada",
                last_name="Admin", creation_date=stamp, update_date=stamp))
    db.add(UserOrganization(user_id=50, org_id=2, role_id=1, creation_date=stamp, update_date=stamp))
    db.commit()
    return PublicUser(id=50, user_uuid="user_50", username="ridgeadmin", email="admin@ridge.example.com",
                      first_name="Ada", last_name="Admin")


def _plan(db, admin: PublicUser, title: str, publish: bool = True) -> str:
    from src.services.goals import templates

    document = {"template": {"title": title, "description": f"About {title}"},
                "stages": [{"key": "start", "title": "Start", "steps": [dict(step) for step in STEPS]}]}
    uuid = templates.create_template(db, admin, 2, document)["template_uuid"]
    if publish:
        templates.publish(db, admin, 2, uuid, "First")
    return uuid


def _deep_link_claims(**settings) -> dict:
    return {
        f"{LTI}message_type": "LtiDeepLinkingRequest", f"{LTI}roles": [INSTRUCTOR],
        f"{DL}deep_linking_settings": {"deep_link_return_url": RETURN_URL, "accept_types": ["ltiResourceLink"],
                                       "accept_presentation_document_targets": ["iframe"], "data": "canvas-opaque", **settings},
        "https://www.instructure.com/placement": "link_selection",
    }


def _public_key(db):
    pem = keys.private_key_pem(db)
    return serialization.load_pem_private_key(pem.encode(), password=None).public_key()


def test_the_tool_configuration_offers_the_plan_picker_in_modules_and_assignments(client):
    placements = client.get("/api/v1/lti/canvas.json").json()["extensions"][0]["settings"]["placements"]
    picker = {item["placement"]: item for item in placements if item["message_type"] == "LtiDeepLinkingRequest"}
    assert set(picker) == {"link_selection", "assignment_selection"}
    assert picker["link_selection"]["target_link_uri"].endswith("/api/v1/lti/launch")
    # The course link students already use stays as it was.
    assert any(item["placement"] == "course_navigation" and item["message_type"] == "LtiResourceLinkRequest" for item in placements)


def test_a_teacher_picks_a_published_plan_and_canvas_gets_a_signed_link_to_it(client, db):
    admin = _admin(db)
    careers = _plan(db, admin, "Career explorer")
    _plan(db, admin, "Unpublished draft", publish=False)
    picker, _state = _launch(client, **_deep_link_claims())
    assert picker.status_code == 200, picker.text
    assert "Add a Life2Launch plan" in picker.text
    offered = [unescape(value) for value in findall(r'name="plan" id="p\d+" value="([^"]*)"', picker.text)]
    assert offered == [careers]  # drafts can't be handed out
    assert "set-cookie" not in picker.headers  # nobody is signed in to pick

    done = client.post("/api/v1/lti/deep-link", data={"ticket": _form_value(picker.text, "ticket"), "plan": careers})
    assert done.status_code == 200, done.text
    assert f'action="{RETURN_URL.replace("&", "&amp;")}"' in done.text
    assert "form-action https://ridge.instructure.com" in done.headers["content-security-policy"]
    claims = jwt.decode(_form_value(done.text, "JWT"), _public_key(db), algorithms=["RS256"], audience=ISSUER)
    assert claims["iss"] == CLIENT_ID
    assert claims[f"{LTI}message_type"] == "LtiDeepLinkingResponse"
    assert claims[f"{LTI}deployment_id"] == DEPLOYMENT
    assert claims[f"{DL}data"] == "canvas-opaque"
    [item] = claims[f"{DL}content_items"]
    assert item["type"] == "ltiResourceLink" and item["title"] == "Career explorer"
    assert item["custom"] == {"plan": careers}
    assert item["url"].endswith("/api/v1/lti/launch")
    # The ticket is used once.
    again = client.post("/api/v1/lti/deep-link", data={"ticket": _form_value(picker.text, "ticket"), "plan": careers})
    assert again.status_code == 401


def test_cancelling_sends_canvas_an_empty_answer(client, db):
    picker, _state = _launch(client, **_deep_link_claims())
    done = client.post("/api/v1/lti/deep-link", data={"ticket": _form_value(picker.text, "ticket"), "cancel": "1"})
    assert done.status_code == 200
    claims = jwt.decode(_form_value(done.text, "JWT"), _public_key(db), algorithms=["RS256"], audience=ISSUER)
    assert claims[f"{DL}content_items"] == []


def test_no_plans_yet_says_what_to_do(client, db):
    picker, _state = _launch(client, **_deep_link_claims())
    assert "No plans to add yet" in picker.text


def test_only_teachers_pick_and_only_the_schools_canvas_gets_the_answer(client, db):
    student, _ = _launch(client, **{**_deep_link_claims(), f"{LTI}roles": [LEARNER]})
    assert student.status_code == 403
    elsewhere, _ = _launch(client, **_deep_link_claims(deep_link_return_url="https://evil.example.com/steal"))
    assert elsewhere.status_code == 400


def test_a_plan_from_another_school_cant_be_slipped_in(client, db):
    from src.db.organizations import Organization
    from src.services.goals import templates

    stamp = datetime.utcnow().isoformat()
    db.add(Organization(id=3, org_uuid="org_other", name="Other", slug="other", email="x@example.test"))
    db.add(User(id=60, user_uuid="user_60", username="other", email="other@example.com", first_name="O", last_name="T",
                creation_date=stamp, update_date=stamp))
    db.add(UserOrganization(user_id=60, org_id=3, role_id=1, creation_date=stamp, update_date=stamp))
    db.commit()
    other = PublicUser(id=60, user_uuid="user_60", username="other", email="other@example.com", first_name="O", last_name="T")
    doc = {"template": {"title": "Theirs"}, "stages": [{"key": "s", "title": "S", "steps": [dict(step) for step in STEPS]}]}
    theirs = templates.create_template(db, other, 3, doc)["template_uuid"]
    templates.publish(db, other, 3, theirs, "First")
    picker, _ = _launch(client, **_deep_link_claims())
    done = client.post("/api/v1/lti/deep-link", data={"ticket": _form_value(picker.text, "ticket"), "plan": theirs})
    assert done.status_code == 404


def _plan_launch(client, plan: str, roles: list[str], sub: str = "canvas-user-1", email: str = "Maya@ridge.example.com"):
    launch, _ = _launch(client, **{f"{LTI}custom": {"plan": plan}, f"{LTI}roles": roles, "sub": sub, "email": email,
                                   f"{LTI}resource_link": {"id": "link-1", "title": "Career explorer"}})
    assert launch.status_code == 200, launch.text
    return _session(client, launch.text)


def _destination(response) -> str:
    return unescape(findall(r'var dest="([^"]*)"', response.text)[0])


def test_a_student_opening_the_item_lands_on_their_own_goal_started_once(client, db):
    careers = _plan(db, _admin(db), "Career explorer")
    first = _plan_launch(client, careers, [LEARNER])
    assert first.status_code == 200, first.text
    goals = db.exec(select(Goal).where(Goal.title == "Career explorer")).all()
    [goal] = [item for item in goals if item.subject_user_id and item.subject_user_id != 50]
    assert _destination(first).endswith(f"/plans/{goal.goal_uuid}")
    second = _plan_launch(client, careers, [LEARNER])
    assert _destination(second).endswith(f"/plans/{goal.goal_uuid}")
    assert len([item for item in db.exec(select(Goal).where(Goal.subject_user_id == goal.subject_user_id)).all()
                if item.title == "Career explorer"]) == 1


def test_a_teacher_opening_the_item_lands_on_the_plans_staff_view(client, db):
    careers = _plan(db, _admin(db), "Career explorer")
    response = _plan_launch(client, careers, [INSTRUCTOR], sub="canvas-teacher", email="teach@ridge.example.com")
    assert _destination(response).endswith(f"/admin/plans/{careers}")
    assert not db.exec(select(Goal).where(Goal.subject_user_id != None, Goal.subject_user_id != 50)).all()  # noqa: E711


def test_a_removed_plan_shows_a_plain_message(client, db):
    _plan(db, _admin(db), "Career explorer")
    missing = _plan_launch(client, "template_gone", [LEARNER])
    assert missing.status_code == 404
    assert "in Life2Launch any more" in unescape(missing.text)

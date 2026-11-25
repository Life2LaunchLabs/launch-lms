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


# Grade passback (PF-5) -----------------------------------------------------------------------------------------

AGS = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"
LINEITEM = "https://ridge.instructure.com/api/lti/courses/course-9/line_items/31"


def test_a_plan_added_as_an_assignment_asks_canvas_for_a_gradebook_column(client, db):
    careers = _plan(db, _admin(db), "Career explorer")
    claims = {**_deep_link_claims(), "https://www.instructure.com/placement": "assignment_selection"}
    picker, _ = _launch(client, **claims)
    assert "this assignment" in picker.text
    done = client.post("/api/v1/lti/deep-link", data={"ticket": _form_value(picker.text, "ticket"), "plan": careers})
    [item] = jwt.decode(_form_value(done.text, "JWT"), _public_key(db), algorithms=["RS256"], audience=ISSUER)[f"{DL}content_items"]
    assert item["lineItem"] == {"scoreMaximum": 100.0, "label": "Career explorer", "resourceId": careers}
    # Added to a module, it's a plain link with no column.
    picker, _ = _launch(client, **_deep_link_claims())
    done = client.post("/api/v1/lti/deep-link", data={"ticket": _form_value(picker.text, "ticket"), "plan": careers})
    [item] = jwt.decode(_form_value(done.text, "JWT"), _public_key(db), algorithms=["RS256"], audience=ISSUER)[f"{DL}content_items"]
    assert "lineItem" not in item
    scopes = client.get("/api/v1/lti/canvas.json").json()["scopes"]
    assert "https://purl.imsglobal.org/spec/lti-ags/scope/score" in scopes


def _assignment_launch(client, plan: str, sub: str, email: str, roles=None):
    launch, _ = _launch(client, **{f"{LTI}custom": {"plan": plan}, f"{LTI}roles": roles or [LEARNER], "sub": sub, "email": email,
                                   f"{LTI}resource_link": {"id": "assignment-link"},
                                   AGS: {"scope": ["https://purl.imsglobal.org/spec/lti-ags/scope/score"], "lineitem": LINEITEM}})
    return _session(client, launch.text)


def _finish(db, goal_uuid: str) -> None:
    from src.db.goals import StepStatus, StepStatusChange
    from src.services.goals import goals as goal_service

    goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()
    user = db.get(User, goal.subject_user_id)
    viewer = PublicUser.model_validate(user.model_dump())
    for stage in goal_service.get_goal(db, viewer, goal_uuid)["stages"]:
        for step in stage["steps"]:
            goal_service.change_status(db, viewer, goal_uuid, step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))


class FakeCanvas:
    def __init__(self, score_status=200):
        self.score_status, self.scores, self.token_scopes = score_status, [], []

    def __call__(self, request):
        import httpx
        from urllib.parse import parse_qs

        if request.url.path == "/login/oauth2/token":
            self.token_scopes.append(parse_qs(request.content.decode())["scope"][0])
            return httpx.Response(200, json={"access_token": "canvas-token", "expires_in": 3600})
        self.scores.append((str(request.url), request.headers.get("content-type"), __import__("json").loads(request.content)))
        return httpx.Response(self.score_status, json={})


def _client_for(fake):
    import httpx

    return httpx.Client(transport=httpx.MockTransport(fake))


def test_a_finished_plan_reaches_the_gradebook_and_unfinished_students_get_nothing(client, db):
    from src.db.canvas import CanvasPlanLink, CanvasScore
    from src.services.canvas import grades

    careers = _plan(db, _admin(db), "Career explorer")
    maya = _assignment_launch(client, careers, "canvas-maya", "maya@ridge.example.com")
    _assignment_launch(client, careers, "canvas-leo", "leo@ridge.example.com")
    [link] = db.exec(select(CanvasPlanLink)).all()
    assert link.lineitem_url == LINEITEM and link.canvas_course_id == "course-9"
    _finish(db, _destination(maya).rsplit("/", 1)[1])
    [row] = db.exec(select(CanvasScore)).all()  # Leo hasn't finished: nothing for him
    assert row.canvas_user_id == "canvas-maya" and row.status == "pending"

    fake = FakeCanvas()
    assert grades.send_due(db, _client_for(fake)) == {"sent": 1, "pending": 0, "failed": 0}
    [(url, ctype, body)] = fake.scores
    assert url == LINEITEM + "/scores" and ctype == "application/vnd.ims.lis.v1.score+json"
    assert body["userId"] == "canvas-maya" and body["scoreGiven"] == body["scoreMaximum"] == 100.0
    assert body["activityProgress"] == "Completed" and body["gradingProgress"] == "FullyGraded"
    assert fake.token_scopes == ["https://purl.imsglobal.org/spec/lti-ags/scope/score"]
    db.refresh(row)
    assert row.status == "sent"
    assert grades.send_due(db, _client_for(fake))["sent"] == 0  # sent once


def test_a_canvas_outage_is_retried_and_a_refusal_stops(client, db):
    from src.db.canvas import CanvasScore
    from src.services.canvas import grades

    careers = _plan(db, _admin(db), "Career explorer")
    _finish(db, _destination(_assignment_launch(client, careers, "canvas-maya", "maya@ridge.example.com")).rsplit("/", 1)[1])
    assert grades.send_due(db, _client_for(FakeCanvas(503)))["pending"] == 1
    row = db.exec(select(CanvasScore)).one()
    assert row.attempts == 1 and row.next_attempt_at > grades._stamp() and "503" in row.last_error
    assert grades.send_due(db, _client_for(FakeCanvas()))["sent"] == 0  # not due yet
    row.next_attempt_at = grades._stamp()
    db.add(row)
    db.commit()
    assert grades.send_due(db, _client_for(FakeCanvas(404)))["failed"] == 1


def test_students_who_finished_before_the_column_appeared_are_sent_too(client, db):
    from src.db.canvas import CanvasScore

    careers = _plan(db, _admin(db), "Career explorer")
    # Maya opens it from a module item (no column) and finishes.
    goal_uuid = _destination(_plan_launch(client, careers, [LEARNER], sub="canvas-maya", email="maya@ridge.example.com")).rsplit("/", 1)[1]
    _finish(db, goal_uuid)
    assert not db.exec(select(CanvasScore)).all()
    # The teacher then opens the assignment version, whose launch names the column.
    _assignment_launch(client, careers, "canvas-teacher", "teach@ridge.example.com", roles=[INSTRUCTOR])
    [row] = db.exec(select(CanvasScore)).all()
    assert row.canvas_user_id == "canvas-maya"


def test_a_column_on_another_site_is_ignored(client, db):
    from src.db.canvas import CanvasPlanLink

    careers = _plan(db, _admin(db), "Career explorer")
    launch, _ = _launch(client, **{f"{LTI}custom": {"plan": careers}, f"{LTI}resource_link": {"id": "x"},
                                   AGS: {"lineitem": "https://evil.example.com/line_items/1"}})
    _session(client, launch.text)
    assert db.exec(select(CanvasPlanLink)).one().lineitem_url is None

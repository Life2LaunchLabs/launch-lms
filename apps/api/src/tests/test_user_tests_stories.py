"""User tests phase 3: a cohort's stages, the run board, persona reports and the findings report."""

import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.user_tests import TestEvent, TestMail, TestPersona
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.user_tests import cohorts, personas, sessions, stories


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("LAUNCHLMS_USER_TESTS_ENABLED", "true")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    import src.core.events.database as database

    monkeypatch.setattr(database, "engine", engine)
    with Session(engine) as session:
        session.add(Organization(id=1, name="Launch", slug="launch", email="team@example.com", org_uuid="org_main", creation_date="", update_date=""))
        session.add(User(id=1, username="admin", first_name="Real", last_name="Admin", email="admin@example.com", user_uuid="user_1", creation_date="", update_date=""))
        session.add(UserOrganization(user_id=1, org_id=1, role_id=ADMIN_ROLE_ID, creation_date="", update_date=""))
        session.commit()
        token = sessions.current_test_persona.set(None)
        try:
            yield session
        finally:
            sessions.current_test_persona.reset(token)


def _run(db: Session) -> tuple[dict, dict, dict]:
    cohort = cohorts.create_cohort(db, 1, cohorts.CreateCohort(name="Riverside onboarding"))
    body = personas.CreatePersonas(personas=[
        personas.CreatePersona(first_name="Dana", brief="Counselor setting up her school", start_state="org_owner", org_name="Riverside High"),
        personas.CreatePersona(first_name="Maya", brief="Ninth grader on a phone"),
    ])
    dana, maya = asyncio.run(personas.create_personas(db, cohort["cohort_uuid"], body))
    stories.set_stages(db, cohort["cohort_uuid"], stories.SetStages(stages=[
        stories.Stage(title="Invite your students", goal="Invite Maya to Riverside High."),
        stories.Stage(title="Join your school", goal="Join from the invite and find your first plan.", after=stories.After(persona="dana", stage="invite-your-students")),
    ]))
    return cohort, dana, maya


def _cells(board: dict, user_id: int) -> dict:
    row = next(item for item in board["personas"] if item["user_id"] == user_id)
    return {cell["stage_key"]: cell for cell in row["cells"]}


def test_stages_wait_on_another_persona_until_their_stage_is_done(db):
    cohort, dana, maya = _run(db)
    board = stories.board(db, cohort["cohort_uuid"])
    assert [stage["key"] for stage in board["stages"]] == ["invite-your-students", "join-your-school"]
    assert _cells(board, maya["user_id"])["join-your-school"] == {**_cells(board, maya["user_id"])["join-your-school"], "status": "waiting", "waiting_on": "Dana: Invite your students"}
    # Dana doesn't wait on herself.
    assert _cells(board, dana["user_id"])["join-your-school"]["status"] == "not_started"
    stories.report_progress(db, db.get(TestPersona, dana["user_id"]), stories.Progress(stage_key="invite-your-students", status="done", note="Sent"))
    board = stories.board(db, cohort["cohort_uuid"])
    assert _cells(board, maya["user_id"])["join-your-school"]["status"] == "not_started"


def test_stuck_personas_come_first_on_the_board(db):
    cohort, dana, maya = _run(db)
    stories.report_progress(db, db.get(TestPersona, maya["user_id"]), stories.Progress(stage_key="join-your-school", status="stuck", note="No join button"))
    board = stories.board(db, cohort["cohort_uuid"])
    assert board["personas"][0]["user_id"] == maya["user_id"] and board["counts"]["stuck"] == 1


def test_stages_must_name_personas_and_stages_in_the_cohort(db):
    cohort, _, _ = _run(db)
    with pytest.raises(HTTPException) as unknown:
        stories.set_stages(db, cohort["cohort_uuid"], stories.SetStages(stages=[stories.Stage(title="Join", after=stories.After(persona="nobody", stage="join"))]))
    assert unknown.value.status_code == 422
    with pytest.raises(HTTPException) as missing:
        stories.report_progress(db, db.exec(select(TestPersona)).first(), stories.Progress(stage_key="nope", status="done"))
    assert missing.value.status_code == 404


def test_findings_and_refused_actions_make_the_report(db):
    cohort, dana, maya = _run(db)
    persona = db.get(TestPersona, maya["user_id"])
    stories.log_finding(db, persona, stories.Finding(kind="confusion", severity="high", stage_key="join-your-school", page="/invite", what_happened="I couldn't tell which button joins.", what_wanted="One clear Join button"))
    stories.log_finding(db, persona, stories.Finding(kind="bug", what_happened="The plan list was empty."))
    sessions.current_test_persona.set(maya["user_id"])
    stories.record_blocked("Test personas can't do this.", {"request": "PUT /api/v1/users/change_password/2"})
    assert len(stories.events(db, cohort["cohort_uuid"], kind="finding")) == 2
    assert len(stories.events(db, cohort["cohort_uuid"], kind="blocked")) == 1
    markdown = stories.report(db, cohort["cohort_uuid"])
    assert "## Bugs (1)" in markdown and "## Confusing parts (1)" in markdown and "## Refused by the test seal (1)" in markdown
    assert "**high** I couldn't tell which button joins. (Maya · Join your school · /invite)" in markdown
    assert "Wanted: One clear Join button" in markdown


def test_a_persona_sees_its_own_stages_and_mail_but_no_briefs(db):
    cohort, dana, maya = _run(db)
    db.add(TestMail(cohort_id=db.exec(select(TestPersona.cohort_id)).first(), to_address=maya["email"], to_user_id=maya["user_id"], subject="Join Riverside High"))
    db.commit()
    view = stories.persona_view(db, db.get(TestPersona, maya["user_id"]), db.get(User, maya["user_id"]))
    assert view["unread_mail"] == 1 and view["persona"]["name"] == "Maya"
    assert [stage["status"] for stage in view["stages"]] == ["not_started", "waiting"]
    assert "brief" not in str(view) and "Counselor" not in str(view)


def test_only_a_personas_own_session_reaches_its_tools(db):
    from src.routers.user_tests import persona_session

    _, _, maya = _run(db)
    admin = PublicUser(id=1, username="admin", first_name="Real", last_name="Admin", email="admin@example.com", user_uuid="user_1")
    with pytest.raises(HTTPException) as refused:
        persona_session(admin, db)
    assert refused.value.status_code == 403
    sessions.current_test_persona.set(maya["user_id"])
    me = PublicUser(id=maya["user_id"], username="maya", first_name="Maya", last_name="", email=maya["email"], user_uuid="u")
    persona, user = persona_session(me, db)
    assert persona.user_id == user.id == maya["user_id"]
    assert db.exec(select(TestEvent)).all() == []

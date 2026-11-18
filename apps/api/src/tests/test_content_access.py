"""DEV-137 and DEV-160: learners' uploads open for the owner, people sharing the plan they are on, and staff of the
organization that manages that plan; everyone else gets 404.

Both content routers are exercised: the filesystem one on a temporary content folder, the S3 one on a fake bucket.
"""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.core.events.database import get_db_session
from src.db.goal_sharing import PlanCollaborator, PlanRole
from src.db.goal_sharing import PlanAttachment
from src.db.goals import Goal, GoalStep, StepEntry, StepProgress
from src.db.learning import LearningResponseAttempt, LearningRun
from src.db.media import MediaAsset
from src.db.organizations import Organization
from src.db.portfolio import Portfolio
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.security.auth import get_current_user
from src.services import content_access

NOW = "2026-11-17T00:00:00"
OWNER, STAFF, OTHER_STAFF, CLASSMATE, MENTOR, SUPER = 1, 2, 3, 4, 5, 6
HAND_IN = "users/user_1/media/essay.pdf"
NOTE = "users/user_1/resources/res_1/notes/note.png"
AVATAR = "users/user_1/avatars/me.png"
LOGO = "orgs/org_1/logos/logo.png"
PERSONAL = "users/user_1/media/journal.pdf"
OTHER_ORG = "users/user_1/media/other-school.pdf"
COVER = "users/user_1/media/project-cover.png"
STAFF_FILE = "users/user_2/media/rubric.pdf"
FILES = [HAND_IN, NOTE, AVATAR, LOGO, "users/user_1/media/portrait.png", "users/user_1/media/showcase.png", PERSONAL, OTHER_ORG, COVER, STAFF_FILE]


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    session.add_all([
        Organization(id=1, org_uuid="org_1", name="Lincoln High", slug="lincoln", email="a@example.com", creation_date=NOW, update_date=NOW),
        Organization(id=2, org_uuid="org_2", name="Other School", slug="other", email="b@example.com", creation_date=NOW, update_date=NOW),
        Role(id=1, name="Admin", rights={}, role_uuid="role_admin"),
        Role(id=2, name="Staff", rights={}, role_uuid="role_staff"),
        Role(id=4, name="Learner", rights={}, role_uuid="role_learner"),
    ])
    for user_id, name in [(OWNER, "maya"), (STAFF, "rivera"), (OTHER_STAFF, "stone"), (CLASSMATE, "theo"), (MENTOR, "mentor"), (SUPER, "root")]:
        session.add(User(id=user_id, user_uuid=f"user_{user_id}", username=name, email=f"{name}@example.com", first_name=name, last_name="X",
                         is_superadmin=user_id == SUPER, creation_date=NOW, update_date=NOW))
    # Maya is a learner in both schools; Rivera staffs Lincoln, Stone the other school.
    for user_id, org_id, role_id in [(OWNER, 1, 4), (OWNER, 2, 4), (STAFF, 1, 2), (OTHER_STAFF, 2, 2), (CLASSMATE, 1, 4), (MENTOR, 2, 4)]:
        session.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date=NOW, update_date=NOW))
    session.commit()
    content_access._portfolio_cache.clear()
    yield session
    session.close()


def _viewer(user_id: int | None):
    if user_id is None:
        return AnonymousUser()
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=f"u{user_id}@example.com",
                      first_name="U", last_name=str(user_id), is_superadmin=user_id == SUPER)


def _app(router, db, viewer: dict) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: _viewer(viewer["id"])
    return TestClient(app)


@pytest.fixture
def local(db, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    for path in FILES:
        target = tmp_path / "content" / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"file")
    from src.routers.local_content import router

    viewer = {"id": None}
    return _app(router, db, viewer), viewer


class _Bucket:
    def head_object(self, Bucket, Key):
        if Key.removeprefix("content/") not in FILES:
            raise KeyError(Key)
        return {"ContentLength": 4}

    def get_object(self, Bucket, Key, Range=None):
        return {"Body": SimpleNamespace(read=lambda: b"file")}


@pytest.fixture
def s3(db, monkeypatch):
    import src.routers.content_files as content_files

    monkeypatch.setattr(content_files, "get_storage_client", lambda: _Bucket())
    monkeypatch.setattr(content_files, "get_s3_bucket_name", lambda: "bucket")
    viewer = {"id": None}
    return _app(content_files.router, db, viewer), viewer


@pytest.fixture(params=["local", "s3"])
def served(request):
    return request.getfixturevalue(request.param)


def _status(served, user_id: int | None, path: str) -> int:
    client, viewer = served
    viewer["id"] = user_id
    return client.get(f"/content/{path}").status_code


_ids = {"goal": 0, "row": 0}


def _goal(db, org_id: int | None, external: bool = True) -> Goal:
    _ids["goal"] += 1
    number = _ids["goal"]
    goal = Goal(id=number, goal_uuid=f"goal_{number}", org_id=org_id, owner_user_id=OWNER, subject_user_id=OWNER, title=f"Plan {number}",
                ownership="external" if external else "personal", source="assignment" if external else "none", creation_date=NOW, update_date=NOW)
    db.add(goal)
    db.flush()
    return goal


def _step(db, goal: Goal, step_type: str = "upload", config: dict | None = None) -> GoalStep:
    _ids["row"] += 1
    step = GoalStep(step_uuid=f"step_{_ids['row']}", goal_id=int(goal.id), type=step_type, title="Hand it in", config=config or {}, creation_date=NOW, update_date=NOW)
    db.add(step)
    db.flush()
    return step


def _hand_in(db, goal: Goal, path: str, owner: int = OWNER) -> None:
    """The learner uploads ``path`` to their media library and hands it in on a step of ``goal``."""
    _ids["row"] += 1
    asset = MediaAsset(asset_uuid=f"asset_{_ids['row']}", owner_type="user", source_type="upload", media_type="document",
                       url=f"/content/{path}", owner_user_id=owner, creation_date=NOW, update_date=NOW)
    db.add(asset)
    db.flush()
    step = _step(db, goal)
    db.add(StepEntry(entry_uuid=f"entry_{_ids['row']}", step_id=int(step.id), kind="file", asset_id=int(asset.id), creation_date=NOW, update_date=NOW))
    db.commit()


@pytest.fixture(autouse=True)
def _fresh_ids():
    _ids.update(goal=0, row=0)


@pytest.mark.parametrize("path", [HAND_IN, NOTE])
def test_uploads_on_no_plan_open_for_the_owner_and_superadmins_only(served, path):
    assert _status(served, OWNER, path) == 200
    assert _status(served, SUPER, path) == 200
    # Signed out, staff of either school and a classmate get 404, never 403.
    assert _status(served, None, path) == 404
    assert _status(served, STAFF, path) == 404
    assert _status(served, OTHER_STAFF, path) == 404
    assert _status(served, CLASSMATE, path) == 404


def test_staff_open_hand_ins_only_on_plans_their_organization_manages(served, db):
    _hand_in(db, _goal(db, 1), HAND_IN)
    _hand_in(db, _goal(db, 1, external=False), PERSONAL)
    _hand_in(db, _goal(db, 2), OTHER_ORG)
    # Lincoln's plan: Lincoln's staff open it, the other school's staff don't.
    assert _status(served, STAFF, HAND_IN) == 200
    assert _status(served, OTHER_STAFF, HAND_IN) == 404
    # A personal plan (even one filed under Lincoln) stays the learner's.
    assert _status(served, STAFF, PERSONAL) == 404
    assert _status(served, OTHER_STAFF, PERSONAL) == 404
    # The other school's plan: only its staff, though Maya belongs to both.
    assert _status(served, STAFF, OTHER_ORG) == 404
    assert _status(served, OTHER_STAFF, OTHER_ORG) == 200
    # Classmates still see nothing; the learner sees everything.
    assert _status(served, CLASSMATE, HAND_IN) == 404
    for path in (HAND_IN, PERSONAL, OTHER_ORG):
        assert _status(served, OWNER, path) == 200


def test_files_in_a_written_answer_feedback_or_attachment_count_as_on_the_plan(served, db):
    goal = _goal(db, 1)
    step = _step(db, goal, "writeup")
    db.add(StepProgress(progress_uuid="p1", step_id=int(step.id), submission={"html": f'<p>Draft</p><img src="https://x.app/api/v1/content/{HAND_IN}">'},
                        creation_date=NOW, update_date=NOW))
    asset = MediaAsset(asset_uuid="att", owner_type="user", source_type="upload", media_type="document", url=f"/content/{PERSONAL}",
                       owner_user_id=OWNER, creation_date=NOW, update_date=NOW)
    db.add(asset)
    db.flush()
    db.add(PlanAttachment(goal_id=int(goal.id), asset_id=int(asset.id), added_by_user_id=OWNER, creation_date=NOW))
    db.commit()
    assert _status(served, STAFF, HAND_IN) == 200
    assert _status(served, STAFF, PERSONAL) == 200
    assert _status(served, OTHER_STAFF, HAND_IN) == 404


def test_activity_answers_on_the_plan_open_for_its_staff(served, db):
    goal = _goal(db, 1)
    step = _step(db, goal, "activity")
    run = LearningRun(run_uuid="run_1", activity_id=1, org_id=1, goal_id=int(goal.id), goal_step_id=int(step.id), user_id=OWNER)
    db.add(run)
    db.flush()
    db.add(LearningResponseAttempt(attempt_uuid="a1", run_id=int(run.id), page_id=1, user_id=OWNER, answer={"q1": {"image_url": f"/content/{HAND_IN}"}}))
    db.commit()
    assert _status(served, STAFF, HAND_IN) == 200
    assert _status(served, OTHER_STAFF, HAND_IN) == 404


def test_portfolio_files_open_for_staff_only_when_a_step_on_their_plan_counts_them(served, db, monkeypatch):
    from src.services.goals import portfolio_steps

    monkeypatch.setattr(portfolio_steps, "items", lambda db, user_id, part, kind=None: [
        portfolio_steps.Item("project:1", "Robot", image_url=f"/content/{COVER}"),
        portfolio_steps.Item("project:2", "Diary", image_url=f"/content/{PERSONAL}"),
    ])
    # Not on any plan yet: an unpublished portfolio file stays the learner's.
    assert _status(served, STAFF, COVER) == 404
    goal = _goal(db, 1)
    step = _step(db, goal, "portfolio", {"part": "projects", "count": 1})
    db.add(StepProgress(progress_uuid="p2", step_id=int(step.id), submission={"hidden": ["project:2"]}, creation_date=NOW, update_date=NOW))
    db.commit()
    assert _status(served, STAFF, COVER) == 200
    # The learner hid this one from the step, so staff don't see it.
    assert _status(served, STAFF, PERSONAL) == 404
    assert _status(served, OTHER_STAFF, COVER) == 404


def test_a_staff_members_own_uploads_still_open_for_their_colleagues(served, db):
    db.add(UserOrganization(user_id=SUPER + 1, org_id=1, role_id=1, creation_date=NOW, update_date=NOW))
    db.add(User(id=SUPER + 1, user_uuid=f"user_{SUPER + 1}", username="admin", email="admin@example.com", first_name="A", last_name="X",
                creation_date=NOW, update_date=NOW))
    db.commit()
    assert _status(served, SUPER + 1, STAFF_FILE) == 200
    assert _status(served, OTHER_STAFF, STAFF_FILE) == 404
    assert _status(served, OWNER, STAFF_FILE) == 404


def test_an_api_token_sees_only_its_organizations_plans(db):
    _hand_in(db, _goal(db, 1), HAND_IN)
    _hand_in(db, _goal(db, 2), OTHER_ORG)
    lincoln = APITokenUser(org_id=1)
    assert content_access.check_content_access(HAND_IN, lincoln, db) is False
    for path in (OTHER_ORG, NOTE):
        with pytest.raises(Exception) as denied:
            content_access.check_content_access(path, lincoln, db)
        assert getattr(denied.value, "status_code", None) == 404


def test_profile_images_and_org_branding_stay_public(served):
    assert _status(served, None, AVATAR) == 200
    assert _status(served, None, LOGO) == 200
    assert _status(served, None, "orgs/org_1/podcasts/old.mp3") == 404


def test_private_files_are_not_kept_in_shared_caches(served):
    client, viewer = served
    viewer["id"] = OWNER
    assert client.get(f"/content/{HAND_IN}").headers["cache-control"].startswith("private")
    viewer["id"] = None
    assert client.get(f"/content/{AVATAR}").headers["cache-control"].startswith("public")


def test_an_unknown_owner_is_404(served):
    assert _status(served, SUPER, "users/user_99/media/essay.pdf") == 404


def test_a_media_photo_used_as_the_avatar_is_public(served, db):
    owner = db.get(User, OWNER)
    owner.avatar_image = "/content/users/user_1/media/portrait.png"
    db.add(owner)
    db.commit()
    assert _status(served, None, "users/user_1/media/portrait.png") == 200
    assert _status(served, None, HAND_IN) == 404


def test_files_on_a_published_public_portfolio_open_for_anyone(served, db, monkeypatch):
    monkeypatch.setattr("src.services.portfolio.portfolio_shell", lambda portfolio, db, public_only=False: {
        "projects": [{"cover": {"url": "/content/users/user_1/media/showcase.png"}}],
    })
    portfolio = Portfolio(portfolio_uuid="p1", user_id=OWNER, visibility="private", published_at=NOW, creation_date=NOW, update_date=NOW)
    db.add(portfolio)
    db.commit()
    assert _status(served, None, "users/user_1/media/showcase.png") == 404
    portfolio.visibility, portfolio.update_date = "public", "later"
    db.add(portfolio)
    db.commit()
    assert _status(served, None, "users/user_1/media/showcase.png") == 200
    # Only what the public portfolio shows, not every upload.
    assert _status(served, None, HAND_IN) == 404


def test_someone_sharing_the_learners_plan_opens_the_files_on_that_plan(served, db):
    goal = _goal(db, 1, external=False)
    _hand_in(db, goal, HAND_IN)
    assert _status(served, MENTOR, HAND_IN) == 404
    role = PlanRole(role_uuid="r1", goal_id=int(goal.id), key="mentor", name="Mentor", capabilities=["view_plan", "comment"], creation_date=NOW, update_date=NOW)
    db.add(role)
    db.flush()
    db.add(PlanCollaborator(collaborator_uuid="c1", goal_id=int(goal.id), user_id=MENTOR, role_id=int(role.id), active=True, creation_date=NOW, update_date=NOW))
    db.commit()
    assert _status(served, MENTOR, HAND_IN) == 200
    # Their other uploads aren't part of the shared plan.
    assert _status(served, MENTOR, NOTE) == 404


def test_staff_on_a_plan_another_school_issued_see_it_only_if_invited(served, db):
    goal = _goal(db, 2)
    _hand_in(db, goal, OTHER_ORG)
    assert _status(served, STAFF, OTHER_ORG) == 404
    role = PlanRole(role_uuid="r2", goal_id=int(goal.id), key="viewer", name="Viewer", capabilities=["view_plan"], creation_date=NOW, update_date=NOW)
    db.add(role)
    db.flush()
    db.add(PlanCollaborator(collaborator_uuid="c2", goal_id=int(goal.id), user_id=STAFF, role_id=int(role.id), active=True, creation_date=NOW, update_date=NOW))
    db.commit()
    assert _status(served, STAFF, OTHER_ORG) == 200


def test_demo_session_files_open_for_that_session(db, monkeypatch):
    from src.services.demo.context import DemoContext, current_demo

    session_id = "a" * 32
    path = f"users/user_demo_{session_id}_{'b' * 32}/media/essay.pdf"
    with pytest.raises(Exception) as outside:
        content_access.check_content_access(path, AnonymousUser(), db)
    assert getattr(outside.value, "status_code", None) == 404
    token = current_demo.set(DemoContext(session_id, "demo_" + "c" * 32, "visitor"))
    try:
        assert content_access.check_content_access(path, _viewer(OWNER), db) is False
    finally:
        current_demo.reset(token)


def test_referenced_paths_reads_api_and_absolute_links():
    assert content_access.referenced_paths({"a": ["https://x.app/api/v1/content/users/u/media/a%20b.png?x=1", "<img src=\"/content/orgs/o/l.png\">"]}) == {
        "users/u/media/a b.png", "orgs/o/l.png",
    }

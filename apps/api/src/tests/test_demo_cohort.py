"""Shared cohort snapshot selection and exclusion boundaries."""

from datetime import datetime, timedelta
from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import (
    create_engine,
    MetaData,
    Table,
    Column,
    Integer,
    ForeignKey,
    JSON,
    String,
)
from sqlmodel import SQLModel, Session, select
from src.db.demo import (
    DemoMember,
    DemoConfiguration,
    DemoCheckpoint,
    DemoSession,
    DemoUsage,
)
from src.db.users import User
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.services.demo.cohort import draft_accounts, public_pilots
from src.services.demo.lifecycle import admit, end
from src.services.demo.access import visitor_credentials
from src.services.demo.namespaces import schema_signature
from src.services.demo.scenario import exclude_real_users
from src.services.demo.context import DemoContext, current_demo


@pytest.fixture
def cohort_db():
    engine = create_engine("sqlite://")
    models = [
        DemoMember,
        DemoConfiguration,
        DemoCheckpoint,
        DemoSession,
        DemoUsage,
        User,
        Organization,
        Role,
        UserOrganization,
    ]
    SQLModel.metadata.create_all(engine, tables=[model.__table__ for model in models])
    with Session(engine) as db:
        for identifier, slug in [(1, "live-owner"), (2, "fictional-demo")]:
            db.add(
                Organization(
                    id=identifier,
                    org_uuid=f"org_{identifier}",
                    name=slug,
                    slug=slug,
                    email="fake@example.com",
                )
            )
        for identifier in [1, 3]:
            db.add(Role(id=identifier, name=f"Role {identifier}"))
        for identifier in range(1, 22):
            db.add(
                User(
                    id=identifier,
                    user_uuid=f"user_{identifier}",
                    email=f"fake{identifier}@example.com",
                    username=f"fake{identifier}",
                    first_name=f"Learner {identifier}",
                    last_name="Demo",
                    is_superadmin=identifier == 1,
                )
            )
            db.add(
                UserOrganization(
                    user_id=identifier,
                    org_id=2,
                    role_id=1 if identifier == 3 else 3,
                    creation_date="",
                    update_date="",
                )
            )
        db.add(DemoConfiguration(capacity=2))
        db.commit()
        yield engine, db
    engine.dispose()


def designation(db):
    for identifier in range(2, 22):
        db.add(
            DemoMember(
                user_id=identifier,
                pilotable=identifier in [2, 3],
                description=f"Stage {identifier}",
                handle=f"learner-{identifier}",
                position=identifier,
            )
        )
    config = db.get(DemoConfiguration, 1)
    config.revision += 1
    db.add(config)
    db.commit()


def release(db):
    designation(db)
    checkpoint = DemoCheckpoint(
        id="shared",
        entry_org_slug="fictional-demo",
        created_by=1,
        schema_signature=schema_signature(),
        data={},
        pilots={
            str(identifier): {
                "user_id": identifier,
                "first_name": f"Learner {identifier}",
                "last_name": "Demo",
                "username": f"fake{identifier}",
                "email": f"fake{identifier}@example.com",
                "description": "Published stage",
            }
            for identifier in [2, 3]
        },
    )
    db.add(checkpoint)
    config = db.get(DemoConfiguration, 1)
    config.enabled, config.checkpoint_id = True, checkpoint.id
    db.add(config)
    db.commit()
    return checkpoint


def test_twenty_members_two_on_the_picker_with_live_card_text(cohort_db):
    _, db = cohort_db
    checkpoint = release(db)
    assert len(draft_accounts(db)) == 20
    picker = public_pilots(db, checkpoint)
    assert [account["user_id"] for account in picker] == [2, 3]
    assert all("email" not in account for account in picker)
    # Card text and picker visibility are live; account data stays published.
    member = db.get(DemoMember, 2)
    member.description, member.pilotable = "Edited live", True
    db.get(DemoMember, 3).pilotable = False
    db.commit()
    picker = public_pilots(db, checkpoint)
    assert [(item["user_id"], item["description"]) for item in picker] == [
        (2, "Edited live")
    ]
    assert picker[0]["first_name"] == "Learner 2" and picker[0]["handle"] == "learner-2"
    # Accounts outside the published snapshot never appear, even if pickable live.
    db.get(DemoMember, 4).pilotable = True
    db.commit()
    assert 4 not in {item["user_id"] for item in public_pilots(db, checkpoint)}


def test_hidden_user_keeps_existing_sessions_but_admits_no_new_ones(cohort_db):
    _, db = cohort_db
    release(db)
    session = admit(db, "visitor", 2)
    session.state = "active"
    db.add(session)
    db.get(DemoMember, 2).pilotable = False
    db.commit()
    assert visitor_credentials(db, session.id)["access_token"]
    with pytest.raises(HTTPException) as failure:
        admit(db, "other", 2)
    assert failure.value.status_code == 422


def test_selection_binds_credentials_and_shared_capacity(cohort_db):
    _, db = cohort_db
    release(db)
    for identifier in [4, 999, None]:
        with pytest.raises(HTTPException) as failure:
            admit(db, "visitor", identifier)
        assert failure.value.status_code == 422
    one, two = admit(db, "same-visitor", 2), admit(db, "second-visitor", 3)
    assert one.checkpoint_id == two.checkpoint_id == "shared"
    assert one.pilot_user_id == 2 and two.pilot_user_id == 3
    assert one.namespace != two.namespace
    with pytest.raises(HTTPException) as failure:
        admit(db, "third-visitor", 2)
    assert failure.value.status_code == 503
    one.state = "active"
    db.add(one)
    db.commit()
    from src.security.auth import decode_jwt

    token = decode_jwt(visitor_credentials(db, one.id)["access_token"])
    assert token["demo_user"] == 2 and token["sub"] == "fake2@example.com"
    end(db, one.id)
    switched = admit(db, "same-visitor", 3)
    assert switched.visitor_id == one.visitor_id and switched.pilot_user_id == 3


def test_warm_workspace_accepts_either_role(cohort_db):
    _, db = cohort_db
    release(db)
    identifier = uuid4().hex
    db.add(
        DemoSession(
            id=identifier,
            namespace=f"demo_{identifier}",
            checkpoint_id="shared",
            visitor_id="",
            state="available",
            schema_signature=schema_signature(),
            expires_at=datetime.utcnow() + timedelta(hours=1),
        )
    )
    db.commit()
    selected = admit(db, "visitor", 3)
    assert selected.id == identifier and selected.pilot_user_id == 3


@pytest.mark.parametrize(
    "email", ["fake1@example.com", "missing@example.com", "fake2@example.com"]
)
def test_adding_an_existing_account_rejects_admins_unknowns_and_duplicates(
    cohort_db, email
):
    from src.services.demo.users import AddExisting, add_existing

    _, db = cohort_db
    designation(db)
    with pytest.raises(HTTPException) as failure:
        add_existing(db, AddExisting(user_email=email))
    assert failure.value.status_code == 422
    db.rollback()
    assert len(db.exec(select(DemoMember)).all()) == 20
    assert db.get(DemoConfiguration, 1).revision == 2


def test_adding_an_existing_account_makes_supporting_cast(cohort_db):
    from src.services.demo.users import AddExisting, add_existing

    _, db = cohort_db
    db.add(
        User(
            id=40,
            user_uuid="user_40",
            email="cast@example.com",
            username="cast",
            first_name="Cast",
            last_name="Member",
        )
    )
    db.commit()
    added = add_existing(db, AddExisting(user_email="cast@example.com"))
    assert added["pilotable"] is False and added["handle"] == "cast"
    assert db.get(DemoConfiguration, 1).revision == 2


def test_org_admin_cannot_become_platform_admin_in_private_copy(cohort_db):
    _, db = cohort_db
    from src.security.superadmin import is_user_owner_org_admin

    db.delete(db.get(Organization, 1))
    db.commit()
    assert is_user_owner_org_admin(3, db)
    context = current_demo.set(DemoContext("copy", "demo_" + "a" * 32, "visitor"))
    try:
        assert not is_user_owner_org_admin(3, db)
    finally:
        current_demo.reset(context)


def test_real_user_edges_private_work_and_nested_references_are_dropped():
    metadata = MetaData()
    Table(
        "user",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("email", String),
        Column("user_uuid", String),
    )
    Table(
        "resource",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("created_by_user_id", Integer, ForeignKey("user.id"), nullable=True),
        Column("data", JSON),
    )
    Table(
        "userorganization",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("user_id", Integer, ForeignKey("user.id"), nullable=False),
    )
    Table(
        "hubconversation",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("user_id", Integer, ForeignKey("user.id"), nullable=False),
    )
    Table(
        "hubconversationmessage",
        metadata,
        Column("id", Integer, primary_key=True),
        Column(
            "conversation_id", Integer, ForeignKey("hubconversation.id"), nullable=False
        ),
    )
    Table(
        "planinvitation",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("email", String),
    )
    rows = {name: {} for name in metadata.tables}
    rows["user"] = {
        (2,): {"id": 2, "email": "fake@example.com", "user_uuid": "user_fake"},
        (99,): {"id": 99, "email": "private@example.com", "user_uuid": "user_real"},
    }
    rows["resource"] = {
        (1,): {
            "id": 1,
            "created_by_user_id": 99,
            "data": {
                "staff_user_ids": [2, 99],
                "collaborators": [{"user_id": 2}, {"user_id": 99}],
                "subject_email": "private@example.com",
            },
        }
    }
    rows["userorganization"] = {(1,): {"id": 1, "user_id": 99}}
    rows["hubconversation"] = {(1,): {"id": 1, "user_id": 99}}
    rows["hubconversationmessage"] = {(1,): {"id": 1, "conversation_id": 1}}
    rows["planinvitation"] = {
        (1,): {"id": 1, "email": "FAKE@example.com"},
        (2,): {"id": 2, "email": "private@example.com"},
    }
    exclude_real_users(rows, metadata.tables, {2}, frozenset({"hubconversation"}))
    assert list(rows["user"]) == [(2,)]
    assert list(rows["planinvitation"]) == [(1,)]
    assert (
        not rows["userorganization"]
        and not rows["hubconversation"]
        and not rows["hubconversationmessage"]
    )
    assert rows["resource"][(1,)] == {
        "id": 1,
        "created_by_user_id": None,
        "data": {
            "staff_user_ids": [2],
            "collaborators": [{"user_id": 2}],
            "subject_email": None,
        },
    }


def test_published_portrait_is_captured_and_bound_to_its_fake_owner():
    from base64 import b64encode
    from types import SimpleNamespace
    from src.services.demo.portraits import published_portrait

    user = SimpleNamespace(user_uuid="user_fake", avatar_image="portrait.png")
    portrait = b64encode(b"\x89PNG\r\n\x1a\nfixture").decode()
    assert (
        published_portrait(
            user, {"content/users/user_real/media/portrait.png": portrait}
        )
        is None
    )
    assert (
        published_portrait(
            user, {"content/users/user_fake/media/portrait.png": portrait}
        )
        == f"data:image/png;base64,{portrait}"
    )
    assert (
        published_portrait(
            user,
            {
                "content/users/user_fake/media/portrait.png": b64encode(
                    b"<svg onload='alert(1)' />"
                ).decode()
            },
        )
        is None
    )


def test_reset_keeps_the_session_unless_the_replacement_is_admitted(cohort_db):
    _, db = cohort_db
    checkpoint = release(db)
    current = admit(db, "visitor", 2)
    # A newer checkpoint no longer offers this pilot: the visitor keeps their workspace.
    checkpoint.pilots = {
        key: value for key, value in checkpoint.pilots.items() if key != "2"
    }
    db.add(checkpoint)
    db.commit()
    with pytest.raises(HTTPException) as failure:
        admit(db, "visitor", 2, replacing=(current.id,))
    assert failure.value.status_code == 422
    db.rollback()
    db.refresh(current)
    assert current.ended_at is None and current.state != "ended"


def test_replacement_reuses_the_capacity_of_the_session_it_replaces(cohort_db):
    _, db = cohort_db
    release(db)
    first, second = admit(db, "one", 2), admit(db, "two", 3)
    with pytest.raises(HTTPException) as busy:
        admit(db, "three", 2)
    assert busy.value.status_code == 503
    db.rollback()
    replacement = admit(db, "one", 3, replacing=(first.id,))
    db.refresh(first)
    assert first.state == "ended" and replacement.id not in {first.id, second.id}


def test_public_status_data_stays_small_and_portraits_are_served_separately(cohort_db):
    from base64 import b64encode
    from src.routers.demo import portrait

    _, db = cohort_db
    checkpoint = release(db)
    image = b"\x89PNG\r\n\x1a\nfixture"
    checkpoint.portraits = {"2": f"data:image/png;base64,{b64encode(image).decode()}"}
    db.add(checkpoint)
    db.commit()
    assert all("avatar_url" not in account for account in public_pilots(db, checkpoint))
    response = portrait("shared", 2, db)
    assert response.body == image and response.media_type == "image/png"
    assert "immutable" in response.headers["cache-control"]
    with pytest.raises(HTTPException) as missing:
        portrait("shared", 3, db)
    assert missing.value.status_code == 404


def test_admin_entry_requires_an_explicit_cohort_account(cohort_db, monkeypatch):
    from types import SimpleNamespace
    from src.routers import demo

    _, db = cohort_db
    release(db)
    monkeypatch.setattr(demo, "operator", lambda request, db: SimpleNamespace(id=1))
    for identifier in [None, 21 + 1]:
        with pytest.raises(HTTPException) as failure:
            demo.enter_admin(None, demo.PilotSelection(user_id=identifier), db)
        assert failure.value.status_code == 422


def test_scrubbing_tolerates_odd_values_and_fails_closed_on_leaked_identifiers():
    metadata = MetaData()
    Table("user", metadata, Column("id", Integer, primary_key=True))
    Table(
        "planinvitation",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("email", String),
    )
    Table(
        "resource",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("data", JSON),
    )

    def rows(data):
        return {
            "user": {
                (2,): {"id": 2, "email": "fake@example.com", "user_uuid": "user_fake"},
                (99,): {
                    "id": 99,
                    "email": "Private@example.com",
                    "user_uuid": "user_real",
                },
            },
            "planinvitation": {(1,): {"id": 1, "email": None}},
            "resource": {(1,): {"id": 1, "data": data}},
        }

    clean = rows({"owner_user_uuid": ["user_real"], "note": "hello"})
    exclude_real_users(clean, metadata.tables, {2})
    assert not clean["planinvitation"]
    for leaked in (
        {"mentions": ["private@EXAMPLE.com"]},
        {"author": {"id": "user_real"}},
    ):
        with pytest.raises(HTTPException) as failure:
            exclude_real_users(rows(leaked), metadata.tables, {2})
        assert failure.value.status_code == 422


@pytest.fixture
def clone_env(cohort_db, monkeypatch):
    from src.security.security import security_hash_password
    from src.services.demo import copy, users

    _, db = cohort_db
    source = db.get(User, 5)
    source.password = security_hash_password("correct horse battery")
    source.bio = "Real bio"
    source.avatar_image = "user_5_avatar.png"
    source.profile = {"cover": "/content/users/user_5/profile_covers/c.png"}
    db.add(source)
    db.commit()
    files, rows = [], []
    monkeypatch.setattr(users, "copy_user_files", lambda *args: files.append(args))
    monkeypatch.setattr(users, "check_rate_limit", lambda *args: (True, 0, 0))

    def copy_account(db, source, target, orgs, conversations):
        rows.append((source.id, target.id, orgs, conversations))
        return {"portfolio": 1}

    monkeypatch.setattr(copy, "copy_account", copy_account)
    return db, users, files, rows


def copy_request(users, **values):
    return users.CreateDemoUser(
        **{
            "start_from": "copy",
            "first_name": "Sam",
            "last_name": "Okafor",
            "source_email": "fake5@example.com",
            "password": "correct horse battery",
            **values,
        }
    )


def test_copy_requires_the_source_password_and_creates_nothing_otherwise(clone_env):
    db, users, files, rows = clone_env
    before = len(db.exec(select(User)).all())
    for password in ["wrong", "x" * 10]:
        with pytest.raises(HTTPException) as failure:
            users.create_demo_user(db, 1, copy_request(users, password=password))
        assert failure.value.status_code == 403
    with pytest.raises(HTTPException) as unknown:
        users.create_demo_user(
            db, 1, copy_request(users, source_email="nobody@example.com")
        )
    assert (
        unknown.value.status_code == 403
        and unknown.value.detail == failure.value.detail
    )
    assert len(db.exec(select(User)).all()) == before and not files and not rows


def test_copy_creates_a_demo_user_with_the_whole_account_and_no_credentials(clone_env):
    db, users, files, rows = clone_env
    result = users.create_demo_user(
        db,
        1,
        copy_request(
            users,
            orgs=[users.OrgChoice(slug="fictional-demo", role="staff")],
            role_line="Junior",
            include_conversations=True,
        ),
    )
    source = db.get(User, 5)
    copy = db.get(User, result["user_id"])
    assert (copy.first_name, copy.last_name, copy.bio) == ("Sam", "Okafor", "Real bio")
    assert copy.email == result["user_email"] == "sam-okafor-demo@demo.example.com"
    assert copy.user_uuid != source.user_uuid and copy.user_uuid.startswith("user_")
    assert copy.avatar_image == "user_5_avatar.png".replace("user_5", copy.user_uuid)
    assert (
        copy.profile["cover"] == f"/content/users/{copy.user_uuid}/profile_covers/c.png"
    )
    assert copy.password != source.password and not security_verify(
        copy.password, "correct horse battery"
    )
    assert files == [("user_5", copy.user_uuid)]
    assert rows == [(5, copy.id, {1, 2}, True)]
    membership = db.exec(
        select(UserOrganization).where(UserOrganization.user_id == copy.id)
    ).all()
    # Always a member of the main org; the school role is what was chosen.
    assert sorted((item.org_id, item.role_id) for item in membership) == [
        (1, 4),
        (2, 2),
    ]
    member = db.get(DemoMember, copy.id)
    assert member.pilotable and member.handle == "sam" and member.role_line == "Junior"
    assert result["copied"] == {"portfolio": 1}
    again = users.create_demo_user(db, 1, copy_request(users))
    assert again["username"] == "sam-okafor-demo-2" and again["handle"] == "sam-2"


def test_blank_user_cannot_administer_the_main_org(clone_env):
    db, users, files, rows = clone_env
    with pytest.raises(HTTPException) as failure:
        users.create_demo_user(
            db,
            1,
            users.CreateDemoUser(
                first_name="Ana",
                orgs=[users.OrgChoice(slug="live-owner", role="admin")],
            ),
        )
    assert failure.value.status_code == 422
    db.rollback()
    blank = users.create_demo_user(db, 1, users.CreateDemoUser(first_name="Ana"))
    assert blank["orgs"] == [{"slug": "live-owner", "name": "live-owner", "role_id": 4}]
    assert not files and not rows


def test_duplicate_copies_another_demo_user_and_its_guide(clone_env):
    db, users, files, rows = clone_env
    designation(db)
    member = db.get(DemoMember, 2)
    member.guide = {"goals": ["Earn a badge"], "has": [], "journeys": []}
    db.commit()
    with pytest.raises(HTTPException):
        users.create_demo_user(
            db,
            1,
            users.CreateDemoUser(
                start_from="duplicate", first_name="Twin", source_user_id=40
            ),
        )
    db.rollback()
    twin = users.create_demo_user(
        db,
        1,
        users.CreateDemoUser(
            start_from="duplicate", first_name="Twin", source_user_id=2
        ),
    )
    assert twin["guide"]["goals"] == ["Earn a badge"] and rows[-1][0] == 2


def test_guide_and_handle_updates_are_validated(clone_env):
    db, users, *_ = clone_env
    designation(db)
    for handle in ["Bad Handle", "admin", "learner-3"]:
        with pytest.raises(HTTPException):
            users.update_demo_user(db, 2, users.UpdateDemoUser(handle=handle))
    updated = users.update_demo_user(
        db,
        2,
        users.UpdateDemoUser(
            handle="maya",
            guide=users.Guide(
                goals=["  Find a summer program ", ""],
                journeys=[
                    users.Journey(
                        title="Earn a badge",
                        steps=["Open Badges", " "],
                        link_path="/badges",
                    )
                ],
            ),
        ),
    )
    assert updated["handle"] == "maya"
    assert updated["guide"]["goals"] == ["Find a summer program"]
    assert updated["guide"]["journeys"][0]["steps"] == ["Open Badges"]
    with pytest.raises(ValueError):
        users.Journey(title="Off-site", link_path="https://example.com")


def security_verify(hashed, password):
    from src.security.security import security_verify_password

    try:
        return security_verify_password(password, hashed)
    except Exception:
        return False


@pytest.fixture
def stale(cohort_db, monkeypatch):
    from src.services.demo import worker

    engine, db = cohort_db
    checkpoint = release(db)
    checkpoint.schema_signature, checkpoint.created_by = "outdated", 7
    db.add(checkpoint)
    db.commit()
    calls = []

    def publish(session, actor_id, revision):
        calls.append((actor_id, revision))

    monkeypatch.setattr(worker, "publish", publish)
    return worker, engine, db, calls


def test_outdated_checkpoint_is_republished_as_its_original_author(stale):
    worker, engine, db, calls = stale
    revision = db.get(DemoConfiguration, 1).revision
    assert worker.recapture_stale(engine) is True
    assert calls == [(7, revision)]


@pytest.mark.parametrize(
    "change", [{"auto_recapture": False}, {"enabled": False}, {"checkpoint_id": None}]
)
def test_recapture_stays_idle_when_paused_disabled_or_unpublished(stale, change):
    worker, engine, db, calls = stale
    config = db.get(DemoConfiguration, 1)
    for key, value in change.items():
        setattr(config, key, value)
    db.add(config)
    db.commit()
    assert worker.recapture_stale(engine) is False and not calls


def test_current_checkpoint_is_left_alone(stale):
    worker, engine, db, calls = stale
    checkpoint = db.get(DemoCheckpoint, "shared")
    checkpoint.schema_signature = schema_signature()
    db.add(checkpoint)
    db.commit()
    assert worker.recapture_stale(engine) is False and not calls


def test_failed_recapture_is_reported_once_per_schema_and_retried_after_the_next(
    stale, monkeypatch
):
    worker, engine, db, calls = stale
    attempts = []

    def refuse(session, actor_id, revision):
        attempts.append(revision)
        raise HTTPException(
            422,
            "The demo scenario references an account outside the cohort (resource).",
        )

    monkeypatch.setattr(worker, "publish", refuse)
    assert worker.recapture_stale(engine) is False
    db.expire_all()
    config = db.get(DemoConfiguration, 1)
    assert "outside the cohort" in config.recapture_error
    assert config.recapture_error_signature == schema_signature()
    worker.recapture_stale(engine)
    assert len(attempts) == 1  # not retried for the same schema
    monkeypatch.setattr(worker, "schema_signature", lambda: "next-release")
    worker.recapture_stale(engine)
    assert len(attempts) == 2


def test_conflicting_settings_change_is_retried_not_reported(stale, monkeypatch):
    worker, engine, db, _ = stale

    def conflict(session, actor_id, revision):
        raise HTTPException(409, "Demo settings or checkpoint changed.")

    monkeypatch.setattr(worker, "publish", conflict)
    assert worker.recapture_stale(engine) is False
    db.expire_all()
    assert db.get(DemoConfiguration, 1).recapture_error is None


def test_visitor_feedback_reaches_the_live_board_with_demo_labels(
    cohort_db, monkeypatch
):
    from types import SimpleNamespace
    from src.routers import demo_guide as demo
    from src.services import candidate_jira

    _, db = cohort_db
    release(db)
    session = admit(db, "visitor", 2)
    session.state, session.tag = "active", "oct-fair"
    db.add(session)
    db.commit()
    created, comments, properties = [], [], []

    class Jira:
        configured = True

        def create_feedback(self, **values):
            created.append(values)
            return {"key": "FEED-1"}

        def add_comment(self, key, message, internal):
            comments.append((key, message, internal))

        def property(self, key, name):
            return {"user_id": 2}

        def set_property(self, key, name, value):
            properties.append(value)

    monkeypatch.setattr(candidate_jira, "CandidateJira", Jira)
    monkeypatch.setattr(demo, "claims", lambda request: {"demo_session": session.id})
    monkeypatch.setattr(demo, "check_rate_limit", lambda *args: (True, 0, 0))
    result = demo.send_feedback(
        SimpleNamespace(),
        demo.DemoFeedback(
            message="Badge did not show",
            intent="broken",
            journey="Earn a badge",
            rating="hard",
        ),
        db,
    )
    assert result == {"key": "FEED-1"}
    [issue] = created
    assert issue["user"].id == 2 and issue["org_id"] == 1
    assert issue["labels"] == [
        "launchlms-demo",
        "demo-user-learner-2",
        "demo-tag-oct-fair",
        "demo-journey-hard",
    ]
    [metadata] = properties
    assert metadata["user_id"] == 2 and metadata["source"] == "demo"
    assert metadata["demo_session"] == session.id
    assert metadata["journey"] == "Earn a badge"
    assert "Journey: Earn a badge (rated hard)" in issue["message"]
    assert comments[0][2] is True and '"tag": "oct-fair"' in comments[0][1]


def test_visitors_see_the_tester_announcements_newest_first(cohort_db, monkeypatch):
    from types import SimpleNamespace
    from src.routers import demo_guide
    from src.services import candidate_jira

    _, db = cohort_db
    release(db)
    session = admit(db, "visitor", 2)
    session.state = "active"
    db.add(session)
    db.commit()

    class Jira:
        configured = True

        def project_property(self, name):
            assert name == candidate_jira.ANNOUNCEMENTS_PROPERTY
            return {"items": [{"id": "old"}, {"id": "new"}]}

    monkeypatch.setattr(candidate_jira, "CandidateJira", Jira)
    monkeypatch.setattr(
        demo_guide, "claims", lambda request: {"demo_session": session.id}
    )
    result = demo_guide.announcements(SimpleNamespace(), db)
    assert [item["id"] for item in result["items"]] == ["new", "old"]
    Jira.configured = False
    assert demo_guide.announcements(SimpleNamespace(), db) == {"items": []}

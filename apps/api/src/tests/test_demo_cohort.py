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
from src.services.demo.cohort import (
    CohortSettings,
    MemberInput,
    save_cohort,
    draft_accounts,
    public_pilots,
)
from src.services.demo.configuration import DemoSettings, save_settings
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
        db.add(DemoConfiguration(entry_org_id=2, capacity=2))
        db.commit()
        yield engine, db
    engine.dispose()


def designation(db):
    save_cohort(
        db,
        CohortSettings(
            revision=1,
            members=[
                MemberInput(
                    user_email=f"fake{identifier}@example.com",
                    pilotable=identifier in [2, 3],
                    description=f"Stage {identifier}",
                )
                for identifier in range(2, 22)
            ],
        ),
    )


def release(db):
    designation(db)
    checkpoint = DemoCheckpoint(
        id="shared",
        source_user_id=2,
        source_email="fake2@example.com",
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


def test_twenty_members_two_pilots_and_draft_edits_do_not_change_publication(cohort_db):
    _, db = cohort_db
    checkpoint = release(db)
    assert len(draft_accounts(db)) == 20
    assert len(public_pilots(checkpoint)) == 2
    assert all("email" not in account for account in public_pilots(checkpoint))
    save_cohort(
        db,
        CohortSettings(
            revision=2,
            members=[
                MemberInput(
                    user_email="fake4@example.com",
                    pilotable=True,
                    description="New draft",
                )
            ],
        ),
    )
    assert public_pilots(checkpoint)[0]["description"] == "Published stage"
    assert [account["user_id"] for account in public_pilots(checkpoint)] == [2, 3]


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
    "addresses",
    [
        ["fake1@example.com"],
        ["missing@example.com"],
        ["fake2@example.com", "fake2@example.com"],
    ],
)
def test_invalid_designation_is_atomic(cohort_db, addresses):
    _, db = cohort_db
    designation(db)
    with pytest.raises(HTTPException):
        save_cohort(
            db,
            CohortSettings(
                revision=2,
                members=[MemberInput(user_email=email) for email in addresses],
            ),
        )
    assert len(db.exec(select(DemoMember)).all()) == 20
    assert db.get(DemoConfiguration, 1).revision == 2


def test_org_change_clears_cohort_and_requires_publication(cohort_db):
    _, db = cohort_db
    release(db)
    save_settings(
        db, DemoSettings(revision=2, enabled=False, entry_org_slug="live-owner")
    )
    assert not db.exec(select(DemoMember)).all()
    assert db.get(DemoConfiguration, 1).checkpoint_id is None


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

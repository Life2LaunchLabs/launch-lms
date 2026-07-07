import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.audit_logs import AuditLog
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.superadmin.users import (
    BatchUserAction,
    GlobalUserCreate,
    GlobalUserUpdate,
    MembershipUpdate,
    SetPasswordPayload,
    batch_user_action,
    create_global_user,
    delete_global_user,
    get_global_user,
    list_global_users,
    remove_user_membership,
    set_user_membership,
    set_user_password,
    unlock_user_account,
    update_global_user,
)

STRONG_PASSWORD = "Str0ng!Passw0rd"


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    User.__table__.create(engine)
    Organization.__table__.create(engine)
    UserOrganization.__table__.create(engine)
    Role.__table__.create(engine)
    AuditLog.__table__.create(engine)
    with Session(engine) as session:
        _seed_roles(session)
        yield session


def _seed_roles(session: Session) -> None:
    for role_id, name, uuid in (
        (1, "Admin", "role_global_admin"),
        (2, "Maintainer", "role_global_maintainer"),
        (4, "User", "role_global_user"),
    ):
        session.add(
            Role(
                id=role_id,
                name=name,
                role_uuid=uuid,
                rights={},
                creation_date="2026-01-01",
                update_date="2026-01-01",
            )
        )
    session.commit()


def _create_org(session: Session, *, org_id: int, slug: str) -> Organization:
    org = Organization(
        id=org_id,
        org_uuid=f"org_{org_id}",
        name=slug.capitalize(),
        slug=slug,
        email=f"{slug}@example.com",
        creation_date="2026-01-01T00:00:00+00:00",
        update_date="2026-01-01T00:00:00+00:00",
    )
    session.add(org)
    session.commit()
    return org


def _create_user(
    session: Session,
    *,
    user_id: int,
    username: str,
    is_superadmin: bool = False,
    creation_date: str = "2026-01-01T00:00:00+00:00",
) -> User:
    user = User(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=username,
        first_name=username.capitalize(),
        last_name="Test",
        email=f"{username}@example.com",
        is_superadmin=is_superadmin,
        creation_date=creation_date,
        update_date=creation_date,
    )
    session.add(user)
    session.commit()
    return user


def _add_membership(
    session: Session, *, user_id: int, org_id: int, role_id: int = 4
) -> UserOrganization:
    membership = UserOrganization(
        user_id=user_id,
        org_id=org_id,
        role_id=role_id,
        creation_date="2026-01-01T00:00:00+00:00",
        update_date="2026-01-01T00:00:00+00:00",
    )
    session.add(membership)
    session.commit()
    return membership


def _public_user(user: User) -> PublicUser:
    return PublicUser.model_validate(user)


# ============================================================================
# Listing
# ============================================================================


def test_list_global_users_filters_and_paginates(db_session: Session):
    org = _create_org(db_session, org_id=1, slug="acme")
    _create_user(db_session, user_id=1, username="alpha", is_superadmin=True)
    _create_user(db_session, user_id=2, username="bravo")
    _create_user(db_session, user_id=3, username="charlie")
    _add_membership(db_session, user_id=1, org_id=org.id, role_id=ADMIN_ROLE_ID)
    _add_membership(db_session, user_id=2, org_id=org.id)

    result = list_global_users(db_session)
    assert result["total"] == 3

    result = list_global_users(db_session, superadmin="yes")
    assert [item["username"] for item in result["items"]] == ["alpha"]

    result = list_global_users(db_session, min_orgs=1)
    assert result["total"] == 2

    result = list_global_users(db_session, search="brav")
    assert [item["username"] for item in result["items"]] == ["bravo"]

    result = list_global_users(db_session, page=2, limit=2)
    assert result["total"] == 3
    assert len(result["items"]) == 1


def test_list_global_users_sorts_by_org_count(db_session: Session):
    org1 = _create_org(db_session, org_id=1, slug="one")
    org2 = _create_org(db_session, org_id=2, slug="two")
    _create_user(db_session, user_id=1, username="none")
    _create_user(db_session, user_id=2, username="both")
    _add_membership(db_session, user_id=2, org_id=org1.id)
    _add_membership(db_session, user_id=2, org_id=org2.id)

    result = list_global_users(db_session, sort="orgs_desc")
    assert [item["username"] for item in result["items"]] == ["both", "none"]
    assert result["items"][0]["org_count"] == 2
    assert {org["slug"] for org in result["items"][0]["orgs"]} == {"one", "two"}


def test_list_global_users_scoped_to_org(db_session: Session):
    org1 = _create_org(db_session, org_id=1, slug="one")
    org2 = _create_org(db_session, org_id=2, slug="two")
    _create_user(db_session, user_id=1, username="alpha")
    _create_user(db_session, user_id=2, username="bravo")
    _add_membership(db_session, user_id=1, org_id=org1.id)
    _add_membership(db_session, user_id=2, org_id=org2.id)

    result = list_global_users(db_session, org_id=org2.id)
    assert [item["username"] for item in result["items"]] == ["bravo"]


# ============================================================================
# Create / update / delete
# ============================================================================


def test_create_global_user_with_org_membership(db_session: Session):
    org = _create_org(db_session, org_id=1, slug="acme")
    result = create_global_user(
        db_session,
        GlobalUserCreate(
            username="newbie",
            email="newbie@example.com",
            password=STRONG_PASSWORD,
            org_id=org.id,
            role_id=ADMIN_ROLE_ID,
        ),
    )
    assert result["username"] == "newbie"
    assert result["email_verified"] is True
    assert result["signup_method"] == "admin"
    assert result["orgs"][0]["role_id"] == ADMIN_ROLE_ID

    user = db_session.exec(select(User).where(User.username == "newbie")).one()
    assert user.password != STRONG_PASSWORD  # hashed


def test_create_global_user_rejects_duplicates_and_weak_passwords(db_session: Session):
    _create_user(db_session, user_id=1, username="taken")

    with pytest.raises(HTTPException) as exc_info:
        create_global_user(
            db_session,
            GlobalUserCreate(
                username="taken", email="other@example.com", password=STRONG_PASSWORD
            ),
        )
    assert exc_info.value.status_code == 409

    with pytest.raises(HTTPException) as exc_info:
        create_global_user(
            db_session,
            GlobalUserCreate(
                username="weakling", email="weak@example.com", password="weak"
            ),
        )
    assert exc_info.value.status_code == 400


def test_update_global_user_blocks_self_superadmin_removal(db_session: Session):
    user = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)

    with pytest.raises(HTTPException) as exc_info:
        update_global_user(
            db_session,
            _public_user(user),
            user.id,
            GlobalUserUpdate(is_superadmin=False),
        )
    assert exc_info.value.status_code == 400


def test_update_global_user_email_change_resets_verification(db_session: Session):
    actor = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)
    target = _create_user(db_session, user_id=2, username="target")
    target.email_verified = True
    db_session.add(target)
    db_session.commit()

    result = update_global_user(
        db_session,
        _public_user(actor),
        target.id,
        GlobalUserUpdate(email="new@example.com"),
    )
    assert result["email"] == "new@example.com"
    assert result["email_verified"] is False

    result = update_global_user(
        db_session,
        _public_user(actor),
        target.id,
        GlobalUserUpdate(email_verified=True),
    )
    assert result["email_verified"] is True
    assert result["email_verified_at"] is not None


def test_update_global_user_rejects_username_conflict(db_session: Session):
    actor = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)
    _create_user(db_session, user_id=2, username="taken")
    target = _create_user(db_session, user_id=3, username="target")

    with pytest.raises(HTTPException) as exc_info:
        update_global_user(
            db_session,
            _public_user(actor),
            target.id,
            GlobalUserUpdate(username="taken"),
        )
    assert exc_info.value.status_code == 409


def test_delete_global_user_blocks_self_and_removes_memberships(db_session: Session):
    org = _create_org(db_session, org_id=1, slug="acme")
    actor = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)
    target = _create_user(db_session, user_id=2, username="target")
    _add_membership(db_session, user_id=target.id, org_id=org.id)

    with pytest.raises(HTTPException) as exc_info:
        delete_global_user(db_session, _public_user(actor), actor.id)
    assert exc_info.value.status_code == 400

    delete_global_user(db_session, _public_user(actor), target.id)
    assert db_session.exec(select(User).where(User.id == target.id)).first() is None
    assert (
        db_session.exec(
            select(UserOrganization).where(UserOrganization.user_id == target.id)
        ).first()
        is None
    )


# ============================================================================
# Credentials & account state
# ============================================================================


def test_set_user_password_validates_and_clears_lockout(db_session: Session):
    user = _create_user(db_session, user_id=1, username="locked")
    user.failed_login_attempts = 5
    user.locked_until = "2099-01-01T00:00:00+00:00"
    db_session.add(user)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        set_user_password(db_session, user.id, SetPasswordPayload(new_password="weak"))
    assert exc_info.value.status_code == 400

    set_user_password(
        db_session, user.id, SetPasswordPayload(new_password=STRONG_PASSWORD)
    )
    db_session.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.locked_until is None
    assert user.password


def test_unlock_user_account(db_session: Session):
    user = _create_user(db_session, user_id=1, username="locked")
    user.failed_login_attempts = 5
    user.locked_until = "2099-01-01T00:00:00+00:00"
    db_session.add(user)
    db_session.commit()

    assert get_global_user(db_session, user.id)["is_locked"] is True

    unlock_user_account(db_session, user.id)
    db_session.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.locked_until is None
    assert get_global_user(db_session, user.id)["is_locked"] is False


# ============================================================================
# Memberships
# ============================================================================


def test_set_user_membership_creates_and_updates(db_session: Session):
    org = _create_org(db_session, org_id=1, slug="acme")
    user = _create_user(db_session, user_id=1, username="member")

    result = set_user_membership(
        db_session, user.id, org.id, MembershipUpdate(role_id=4)
    )
    assert result["role_id"] == 4

    result = set_user_membership(
        db_session, user.id, org.id, MembershipUpdate(role_id=ADMIN_ROLE_ID)
    )
    assert result["role_id"] == ADMIN_ROLE_ID

    memberships = db_session.exec(
        select(UserOrganization).where(UserOrganization.user_id == user.id)
    ).all()
    assert len(memberships) == 1
    assert memberships[0].role_id == ADMIN_ROLE_ID


def test_set_user_membership_blocks_demoting_last_admin(db_session: Session):
    org = _create_org(db_session, org_id=1, slug="acme")
    user = _create_user(db_session, user_id=1, username="only-admin")
    _add_membership(db_session, user_id=user.id, org_id=org.id, role_id=ADMIN_ROLE_ID)

    with pytest.raises(HTTPException) as exc_info:
        set_user_membership(db_session, user.id, org.id, MembershipUpdate(role_id=4))
    assert exc_info.value.status_code == 400


def test_remove_user_membership_guards(db_session: Session):
    owner_org = _create_org(db_session, org_id=1, slug="owner")
    other_org = _create_org(db_session, org_id=2, slug="other")
    admin = _create_user(db_session, user_id=1, username="only-admin")
    member = _create_user(db_session, user_id=2, username="member")
    _add_membership(db_session, user_id=admin.id, org_id=owner_org.id)
    _add_membership(
        db_session, user_id=admin.id, org_id=other_org.id, role_id=ADMIN_ROLE_ID
    )
    _add_membership(db_session, user_id=member.id, org_id=other_org.id)

    # Owner org memberships cannot be removed
    with pytest.raises(HTTPException) as exc_info:
        remove_user_membership(db_session, admin.id, owner_org.id)
    assert exc_info.value.status_code == 400

    # Last admin of an org cannot be removed
    with pytest.raises(HTTPException) as exc_info:
        remove_user_membership(db_session, admin.id, other_org.id)
    assert exc_info.value.status_code == 400

    # Regular member removal works
    remove_user_membership(db_session, member.id, other_org.id)
    assert (
        db_session.exec(
            select(UserOrganization).where(UserOrganization.user_id == member.id)
        ).first()
        is None
    )


# ============================================================================
# Batch actions
# ============================================================================


def test_batch_user_action_reports_partial_failures(db_session: Session):
    _create_org(db_session, org_id=1, slug="owner")
    org = _create_org(db_session, org_id=2, slug="acme")
    actor = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)
    user_a = _create_user(db_session, user_id=2, username="usera")
    user_b = _create_user(db_session, user_id=3, username="userb")
    _add_membership(db_session, user_id=user_a.id, org_id=org.id)

    result = batch_user_action(
        db_session,
        _public_user(actor),
        BatchUserAction(
            user_ids=[user_a.id, user_b.id, 999],
            action="remove_from_org",
            org_id=org.id,
        ),
    )
    assert result["succeeded"] == 1
    assert result["failed"] == 2
    by_user = {item["user_id"]: item for item in result["results"]}
    assert by_user[user_a.id]["success"] is True
    assert by_user[user_b.id]["success"] is False
    assert by_user[999]["success"] is False


def test_batch_user_action_delete_skips_self(db_session: Session):
    actor = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)
    target = _create_user(db_session, user_id=2, username="target")

    result = batch_user_action(
        db_session,
        _public_user(actor),
        BatchUserAction(user_ids=[actor.id, target.id], action="delete"),
    )
    assert result["succeeded"] == 1
    assert result["failed"] == 1
    assert db_session.exec(select(User).where(User.id == actor.id)).first() is not None
    assert db_session.exec(select(User).where(User.id == target.id)).first() is None


def test_batch_user_action_requires_org_for_org_actions(db_session: Session):
    actor = _create_user(db_session, user_id=1, username="admin", is_superadmin=True)

    with pytest.raises(HTTPException) as exc_info:
        batch_user_action(
            db_session,
            _public_user(actor),
            BatchUserAction(user_ids=[1], action="add_to_org"),
        )
    assert exc_info.value.status_code == 400

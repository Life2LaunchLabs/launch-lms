from datetime import datetime, timedelta

import pytest
from starlette.requests import Request
from sqlmodel import Session, create_engine, select

from src.db.organization_invitations import InviteUsersRequest, OrganizationInvitation
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, User, UserCreate, UserRead
from src.security.features_utils.usage import (
    _get_actual_admin_seat_count,
    _get_actual_member_count,
)
from src.services.orgs import users as org_users_service
from src.services.orgs import join as join_service
from src.services.orgs.join import JoinOrg
from src.services.users import users as user_service


NOW = datetime(2026, 8, 26, 12, 0, 0)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    for model in (Organization, User, Role, UserGroup, UserOrganization, OrganizationInvitation):
        model.__table__.create(engine)
    with Session(engine) as db_session:
        yield db_session


def _seed(session: Session):
    session.add(Organization(id=1, org_uuid="org_1", name="Studio", slug="studio", email="studio@example.com"))
    session.add(Role(id=1, name="Admin", role_uuid="role_global_admin", rights={"dashboard": {"action_access": True}}))
    session.add(Role(id=4, name="User", role_uuid="role_global_user", rights={"dashboard": {"action_access": False}}))
    session.add(User(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True))
    session.add(User(id=2, user_uuid="user_2", username="existing", email="existing@example.com", first_name="E", last_name="Xisting"))
    session.add(UserOrganization(user_id=1, org_id=1, role_id=1, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
    session.add(UserGroup(id=1, org_id=1, usergroup_uuid="group_1", name="Blue group", description=""))
    session.commit()


def _invitation(**overrides):
    values = {
        "invitation_uuid": "invite_1",
        "org_id": 1,
        "email": "pending@example.com",
        "email_normalized": "pending@example.com",
        "role_id": 4,
        "invite_code_uuid": "code_1",
        "status": "pending",
        "expires_at": NOW + timedelta(days=30),
        "created_at": NOW,
        "updated_at": NOW,
    }
    values.update(overrides)
    return OrganizationInvitation(**values)


def test_pending_invitations_reserve_member_and_admin_seats(session: Session):
    _seed(session)
    session.add(_invitation())
    session.add(_invitation(invitation_uuid="invite_2", email="admin@example.com", email_normalized="admin@example.com", role_id=1))
    session.add(_invitation(invitation_uuid="invite_3", email="expired@example.com", email_normalized="expired@example.com", expires_at=datetime.utcnow() - timedelta(days=1)))
    session.add(_invitation(invitation_uuid="invite_4", email="accepted@example.com", email_normalized="accepted@example.com", status="accepted"))
    session.commit()

    assert _get_actual_member_count(1, session) == 3  # owner + two pending invitations
    assert _get_actual_admin_seat_count(1, session) == 2  # owner + pending admin


@pytest.mark.asyncio
async def test_batch_invite_validates_deduplicates_and_records_role_and_group(session: Session, monkeypatch):
    _seed(session)

    async def allow_rbac(*_args, **_kwargs):
        return True

    monkeypatch.setattr(org_users_service, "rbac_check", allow_rbac)
    monkeypatch.setattr(org_users_service, "check_limits_with_usage", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(org_users_service, "increase_feature_usage", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(org_users_service, "send_direct_invitation_email", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("src.security.superadmin.is_user_superadmin", lambda *_args, **_kwargs: True)

    current_user = PublicUser(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True)
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    result = await org_users_service.invite_batch_users(
        request,
        1,
        InviteUsersRequest(
            emails=[" Existing@Example.com ", "new@example.com", "new@example.com", "not-an-email"],
            role_id=4,
            usergroup_id=1,
        ),
        session,
        current_user,
    )

    assert result.created == 2
    assert [item.status for item in result.results] == ["invited", "invited", "duplicate", "invalid"]
    invitations = session.exec(select(OrganizationInvitation).order_by(OrganizationInvitation.email_normalized)).all()
    assert [item.email_normalized for item in invitations] == ["existing@example.com", "new@example.com"]
    assert invitations[0].target_user_id == 2
    assert all(item.role_id == 4 and item.usergroup_id == 1 for item in invitations)
    assert all(item.invite_code_uuid is None for item in invitations)
    assert all(item.email_sent and item.delivery_attempts == 1 for item in invitations)


@pytest.mark.asyncio
@pytest.mark.parametrize("signup_mode", ["inviteOnly", "open"])
async def test_existing_user_acceptance_converts_reserved_invitation_without_new_usage(session: Session, monkeypatch, signup_mode: str):
    _seed(session)
    invitation = _invitation(
        email="existing@example.com",
        email_normalized="existing@example.com",
        target_user_id=2,
        usergroup_id=1,
    )
    session.add(invitation)
    session.commit()

    async def invite_only(*_args, **_kwargs):
        return signup_mode

    added_to_groups: list[tuple[int, str]] = []

    async def add_to_group(_request, _session, _actor, group_id, user_ids):
        added_to_groups.append((group_id, user_ids))

    def should_not_charge(*_args, **_kwargs):
        raise AssertionError("a reserved invitation must not consume another seat")

    monkeypatch.setattr(join_service, "get_org_join_mechanism", invite_only)
    monkeypatch.setattr(join_service, "add_users_to_usergroup", add_to_group)
    monkeypatch.setattr(join_service, "check_limits_with_usage", should_not_charge)
    monkeypatch.setattr(join_service, "increase_feature_usage", should_not_charge)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)

    current_user = PublicUser(id=2, user_uuid="user_2", username="existing", email="existing@example.com", first_name="E", last_name="Xisting")
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    await join_service.join_org(request, JoinOrg(org_id=1, user_id=2, invitation_token="invite_1"), current_user, session)

    session.refresh(invitation)
    membership = session.exec(select(UserOrganization).where(UserOrganization.user_id == 2, UserOrganization.org_id == 1)).one()
    assert invitation.status == "accepted"
    assert invitation.target_user_id == 2
    assert membership.role_id == 4
    assert added_to_groups == [(1, "2")]


@pytest.mark.asyncio
async def test_new_account_invitation_is_bound_to_recipient_and_carries_access(session: Session, monkeypatch):
    _seed(session)
    invitation = _invitation(usergroup_id=1)
    session.add(invitation)
    session.commit()

    create_args: dict = {}

    async def create_user(*_args, **kwargs):
        create_args.update(kwargs)
        return UserRead(id=9, user_uuid="user_9", username="pending", email="pending@example.com", first_name="P", last_name="Ending")

    groups: list[tuple[int, str]] = []

    async def add_to_group(_request, _session, _actor, group_id, user_ids):
        groups.append((group_id, user_ids))

    monkeypatch.setattr(user_service, "create_user", create_user)
    monkeypatch.setattr(user_service, "add_users_to_usergroup", add_to_group)
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    user_object = UserCreate(username="pending", email="pending@example.com", password="Str0ng!Passw0rd", first_name="P", last_name="Ending")

    result = await user_service.create_user_with_organization_invitation(
        request, session, AnonymousUser(), user_object, 1, "invite_1"
    )

    assert result.id == 9
    assert create_args["membership_role_id"] == 4
    assert create_args["reserved_invitation_id"] == invitation.id
    assert groups == [(1, "9")]

    wrong_email = user_object.model_copy(update={"email": "someone-else@example.com"})
    with pytest.raises(Exception) as exc_info:
        await user_service.create_user_with_organization_invitation(
            request, session, AnonymousUser(), wrong_email, 1, "invite_1"
        )
    assert getattr(exc_info.value, "status_code", None) == 403

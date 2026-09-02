from datetime import datetime, timedelta

import pytest
from sqlalchemy import inspect
from starlette.requests import Request
from sqlmodel import Session, create_engine, select

from src.db.audit_logs import AuditLog
from src.db.messages import InboxMessage
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import InviteUsersRequest, OrganizationInvitation, OrganizationJoinLink
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
from src.services.orgs import invites as org_invites_service
from src.services.orgs import join as join_service
from src.services.orgs import orgs as orgs_service
from src.services.orgs.join import JoinOrg
from src.services.users import users as user_service


NOW = datetime(2026, 8, 26, 12, 0, 0)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    for model in (Organization, User, Role, UserGroup, UserOrganization, OrganizationConfig, OrganizationInvitation, OrganizationJoinLink, AuditLog, InboxMessage):
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
    session.add(OrganizationConfig(org_id=1, config={"config_version": "2.0", "plan": "full"}, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
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


def test_direct_invitation_does_not_require_shared_invite_code(session: Session):
    columns = {column["name"]: column for column in inspect(session.get_bind()).get_columns("organizationinvitation")}
    assert columns["invite_code_uuid"]["nullable"] is True
    session.add(_invitation(invite_code_uuid=None))
    session.commit()


def test_recipient_can_list_view_and_decline_organization_invitation(session: Session, monkeypatch):
    _seed(session)
    invitation = _invitation(
        email="existing@example.com",
        email_normalized="existing@example.com",
        target_user_id=2,
        usergroup_id=1,
    )
    session.add(invitation)
    session.commit()
    current_user = PublicUser(id=2, user_uuid="user_2", username="existing", email="existing@example.com", first_name="E", last_name="Xisting")

    messages = org_users_service.get_my_organization_invitations(current_user, session)
    assert len(messages) == 1
    assert messages[0]["unread"] is True
    assert messages[0]["organization"]["slug"] == "studio"
    assert messages[0]["usergroup"]["name"] == "Blue group"

    result = org_users_service.mark_my_organization_invitations_viewed(current_user, session)
    session.refresh(invitation)
    assert result["updated"] == 1
    assert invitation.viewed_at is not None

    monkeypatch.setattr(org_users_service, "decrease_feature_usage", lambda *_args, **_kwargs: True)
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    org_users_service.decline_my_organization_invitation(request, invitation.invitation_uuid, current_user, session)
    session.refresh(invitation)
    assert invitation.status == "declined"
    assert org_users_service.get_my_organization_invitations(current_user, session) == []


@pytest.mark.asyncio
async def test_dashboard_organization_list_includes_non_admin_roles_with_access(session: Session):
    _seed(session)
    session.add(Role(id=2, name="Maintainer", role_uuid="role_global_maintainer", rights={"dashboard": {"action_access": True}}))
    session.add(UserOrganization(user_id=2, org_id=1, role_id=2, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
    session.commit()
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})

    organizations = await orgs_service.get_orgs_by_user_admin(request, session, "2", 1, 100)

    assert [organization.slug for organization in organizations] == ["studio"]


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
    messages = session.exec(select(InboxMessage).order_by(InboxMessage.recipient_email_normalized)).all()
    assert [item.recipient_email_normalized for item in messages] == ["existing@example.com", "new@example.com"]
    assert all(item.action_kind == "organization_invitation" for item in messages)


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


@pytest.mark.asyncio
async def test_csv_preview_is_a_dry_run_and_reports_existing_rows(session: Session, monkeypatch):
    _seed(session)

    async def allow_rbac(*_args, **_kwargs):
        return True

    monkeypatch.setattr(org_users_service, "rbac_check", allow_rbac)
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    current_user = PublicUser(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True)
    result = await org_users_service.preview_batch_users(
        request, 1,
        InviteUsersRequest(emails=["new@example.com", "existing@example.com", "bad", "new@example.com"], role_id=4, source="csv"),
        session, current_user,
    )

    assert [item.status for item in result.results] == ["ready", "ready", "invalid", "duplicate"]
    assert session.exec(select(OrganizationInvitation)).all() == []


@pytest.mark.asyncio
async def test_managed_join_link_is_hashed_domain_limited_and_reserves_seats(session: Session, monkeypatch):
    _seed(session)

    async def allow_rbac(*_args, **_kwargs):
        return True

    monkeypatch.setattr(org_invites_service, "rbac_check", allow_rbac)
    monkeypatch.setattr(org_invites_service, "increase_feature_usage", lambda *_args, **_kwargs: True)
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    current_user = PublicUser(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True)
    created = await org_invites_service.create_invite_code(
        request, 1, current_user, session,
        display_name="Photography group", usergroup_id=1, expires_in_minutes=30,
        max_redemptions=2, approved_email_domain="school.edu",
    )

    link = session.exec(select(OrganizationJoinLink)).one()
    assert created["invite_code"] not in link.token_hash
    assert link.role_id == 4
    assert _get_actual_member_count(1, session) == 3  # owner + two reserved redemptions
    with pytest.raises(Exception) as exc_info:
        org_invites_service.redeem_join_link(session, link.link_uuid, "learner@example.com")
    assert getattr(exc_info.value, "status_code", None) == 403

    org_invites_service.redeem_join_link(session, link.link_uuid, "learner@school.edu")
    session.commit()
    session.refresh(link)
    assert link.redemption_count == 1
    assert link.status == "active"
    assert _get_actual_member_count(1, session) == 2  # owner + one remaining reservation


@pytest.mark.asyncio
async def test_resend_enforces_cooldown(session: Session, monkeypatch):
    _seed(session)
    invitation = _invitation(last_sent_at=datetime.utcnow(), delivery_attempts=1)
    session.add(invitation)
    session.commit()

    async def allow_rbac(*_args, **_kwargs):
        return True

    monkeypatch.setattr(org_users_service, "rbac_check", allow_rbac)
    request = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})
    current_user = PublicUser(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True)

    with pytest.raises(Exception) as exc_info:
        await org_users_service.resend_invited_user(request, 1, invitation.invitation_uuid, session, current_user)
    assert getattr(exc_info.value, "status_code", None) == 429

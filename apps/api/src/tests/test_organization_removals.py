"""A learner a school removed with its data (OP-3, UT-39 / FEED-632, DEV-187) can't rejoin on their own: open Join is
refused and the school's page shows them invite only. The school's own invitation lets them back and clears it."""

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.requests import Request

from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation
from src.db.organization_join_requests import JoinRequestCreate, OrganizationJoinRequest
from src.db.organization_removals import OrganizationRemoval
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.orgs import join as join_service, join_requests, removals
from src.services.orgs.join import JoinOrg
from src.services.orgs.orgs import get_discoverable_org_by_slug

OWNER, SCHOOL = 1, 2
PRINCIPAL, NORA, OTHER = 1, 5, 6
NOW = datetime.utcnow().replace(microsecond=0)


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)
    with Session(engine) as session:
        stamp = NOW.isoformat()
        session.add(Organization(id=OWNER, org_uuid="org_owner", name="Life2Launch", slug="life2launch", email="hello@example.com"))
        session.add(Organization(id=SCHOOL, org_uuid="org_school", name="Pinecrest Charter School", slug="pinecrest", email="office@example.com", explore=True))
        for org_id, tier in ((OWNER, "enterprise"), (SCHOOL, "full")):
            session.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", "tier": tier}, creation_date=stamp, update_date=stamp))
        for role_id, name in ((1, "Admin"), (2, "Staff"), (4, "Learner")):
            session.add(Role(id=role_id, name=name, role_uuid=f"role_{role_id}", rights={}))
        for user_id, username in ((PRINCIPAL, "principal"), (NORA, "nora"), (OTHER, "omar")):
            session.add(User(id=user_id, user_uuid=f"user_{user_id}", username=username, email=f"{username}@example.com", first_name=username.title(), last_name="Test"))
            session.add(UserOrganization(user_id=user_id, org_id=OWNER, role_id=4, creation_date=stamp, update_date=stamp))
        session.add(UserOrganization(user_id=PRINCIPAL, org_id=SCHOOL, role_id=1, creation_date=stamp, update_date=stamp))
        session.commit()
        yield session


def _request() -> Request:
    return Request({"type": "http", "scheme": "https", "server": ("pinecrest.example.com", 443), "path": "/", "headers": []})


def _user(db: Session, user_id: int) -> PublicUser:
    return PublicUser(**db.get(User, user_id).model_dump(exclude={"password"}))


def _member(db: Session, user_id: int) -> bool:
    return db.exec(select(UserOrganization.id).where(UserOrganization.user_id == user_id, UserOrganization.org_id == SCHOOL)).first() is not None


def _removed(db: Session) -> None:
    removals.note(db, SCHOOL, NORA, PRINCIPAL)
    db.commit()


@pytest.mark.asyncio
async def test_a_removed_learner_pressing_join_on_an_open_school_is_refused(db):
    _removed(db)
    with pytest.raises(HTTPException) as refused:
        await join_service.join_org(_request(), JoinOrg(org_id=SCHOOL, user_id=NORA), _user(db, NORA), db)
    assert refused.value.status_code == 403
    assert "invite you" in refused.value.detail
    assert not _member(db, NORA)
    # Anyone else still just joins.
    await join_service.join_org(_request(), JoinOrg(org_id=SCHOOL, user_id=OTHER), _user(db, OTHER), db)
    assert _member(db, OTHER)


@pytest.mark.asyncio
async def test_the_school_page_shows_a_removed_learner_invite_only(db):
    _removed(db)
    assert (await get_discoverable_org_by_slug(db, _user(db, NORA), "pinecrest")).signup_mode == "inviteOnly"
    assert (await get_discoverable_org_by_slug(db, _user(db, OTHER), "pinecrest")).signup_mode == "open"


@pytest.mark.asyncio
async def test_the_schools_invitation_lets_them_back_and_clears_the_removal(db):
    _removed(db)
    db.add(OrganizationInvitation(invitation_uuid="org_invitation_nora", org_id=SCHOOL, email="nora@example.com", email_normalized="nora@example.com",
                                  role_id=4, invite_code_uuid="code_nora", status="pending", expires_at=NOW + timedelta(days=30),
                                  created_at=NOW, updated_at=NOW, invited_by_user_id=PRINCIPAL))
    db.commit()
    await join_service.join_org(_request(), JoinOrg(org_id=SCHOOL, user_id=NORA, invitation_token="org_invitation_nora"), _user(db, NORA), db)
    assert _member(db, NORA)
    assert db.exec(select(OrganizationRemoval)).all() == []


@pytest.mark.asyncio
async def test_a_removed_learner_can_ask_an_open_school_to_let_them_back(db):
    with pytest.raises(HTTPException):
        await join_requests.ask(_request(), db, _user(db, OTHER), SCHOOL, JoinRequestCreate(message="hi"))
    _removed(db)
    answer = await join_requests.ask(_request(), db, _user(db, NORA), SCHOOL, JoinRequestCreate(message="We moved back"))
    assert answer["status"] == "requested"
    assert db.exec(select(OrganizationJoinRequest.user_id)).all() == [NORA]

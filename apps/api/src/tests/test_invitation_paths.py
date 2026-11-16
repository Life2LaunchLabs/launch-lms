"""Accepting an organization's invitation, end to end through the real services, on all four paths:
a new or existing account, invited as a learner or as staff (DEV-30, FEED-172, FEED-53, FEED-83).

Each path must leave the person a member of the inviting organization with the invited role, able to
use it (staff pass the staff check), and still a member of Life2Launch itself (the owner organization),
so the main site doesn't treat them as a stranger.
"""

from datetime import date, datetime, timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.requests import Request
from starlette.responses import Response

from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin, is_org_member
from src.services.orgs import join as join_service
from src.services.orgs.join import JoinOrg

OWNER, SCHOOL = 1, 2
NOW = datetime.utcnow().replace(microsecond=0)


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)
    with Session(engine) as session:
        stamp = NOW.isoformat()
        session.add(Organization(id=OWNER, org_uuid="org_owner", name="Life2Launch", slug="life2launch", email="hello@example.com"))
        session.add(Organization(id=SCHOOL, org_uuid="org_school", name="Lincoln High", slug="lincoln", email="office@example.com"))
        for org_id, tier in ((OWNER, "enterprise"), (SCHOOL, "full")):
            session.add(OrganizationConfig(org_id=org_id, config={"config_version": "3.0", "tier": tier}, creation_date=stamp, update_date=stamp))
        for role_id, name in ((1, "Admin"), (2, "Staff"), (4, "Learner")):
            session.add(Role(id=role_id, name=name, role_uuid=f"role_{role_id}", rights={}))
        session.add(User(id=1, user_uuid="user_1", username="principal", email="principal@example.com", first_name="Pat", last_name="Lee"))
        session.add(UserOrganization(user_id=1, org_id=SCHOOL, role_id=1, creation_date=stamp, update_date=stamp))
        session.add(UserOrganization(user_id=1, org_id=OWNER, role_id=4, creation_date=stamp, update_date=stamp))
        session.commit()
        yield session


def _invite(db: Session, email: str, role_id: int) -> str:
    token = f"org_invitation_{email.split('@')[0]}"
    db.add(OrganizationInvitation(invitation_uuid=token, org_id=SCHOOL, email=email, email_normalized=email, role_id=role_id,
                                  invite_code_uuid=f"code_{token}", status="pending", expires_at=NOW + timedelta(days=30),
                                  created_at=NOW, updated_at=NOW, invited_by_user_id=1))
    db.commit()
    return token


def _request() -> Request:
    return Request({"type": "http", "scheme": "https", "server": ("lincoln.example.com", 443), "path": "/", "headers": []})


async def _sign_up(db: Session, email: str, token: str) -> tuple[User, dict]:
    from src.routers import auth as auth_router

    body = auth_router.WelcomeSignupRequest(email=email, password="Str0ng!Passw0rd", invitation_token=token, first_name="Sam", last_name="Rivera", birth_date=date(2008, 5, 1))
    result = await auth_router.complete_welcome_signup(_request(), Response(), body, db)
    return db.exec(select(User).where(User.email == email)).one(), result


async def _accept(db: Session, user_id: int, email: str, token: str) -> None:
    current = PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=email, first_name="E", last_name="X")
    await join_service.join_org(_request(), JoinOrg(org_id=SCHOOL, user_id=user_id, invitation_token=token), current, db)


def _existing(db: Session, user_id: int, email: str) -> None:
    stamp = NOW.isoformat()
    db.add(User(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=email, first_name="E", last_name="X"))
    db.add(UserOrganization(user_id=user_id, org_id=OWNER, role_id=4, creation_date=stamp, update_date=stamp))
    db.commit()


def _role(db: Session, user_id: int, org_id: int) -> int | None:
    membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == user_id, UserOrganization.org_id == org_id)).first()
    return membership.role_id if membership else None


@pytest.mark.asyncio
async def test_a_new_learner_joins_the_school_and_life2launch_and_starts_their_first_phase(db):
    user, result = await _sign_up(db, "new.learner@example.com", _invite(db, "new.learner@example.com", 4))
    assert (_role(db, user.id, SCHOOL), _role(db, user.id, OWNER)) == (4, 4)
    assert result["onboarding"]["redirect_url"] == "/orgs/lincoln/first-phase?next=/orgs/lincoln"
    assert db.exec(select(OrganizationInvitation.status)).one() == "accepted"


@pytest.mark.asyncio
async def test_a_new_staff_member_joins_as_staff_can_use_staff_pages_and_belongs_to_life2launch(db):
    user, result = await _sign_up(db, "new.staff@example.com", _invite(db, "new.staff@example.com", 2))
    assert (_role(db, user.id, SCHOOL), _role(db, user.id, OWNER)) == (2, 4)
    assert is_org_admin(user.id, SCHOOL, db, "review_work")  # the staff check every staff page makes
    assert is_org_member(user.id, OWNER, db)  # no "join" banner on the main site
    assert result["onboarding"]["redirect_url"] == "/orgs/lincoln/joined?tour=1"


@pytest.mark.asyncio
async def test_an_existing_learner_accepts_and_joins_the_school_as_a_learner(db):
    _existing(db, 7, "existing.learner@example.com")
    await _accept(db, 7, "existing.learner@example.com", _invite(db, "existing.learner@example.com", 4))
    assert (_role(db, 7, SCHOOL), _role(db, 7, OWNER)) == (4, 4)
    assert not is_org_admin(7, SCHOOL, db)


@pytest.mark.asyncio
async def test_an_existing_staff_member_accepts_and_can_use_staff_pages(db):
    _existing(db, 8, "existing.staff@example.com")
    await _accept(db, 8, "existing.staff@example.com", _invite(db, "existing.staff@example.com", 2))
    assert (_role(db, 8, SCHOOL), _role(db, 8, OWNER)) == (2, 4)
    assert is_org_admin(8, SCHOOL, db, "review_work")

"""Staff invite learners from a CIS export, with their CIS work held privately until they accept (DEV-40).

Synthetic files only, never real learner data."""

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, create_engine, select
from starlette.requests import Request

from src.db.audit_logs import AuditLog
from src.db.messages import InboxMessage
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.organizations import Organization
from src.db.portfolio_held_imports import HeldPortfolioImport
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services import portfolio_held_imports as held
from src.services.orgs import invites as org_invites, users as org_users
from src.tests.test_portfolio_import_bulk import _bulk

NOW = datetime.utcnow().replace(microsecond=0)
STAFF = PublicUser(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True)
REQUEST = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    for model in (Organization, User, Role, UserGroup, UserOrganization, OrganizationConfig, OrganizationInvitation, OrganizationJoinLink, AuditLog, InboxMessage, HeldPortfolioImport):
        model.__table__.create(engine)
    with Session(engine) as session:
        session.add(Organization(id=1, org_uuid="org_1", name="Studio", slug="studio", email="studio@example.com"))
        session.add(Role(id=1, name="Admin", role_uuid="role_global_admin", rights={"dashboard": {"action_access": True}}))
        session.add(Role(id=4, name="User", role_uuid="role_global_user", rights={"dashboard": {"action_access": False}}))
        session.add(User(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True))
        # Leo already belongs to the organization.
        session.add(User(id=2, user_uuid="user_2", username="leo", email="leo@example.com", first_name="Leo", last_name="Chen"))
        session.add(UserOrganization(user_id=1, org_id=1, role_id=1, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
        session.add(UserOrganization(user_id=2, org_id=1, role_id=4, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
        session.add(OrganizationConfig(org_id=1, config={"config_version": "3.0", "tier": "full"}, creation_date=NOW.isoformat(), update_date=NOW.isoformat()))
        session.commit()
        yield session


@pytest.fixture
def mail(monkeypatch):
    sent: list[dict] = []

    async def allow(*_args, **_kwargs):
        return True

    monkeypatch.setattr(org_users, "rbac_check", allow)
    monkeypatch.setattr("src.security.superadmin.is_user_superadmin", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(held, "require_org_admin", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(org_invites, "send_direct_invitation_email", lambda org, user, email, token, base, setup=None, idempotency_key=None: sent.append({"to": str(email), "kind": "invitation", "setup": setup}))
    monkeypatch.setattr(held, "send_waiting_email", lambda org, inviter, email, link, key: sent.append({"to": email, "kind": "waiting", "link": link}))
    return sent


def _keys(content: bytes, filename: str = "bulk.xlsx") -> dict[str, str]:
    from src.services import portfolio_import_bulk as bulk

    return {learner["name"]: learner["key"] for learner in bulk.preview(content, filename)["learners"]}


@pytest.mark.asyncio
async def test_each_learner_gets_an_invitation_saying_their_cis_work_is_waiting(db, mail):
    content = _bulk()
    keys = _keys(content)
    picks = [{"key": keys["Maya Rivera"]}, {"key": keys["Leo Chen"]}, {"key": keys["Ada Okafor"], "email": "ada@example.com"}]

    result = await held.send(REQUEST, 1, content, "bulk.xlsx", picks, "Welcome!", None, STAFF, db)

    statuses = {row["email"]: row["status"] for row in result["results"]}
    assert statuses == {"maya@example.com": "invited", "leo@example.com": "waiting_member", "ada@example.com": "invited"}
    assert result["sent"] == 3
    invitations = {row.email_normalized: row for row in db.exec(select(OrganizationInvitation)).all()}
    assert set(invitations) == {"maya@example.com", "ada@example.com"}
    assert all(row.source == "cis" and row.role_id == 4 for row in invitations.values())
    # The invitation email says the CIS work is waiting; a member gets a note pointing to their import page.
    by_to = {item["to"]: item for item in mail}
    assert by_to["maya@example.com"]["setup"]["cis"] == {"items": 2}
    assert by_to["leo@example.com"]["kind"] == "waiting" and by_to["leo@example.com"]["link"].endswith("/portfolio/import")
    holds = {row.email_normalized: row for row in db.exec(select(HeldPortfolioImport)).all()}
    assert holds["maya@example.com"].invitation_id == invitations["maya@example.com"].id
    assert holds["leo@example.com"].target_user_id == 2 and holds["leo@example.com"].invitation_id is None
    assert holds["maya@example.com"].content and holds["maya@example.com"].created_by_user_id == 1
    assert holds["ada@example.com"].summary == {"items": 0, "groups": {}}


@pytest.mark.asyncio
async def test_bad_or_missing_emails_are_reported_per_learner_and_nothing_is_held_for_them(db, mail):
    content = _bulk()
    keys = _keys(content)
    result = await held.send(REQUEST, 1, content, "bulk.xlsx", [{"key": keys["Ada Okafor"]}, {"key": "lrn_nobody"}], "", None, STAFF, db)
    assert [row["status"] for row in result["results"]] == ["invalid", "missing"]
    assert result["sent"] == 0
    assert db.exec(select(HeldPortfolioImport)).all() == []
    assert mail == []


@pytest.mark.asyncio
async def test_a_single_learners_download_is_held_as_uploaded(db, mail):
    from src.tests.test_portfolio_imports import _cis_zip

    content = _cis_zip()
    key = _keys(content, "cis.zip")["Maya Rivera"]
    await held.send(REQUEST, 1, content, "cis.zip", [{"key": key, "email": "maya@example.com"}], "", None, STAFF, db)
    [row] = db.exec(select(HeldPortfolioImport)).all()
    assert row.content == content and row.filename == "cis.zip"
    assert row.summary["groups"]["documents"] == 1


@pytest.mark.asyncio
async def test_withdrawing_or_revoking_deletes_the_held_export(db, mail):
    content = _bulk()
    keys = _keys(content)
    await held.send(REQUEST, 1, content, "bulk.xlsx", [{"key": keys["Maya Rivera"]}, {"key": keys["Leo Chen"]}], "", None, STAFF, db)
    holds = {row.email_normalized: row for row in db.exec(select(HeldPortfolioImport)).all()}

    held.withdraw(1, holds["leo@example.com"].held_uuid, STAFF, db)
    db.refresh(holds["leo@example.com"])
    assert holds["leo@example.com"].status == "withdrawn" and holds["leo@example.com"].content is None

    invitation = db.exec(select(OrganizationInvitation)).one()
    invitation.status = "revoked"
    db.add(invitation)
    db.commit()
    assert held.purge(db) == 1
    db.refresh(holds["maya@example.com"])
    assert holds["maya@example.com"].status == "expired" and holds["maya@example.com"].content is None


@pytest.mark.asyncio
async def test_held_work_past_its_date_is_deleted(db, mail):
    content = _bulk()
    await held.send(REQUEST, 1, content, "bulk.xlsx", [{"key": _keys(content)["Leo Chen"]}], "", None, STAFF, db)
    row = db.exec(select(HeldPortfolioImport)).one()
    row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.add(row)
    db.commit()
    held.purge(db)
    db.refresh(row)
    assert row.status == "expired" and row.content is None


@pytest.mark.asyncio
async def test_sending_again_replaces_what_was_waiting(db, mail):
    content = _bulk()
    key = _keys(content)["Leo Chen"]
    await held.send(REQUEST, 1, content, "bulk.xlsx", [{"key": key}], "", None, STAFF, db)
    await held.send(REQUEST, 1, content, "bulk.xlsx", [{"key": key}], "", None, STAFF, db)
    rows = db.exec(select(HeldPortfolioImport).order_by(HeldPortfolioImport.id)).all()
    assert [row.status for row in rows] == ["withdrawn", "held"]
    assert rows[0].content is None


@pytest.mark.asyncio
async def test_staff_only_see_what_they_sent_and_never_the_export(db, mail, monkeypatch):
    content = _bulk()
    await held.send(REQUEST, 1, content, "bulk.xlsx", [{"key": _keys(content)["Leo Chen"]}], "", None, STAFF, db)
    monkeypatch.setattr(held, "is_org_owner_admin", lambda *_args: False)
    [row] = held.sent_list(1, STAFF, db)
    assert row["learner_name"] == "Leo Chen" and "content" not in row
    other = PublicUser(id=3, user_uuid="user_3", username="other", email="other@example.com", first_name="Ot", last_name="Her")
    assert held.sent_list(1, other, db) == []
    with pytest.raises(Exception) as error:
        held.withdraw(1, row["held_uuid"], other, db)
    assert getattr(error.value, "status_code", None) == 404


def test_staff_need_manage_learners(db):
    from fastapi import HTTPException

    learner = PublicUser(id=2, user_uuid="user_2", username="leo", email="leo@example.com", first_name="Leo", last_name="Chen")
    with pytest.raises(HTTPException) as error:
        held.sent_list(1, learner, db)
    assert error.value.status_code == 403

"""Held CIS work comes into the portfolio when the learner accepts, once, for new and existing accounts (DEV-41).

Synthetic files only, never real learner data."""

from datetime import datetime, timedelta

import pytest
from sqlmodel import select
from starlette.requests import Request

from src.db.audit_logs import AuditLog
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation
from src.db.portfolio import TimelineEntry
from src.db.portfolio_held_imports import HeldPortfolioImport
from src.db.portfolio_records import PortfolioImport
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.messages import InboxMessage
from src.db.usergroups import UserGroup
from src.services import media as media_service, portfolio_held_imports as held, portfolio_imports as imports
from src.services.orgs import join as join_service
from src.services.orgs.join import JoinOrg
from src.tests.test_portfolio import _public, _session, _user
from src.tests.test_portfolio_import_bulk import _bulk
from src.tests.test_portfolio_imports import _cis_zip, _fake_upload_file, _upload
from src.services import portfolio_import_bulk as bulk

NOW = datetime.utcnow().replace(microsecond=0)
REQUEST = Request({"type": "http", "scheme": "https", "server": ("youth.example.com", 443), "path": "/", "headers": []})


def _world(db, member: bool):
    engine = db.get_bind()
    for model in (OrganizationInvitation, HeldPortfolioImport, AuditLog, OrganizationConfig, UserGroup, InboxMessage):
        model.__table__.create(engine, checkfirst=True)
    user = _user()
    db.add_all([user, Role(id=4, name="User", role_uuid="role_global_user", rights={})])
    db.add(OrganizationConfig(org_id=1, config={"config_version": "3.0", "tier": "full"}, creation_date="", update_date=""))
    if member:
        db.add(UserOrganization(user_id=1, org_id=1, role_id=4, creation_date="", update_date=""))
    db.commit()
    return user


def _held(db, content: bytes, filename: str, invitation_id=None, target_user_id=None) -> HeldPortfolioImport:
    row = HeldPortfolioImport(held_uuid=f"held_{filename}_{invitation_id}", org_id=1, invitation_id=invitation_id, email_normalized="maya@example.com", learner_name="Maya Rivera",
                              target_user_id=target_user_id, created_by_user_id=None, filename=filename, content=content, summary={"items": 3}, expires_at=NOW + timedelta(days=30))
    db.add(row)
    db.commit()
    return row


def _invitation(db) -> OrganizationInvitation:
    invitation = OrganizationInvitation(invitation_uuid="invite_cis", org_id=1, email="maya@example.com", email_normalized="maya@example.com", role_id=4, source="cis",
                                        status="pending", expires_at=NOW + timedelta(days=30), created_at=NOW, updated_at=NOW)
    db.add(invitation)
    db.commit()
    return invitation


def _maya_slice() -> bytes:
    return next(item for item in bulk.learner_exports(_bulk(), "bulk.xlsx") if item["name"] == "Maya Rivera")["content"]


@pytest.mark.asyncio
async def test_accepting_a_cis_invitation_brings_the_work_into_the_portfolio(monkeypatch):
    async def invite_only(*_args, **_kwargs):
        return "inviteOnly"

    monkeypatch.setattr(join_service, "get_org_join_mechanism", invite_only)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda *_args: None)
    with _session() as db:
        user = _world(db, member=False)
        invitation = _invitation(db)
        row = _held(db, _maya_slice(), "Oregon CIS data.xlsx", invitation_id=invitation.id)

        await join_service.join_org(REQUEST, JoinOrg(org_id=1, user_id=1, invitation_token="invite_cis"), _public(user), db)

        db.refresh(row)
        assert row.status == "imported" and row.content is None and row.target_user_id == 1
        assert row.added == {"experience": 1, "results": 1}
        assert [entry.title for entry in db.exec(select(TimelineEntry)).all()] == ["Animal Care Helper"]
        # The course plan rows are kept for the EPP like any CIS import.
        [kept] = db.exec(select(PortfolioImport)).all()
        assert kept.kept["Course Plan"][0]["Course title"] == "Algebra 1"


@pytest.mark.asyncio
async def test_a_member_brings_it_in_from_their_portfolio_and_nothing_is_duplicated(monkeypatch):
    monkeypatch.setattr(media_service, "upload_file", _fake_upload_file)
    with _session() as db:
        user = _world(db, member=True)
        actor = _public(user)
        content = _cis_zip()
        # They brought part of it in by hand before.
        preview = await imports.preview_import("cis", _upload(content, "cis.zip"), actor, db)
        await imports.run_import("cis", _upload(content, "cis.zip"), [item["key"] for item in preview["items"] if item["kind"] == "timeline"], actor, db)
        row = _held(db, content, "cis.zip", target_user_id=1)

        [waiting] = held.waiting_for_me(actor, db)
        assert waiting["held_uuid"] == row.held_uuid and waiting["org_name"] == "Youth Lab"
        result = await held.accept_mine(row.held_uuid, actor, db)

        assert "experience" not in result["added"] and result["added"]["documents"] == 1
        assert len(db.exec(select(TimelineEntry)).all()) == 3
        assert held.waiting_for_me(actor, db) == []
        # Accepting again, or importing the same file by hand, adds nothing.
        with pytest.raises(Exception) as error:
            await held.accept_mine(row.held_uuid, actor, db)
        assert getattr(error.value, "status_code", None) == 404
        again = await imports.run_import("cis", _upload(content, "cis.zip"), [item["key"] for item in preview["items"]], actor, db)
        assert again["added"] == {}


@pytest.mark.asyncio
async def test_work_on_a_pending_invitation_waits_until_it_is_accepted():
    with _session() as db:
        user = _world(db, member=True)
        invitation = _invitation(db)
        _held(db, _maya_slice(), "Oregon CIS data.xlsx", invitation_id=invitation.id)
        assert held.waiting_for_me(_public(user), db) == []


@pytest.mark.asyncio
async def test_declining_deletes_the_held_work():
    with _session() as db:
        user = _world(db, member=True)
        row = _held(db, _maya_slice(), "Oregon CIS data.xlsx", target_user_id=1)
        held.decline_mine(row.held_uuid, _public(user), db)
        db.refresh(row)
        assert row.status == "declined" and row.content is None
        assert db.exec(select(TimelineEntry)).all() == []


@pytest.mark.asyncio
async def test_someone_else_cant_see_or_take_it():
    with _session() as db:
        _world(db, member=True)
        row = _held(db, _maya_slice(), "Oregon CIS data.xlsx", target_user_id=1)
        other = _user(2, "sam")
        db.add(other)
        db.add(UserOrganization(user_id=2, org_id=1, role_id=4, creation_date="", update_date=""))
        db.commit()
        assert held.waiting_for_me(_public(other), db) == []
        with pytest.raises(Exception) as error:
            await held.accept_mine(row.held_uuid, _public(other), db)
        assert getattr(error.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_a_failed_bring_in_never_stops_them_joining_and_stays_waiting(monkeypatch):
    async def broken(*_args, **_kwargs):
        raise RuntimeError("storage down")

    monkeypatch.setattr(imports, "import_content", broken)
    with _session() as db:
        user = _world(db, member=True)
        invitation = _invitation(db)
        row = _held(db, _maya_slice(), "Oregon CIS data.xlsx", invitation_id=invitation.id)
        await held.after_accept(db, invitation, 1)
        db.refresh(row)
        assert row.status == "held" and row.content and row.target_user_id == 1
        invitation.status = "accepted"
        db.add(invitation)
        db.commit()
        assert [item["held_uuid"] for item in held.waiting_for_me(_public(user), db)] == [row.held_uuid]

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from src.db.media import MediaAsset
from src.db.organizations import Organization
from src.db.portfolio import Portfolio, PortfolioLink, PortfolioSection, PortfolioUpdate, PublishRequest, WorkItem, WorkItemBlock, WorkItemCreate, WorkItemUpdate
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import portfolio as service


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, Organization.__table__, Role.__table__, UserOrganization.__table__, MediaAsset.__table__, Portfolio.__table__, PortfolioSection.__table__, PortfolioLink.__table__, WorkItem.__table__, WorkItemBlock.__table__])
    return Session(engine)


def _user(user_id=1, username="maya"):
    return User(id=user_id, user_uuid=f"user_{user_id}", username=username, first_name="Maya", last_name="Rivera", email=f"{username}@example.com", profile={}, details={})


def _public(user):
    return PublicUser.model_validate(user)


def test_private_by_default_and_created_work_is_public_after_portfolio_publish():
    with _session() as db:
        user = _user()
        org = Organization(id=1, org_uuid="org_1", name="Youth Lab", slug="youth", email="org@example.com")
        role = Role(id=1, name="member")
        db.add(user); db.add(org); db.add(role); db.commit()
        db.add(UserOrganization(user_id=1, org_id=1, role_id=1, creation_date="", update_date="")); db.commit()

        shell = service.get_owner_shell(_public(user), db)
        assert shell["portfolio"]["visibility"] == "private"
        assert shell["portfolio"]["username"] == "maya"
        service.create_work(WorkItemCreate(title="My first build", summary="A prototype"), _public(user), db)
        portfolio = service._get_portfolio(db, 1)
        portfolio.previewed_at = service._now(); portfolio.privacy_confirmed_at = service._now(); portfolio.revision += 1
        db.add(portfolio); db.commit(); db.refresh(portfolio)
        service.publish_portfolio(PublishRequest(revision=portfolio.revision, privacy_confirmed=True), _public(user), db)

        public = service.get_public_shell(1, "maya", db)
        assert len(public["work"]) == 1
        assert public["work"][0]["status"] == "published"


def test_work_idempotency_revision_conflict_and_publish_flow():
    with _session() as db:
        user = _user()
        db.add(user); db.commit()
        actor = _public(user)
        first = service.create_work(WorkItemCreate(title="Community garden", idempotency_key="request-1"), actor, db)
        second = service.create_work(WorkItemCreate(title="Duplicate", idempotency_key="request-1"), actor, db)
        assert first["work_uuid"] == second["work_uuid"]

        updated = service.update_work(first["work_uuid"], WorkItemUpdate(revision=first["revision"], summary="We grew food together"), actor, db)
        assert updated["status"] == "published"
        with pytest.raises(HTTPException) as error:
            service.update_work(first["work_uuid"], WorkItemUpdate(revision=first["revision"], title="Stale edit"), actor, db)
        assert error.value.status_code == 409


def test_legacy_import_is_repeatable_and_preserves_profile_json():
    with _session() as db:
        original = {"featured": {"cards": [{"title": "Robot", "description": "Built in class"}]}}
        user = _user(); user.profile = original
        db.add(user); db.commit()
        actor = _public(user)
        first = service.execute_legacy_import(actor, db)
        second = service.execute_legacy_import(actor, db)
        db.refresh(user)
        assert first["imported"] == 1
        assert second["imported"] == 0
        assert user.profile == original


def test_portfolio_revision_conflict():
    with _session() as db:
        user = _user(); db.add(user); db.commit()
        actor = _public(user)
        shell = service.get_owner_shell(actor, db)
        service.update_portfolio(PortfolioUpdate(revision=shell["portfolio"]["revision"], headline="I make useful things"), actor, db)
        with pytest.raises(HTTPException) as error:
            service.update_portfolio(PortfolioUpdate(revision=shell["portfolio"]["revision"], headline="Stale"), actor, db)
        assert error.value.status_code == 409


def test_header_socials_can_be_added_edited_and_removed():
    with _session() as db:
        user = _user(); db.add(user); db.commit()
        actor = _public(user)
        shell = service.get_owner_shell(actor, db)
        updated = service.update_portfolio(PortfolioUpdate(revision=shell["portfolio"]["revision"], socials=[{"type": "instagram", "url": "instagram.com/maya"}]), actor, db)
        assert updated["portfolio"]["socials"] == [{"type": "instagram", "url": "https://instagram.com/maya"}]
        removed = service.update_portfolio(PortfolioUpdate(revision=updated["portfolio"]["revision"], socials=[]), actor, db)
        assert removed["portfolio"]["socials"] == []

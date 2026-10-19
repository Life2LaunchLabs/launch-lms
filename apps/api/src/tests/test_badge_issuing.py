"""Issuer selection for independent learners: creator and outside issuers share one model."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    IssuerLearnerRequestCreate,
    IssuerLearnerRequestDecision,
)
from src.db.user_organizations import UserOrganization
from src.services.learning_issuers import BadgeIssuingSettingsUpdate, IssuerAccessUpdate, issuer_options, validate_issuer_start
from src.services.learning_marketplace import (
    decide_learner_request,
    get_issuing_settings,
    list_eligible_issuers,
    request_learner_support,
    update_authorization,
    update_issuing_settings,
)
from src.tests.test_badge_marketplace import _approved_authorization, _create_tables, _request, _setup


def _world():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    return engine


def _options(session: Session, badge, learner) -> dict:
    return issuer_options(session, badge, learner.id)


def _start(session: Session, badge, learner, issuer_org_id: int):
    """What starting a badge plan checks (and records) about the chosen issuer."""
    return validate_issuer_start(session, badge, issuer_org_id, learner.id)


async def _access(session: Session, authorization_uuid: str, access: str, admin) -> None:
    await update_authorization(_request(), authorization_uuid, IssuerAccessUpdate(learner_access=access), admin, session)


async def test_creator_issues_openly_by_default_so_learners_just_start():
    with Session(_world()) as session:
        _, _, alice, _, carol, badge = _setup(session)
        options = _options(session, badge, carol)
        assert options["startable_issuer_org_id"] == 1
        assert [(item["org"]["id"], item["access"], item["is_default"]) for item in options["issuers"]] == [(1, "open", True)]
        _start(session, badge, carol, 1)
        assert (await get_issuing_settings(_request(), badge.badge_uuid, alice, session))["creator_access"] == "open"


async def test_creator_that_does_not_issue_leaves_learners_without_an_issuer():
    with Session(_world()) as session:
        _, _, alice, _, carol, badge = _setup(session)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(creator_access="none"), alice, session)
        options = _options(session, badge, carol)
        assert options["startable_issuer_org_id"] is None and options["issuers"] == []
        with pytest.raises(HTTPException) as exc:
            _start(session, badge, carol, 1)
        assert exc.value.status_code == 403


async def test_creator_on_requests_accepts_a_learner_who_then_starts():
    with Session(_world()) as session:
        _, _, alice, _, carol, badge = _setup(session)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(creator_access="request"), alice, session)
        assert _options(session, badge, carol)["startable_issuer_org_id"] is None
        with pytest.raises(HTTPException) as exc:
            _start(session, badge, carol, 1)
        assert exc.value.status_code == 409
        requested = await request_learner_support(_request(), IssuerLearnerRequestCreate(badge_uuid=badge.badge_uuid, issuer_org_id=1), carol, session)
        assert requested["status"] == BadgeIssuerLearnerLinkStatus.REQUESTED
        assert _options(session, badge, carol)["issuers"][0]["request_status"] == BadgeIssuerLearnerLinkStatus.REQUESTED
        await decide_learner_request(_request(), requested["link_uuid"], True, IssuerLearnerRequestDecision(), alice, session)
        assert _options(session, badge, carol)["startable_issuer_org_id"] == 1
        assert _start(session, badge, carol, 1).status == BadgeIssuerLearnerLinkStatus.ACCEPTED


async def test_open_outside_issuer_is_joined_on_start():
    with Session(_world()) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await _access(session, authorization.authorization_uuid, "open", bob)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(creator_access="none"), alice, session)
        assert _options(session, badge, carol)["startable_issuer_org_id"] == 2
        _start(session, badge, carol, 2)
        link = session.exec(select(BadgeIssuerLearnerLink).where(BadgeIssuerLearnerLink.user_id == carol.id)).one()
        assert link.status == BadgeIssuerLearnerLinkStatus.ACCEPTED
        assert session.exec(select(UserOrganization).where(UserOrganization.user_id == carol.id, UserOrganization.org_id == 2)).first()


async def test_default_issuer_prefers_one_the_learner_can_start_with():
    with Session(_world()) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await _access(session, authorization.authorization_uuid, "open", bob)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(default_issuer_org_id=2), alice, session)
        assert _options(session, badge, carol)["default_issuer_org_id"] == 2
        # A request-only default would make learners wait while the creator lets them start now.
        await _access(session, authorization.authorization_uuid, "request", bob)
        options = _options(session, badge, carol)
        assert options["default_issuer_org_id"] == 1
        assert {item["org"]["id"]: item["access"] for item in options["issuers"]} == {1: "open", 2: "request"}
        with pytest.raises(HTTPException) as exc:
            await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(default_issuer_org_id=99), alice, session)
        assert exc.value.status_code == 422


async def test_invite_only_issuer_is_listed_only_for_invited_learners():
    with Session(_world()) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge)
        assert [item["org"]["id"] for item in await list_eligible_issuers(_request(), badge.badge_uuid, carol, session)] == [1]
        with pytest.raises(HTTPException) as exc:
            await request_learner_support(_request(), IssuerLearnerRequestCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2), carol, session)
        assert exc.value.status_code == 422

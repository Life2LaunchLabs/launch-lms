"""Issuer selection for independent learners: creator and outside issuers share one model."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    IssuerLearnerRequestCreate,
    IssuerLearnerRequestDecision,
    LearningActivity,
    LearningBadgeVersion,
    LearningPath,
)
from src.db.user_organizations import UserOrganization
from src.services.guest_sessions import LearningActor
from src.services.learning import _manual_enrollment_state, start_or_resume_run
from src.services.learning_issuers import BadgeIssuingSettingsUpdate, IssuerAccessUpdate
from src.services.learning_marketplace import (
    decide_learner_request,
    get_issuing_settings,
    list_eligible_issuers,
    request_learner_support,
    update_authorization,
    update_issuing_settings,
)
from src.tests.test_badge_marketplace import NOW, _approved_authorization, _create_tables, _request, _setup


def _world():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    return engine


def _add_path(session: Session, badge) -> LearningBadgeVersion:
    session.add(LearningPath(id=1, path_uuid="path_issuing", badge_id=badge.id, version_id=badge.active_version_id, org_id=badge.org_id, title="Path", creation_date=NOW, update_date=NOW))
    session.add(LearningActivity(id=1, activity_uuid="learning_activity_issuing", path_id=1, badge_id=badge.id, version_id=badge.active_version_id, org_id=badge.org_id, title="Activity", published=True, creation_date=NOW, update_date=NOW))
    session.commit()
    return session.get(LearningBadgeVersion, badge.active_version_id)


def _enrollment(session: Session, badge, version, learner) -> dict:
    return _manual_enrollment_state(session, badge, version, LearningActor(user=learner), None)


async def _access(session: Session, authorization_uuid: str, access: str, admin) -> None:
    await update_authorization(_request(), authorization_uuid, IssuerAccessUpdate(learner_access=access), admin, session)


async def test_creator_issues_openly_by_default_so_learners_just_start():
    with Session(_world()) as session:
        _, _, alice, _, carol, badge = _setup(session)
        version = _add_path(session, badge)
        enrollment = _enrollment(session, badge, version, carol)
        assert enrollment["satisfied"] is True
        assert enrollment["accepted_issuer_org_id"] == 1
        assert [(item["org"]["id"], item["access"], item["is_default"]) for item in enrollment["issuers"]] == [(1, "open", True)]
        run = await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session)
        assert run.issuing_org_id is None
        assert (await get_issuing_settings(_request(), badge.badge_uuid, alice, session))["creator_access"] == "open"


async def test_creator_that_does_not_issue_leaves_learners_without_an_issuer():
    with Session(_world()) as session:
        _, _, alice, _, carol, badge = _setup(session)
        version = _add_path(session, badge)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(creator_access="none"), alice, session)
        enrollment = _enrollment(session, badge, version, carol)
        assert enrollment["satisfied"] is False and enrollment["issuers"] == []
        with pytest.raises(HTTPException) as exc:
            await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session)
        assert exc.value.status_code == 409


async def test_creator_on_requests_accepts_a_learner_who_then_starts():
    with Session(_world()) as session:
        _, _, alice, _, carol, badge = _setup(session)
        version = _add_path(session, badge)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(creator_access="request"), alice, session)
        assert _enrollment(session, badge, version, carol)["satisfied"] is False
        requested = await request_learner_support(_request(), IssuerLearnerRequestCreate(badge_uuid=badge.badge_uuid, issuer_org_id=1), carol, session)
        assert requested["status"] == BadgeIssuerLearnerLinkStatus.REQUESTED
        assert _enrollment(session, badge, version, carol)["issuers"][0]["request_status"] == BadgeIssuerLearnerLinkStatus.REQUESTED
        await decide_learner_request(_request(), requested["link_uuid"], True, IssuerLearnerRequestDecision(), alice, session)
        enrollment = _enrollment(session, badge, version, carol)
        assert enrollment["satisfied"] is True and enrollment["accepted_issuer_org_id"] == 1
        run = await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session, issuing_org_id=1)
        assert run.issuing_org_id is None


async def test_open_outside_issuer_is_joined_on_start():
    with Session(_world()) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        version = _add_path(session, badge)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await _access(session, authorization.authorization_uuid, "open", bob)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(creator_access="none"), alice, session)
        enrollment = _enrollment(session, badge, version, carol)
        assert enrollment["accepted_issuer_org_id"] == 2
        run = await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session)
        assert run.issuing_org_id == 2
        link = session.exec(select(BadgeIssuerLearnerLink).where(BadgeIssuerLearnerLink.user_id == carol.id)).one()
        assert link.status == BadgeIssuerLearnerLinkStatus.ACCEPTED
        assert session.exec(select(UserOrganization).where(UserOrganization.user_id == carol.id, UserOrganization.org_id == 2)).first()


async def test_default_issuer_prefers_one_the_learner_can_start_with():
    with Session(_world()) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        version = _add_path(session, badge)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await _access(session, authorization.authorization_uuid, "open", bob)
        await update_issuing_settings(_request(), badge.badge_uuid, BadgeIssuingSettingsUpdate(default_issuer_org_id=2), alice, session)
        assert _enrollment(session, badge, version, carol)["default_issuer_org_id"] == 2
        # A request-only default would make learners wait while the creator lets them start now.
        await _access(session, authorization.authorization_uuid, "request", bob)
        enrollment = _enrollment(session, badge, version, carol)
        assert enrollment["default_issuer_org_id"] == 1
        assert {item["org"]["id"]: item["access"] for item in enrollment["issuers"]} == {1: "open", 2: "request"}
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

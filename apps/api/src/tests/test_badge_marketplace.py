from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select
from starlette.requests import Request

from src.db.guest_sessions import GuestSession
from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    IssuerAuthorizationInvite,
    IssuerAuthorizationRequest,
    IssuerAuthorizationUpdate,
    IssuerLearnerLinkCreate,
    LearningActivity,
    LearningActivityRun,
    LearningAwardCreate,
    LearningBadge,
    LearningBadgeAward,
    LearningPage,
    LearningPageProgress,
    LearningPath,
    LearningResponseAttempt,
    LearningResponseGrade,
    LearningRun,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest
from src.db.portfolio import Portfolio
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.guest_sessions import LearningActor
from src.services.learning import (
    build_ob3_credential,
    confer_award,
    grade_learning_response,
    list_learning_responses,
    start_or_resume_run,
)
from src.services.learning_marketplace import (
    browse_marketplace_badges,
    create_learner_link,
    decide_authorization,
    invite_issuer,
    list_eligible_issuers,
    request_authorization,
    transition_queued_authorizations,
    update_authorization,
)


def _request() -> Request:
    return Request({
        "type": "http",
        "headers": [(b"origin", b"http://localhost:3000")],
        "scheme": "http",
        "server": ("localhost", 8000),
        "path": "/",
        "query_string": b"",
    })


def _create_tables(engine) -> None:
    for model in (
        Organization,
        OrganizationConfig,
        PlanRequest,
        User,
        UserOrganization,
        Role,
        GuestSession,
        Portfolio,
        LearningBadge,
        LearningPath,
        LearningActivity,
        LearningPage,
        LearningRun,
        LearningActivityRun,
        LearningPageProgress,
        LearningResponseAttempt,
        LearningBadgeAward,
        BadgeIssuerAuthorization,
        BadgeIssuerLearnerLink,
    ):
        model.__table__.create(engine)


NOW = "2026-01-01T00:00:00+00:00"


def _create_org(session: Session, *, org_id: int, slug: str, plan: str = "enterprise") -> Organization:
    org = Organization(
        id=org_id,
        org_uuid=f"org_{org_id}",
        name=slug.capitalize(),
        slug=slug,
        email=f"{slug}@example.com",
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(org)
    session.add(
        OrganizationConfig(
            org_id=org_id,
            config={"config_version": "2.0", "plan": plan},
            creation_date=NOW,
            update_date=NOW,
        )
    )
    session.commit()
    return org


def _create_user(session: Session, *, user_id: int, username: str, org_id: int | None = None, role_id: int = 1) -> PublicUser:
    user = User(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=username,
        email=f"{username}@example.com",
        first_name=username.capitalize(),
        last_name="Test",
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(user)
    if org_id is not None:
        session.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date=NOW, update_date=NOW))
    session.commit()
    return PublicUser(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=username,
        email=f"{username}@example.com",
        first_name=username.capitalize(),
        last_name="Test",
    )


def _create_badge(session: Session, *, badge_id: int, org_id: int, listed: bool = True) -> LearningBadge:
    badge = LearningBadge(
        id=badge_id,
        org_id=org_id,
        badge_uuid=f"badge_{badge_id}",
        name=f"Badge {badge_id}",
        status="published",
        public=True,
        marketplace_listed=listed,
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(badge)
    session.commit()
    return badge


def _setup(session: Session):
    """Two orgs: creator (1) with admin alice, issuer (2) with admin bob; learner carol (no org)."""
    creator_org = _create_org(session, org_id=1, slug="creator")
    issuer_org = _create_org(session, org_id=2, slug="issuer")
    alice = _create_user(session, user_id=1, username="alice", org_id=1)
    bob = _create_user(session, user_id=2, username="bob", org_id=2)
    carol = _create_user(session, user_id=3, username="carol")
    badge = _create_badge(session, badge_id=1, org_id=1)
    return creator_org, issuer_org, alice, bob, carol, badge


async def _approved_authorization(session: Session, alice: PublicUser, bob: PublicUser, badge: LearningBadge, open_to_all: bool = False):
    await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)
    authorization = session.exec(select(BadgeIssuerAuthorization)).first()
    await decide_authorization(_request(), authorization.authorization_uuid, True, alice, session)
    if open_to_all:
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAuthorizationUpdate(open_to_all=True), bob, session)
    session.refresh(authorization)
    return authorization


async def test_request_and_approve_authorization():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, _, badge = _setup(session)

        result = await request_authorization(
            _request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2, message="please"), bob, session
        )
        assert result.status == BadgeIssuerAuthorizationStatus.REQUESTED
        assert result.creator_org_id == 1

        approved = await decide_authorization(_request(), result.authorization_uuid, True, alice, session)
        assert approved.status == BadgeIssuerAuthorizationStatus.APPROVED
        assert approved.decided_by_user_id == alice.id


async def test_issuer_cannot_decide_own_request():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, _, bob, _, badge = _setup(session)
        result = await request_authorization(
            _request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session
        )
        with pytest.raises(HTTPException) as exc:
            await decide_authorization(_request(), result.authorization_uuid, True, bob, session)
        assert exc.value.status_code == 403


async def test_unlisted_badge_cannot_be_requested():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        badge = _create_badge(session, badge_id=1, org_id=1, listed=False)
        with pytest.raises(HTTPException) as exc:
            await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)
        assert exc.value.status_code == 422


async def test_badge_issuing_requires_package():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        badge = _create_badge(session, badge_id=1, org_id=1)
        with pytest.raises(HTTPException) as exc:
            await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)
        assert exc.value.status_code == 403

        # full plan + badge_issuing package unlocks it
        config = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 2)).first()
        config.config = {"config_version": "2.0", "plan": "full", "packages": ["badge_issuing"]}
        session.add(config)
        session.commit()
        result = await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)
        assert result.status == BadgeIssuerAuthorizationStatus.REQUESTED


async def test_authorization_request_queues_while_issuing_package_is_pending():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        badge = _create_badge(session, badge_id=1, org_id=1)
        session.add(PlanRequest(
            org_id=2,
            request_uuid="plan_request_1",
            request_type="package_add",
            requested_value="badge_issuing",
            status="pending",
            creation_date=NOW,
            update_date=NOW,
        ))
        session.commit()

        result = await request_authorization(
            _request(),
            IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2),
            bob,
            session,
        )
        assert result.status == BadgeIssuerAuthorizationStatus.QUEUED
        items = await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2)
        assert items[0]["issuing_access"] == "pending"

        config = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 2)).one()
        config.config = {"config_version": "2.0", "plan": "full", "packages": ["badge_issuing"]}
        session.add(config)
        assert transition_queued_authorizations(session, 2) == 1
        session.commit()

        authorization = session.exec(select(BadgeIssuerAuthorization)).one()
        assert authorization.status == BadgeIssuerAuthorizationStatus.REQUESTED


async def test_marketplace_marks_requests_unavailable_without_package_or_pending_request():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        _create_badge(session, badge_id=1, org_id=1)

        items = await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2)
        assert items[0]["issuing_access"] == "unavailable"


async def test_creator_does_not_see_queued_authorization():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        alice = _create_user(session, user_id=1, username="alice", org_id=1)
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        badge = _create_badge(session, badge_id=1, org_id=1)
        session.add(PlanRequest(
            org_id=2,
            request_uuid="plan_request_1",
            request_type="package_add",
            requested_value="badge_issuing",
            status="pending",
            creation_date=NOW,
            update_date=NOW,
        ))
        session.commit()
        await request_authorization(
            _request(),
            IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2),
            bob,
            session,
        )

        from src.services.learning_marketplace import list_authorizations
        creator_items = await list_authorizations(_request(), 1, "creator", alice, session)
        issuer_items = await list_authorizations(_request(), 2, "issuer", bob, session)
        assert creator_items == []
        assert len(issuer_items) == 1
        assert issuer_items[0].status == BadgeIssuerAuthorizationStatus.QUEUED


async def test_invite_flow():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, _, badge = _setup(session)
        invited = await invite_issuer(_request(), IssuerAuthorizationInvite(badge_uuid=badge.badge_uuid, issuer_org_slug="issuer"), alice, session)
        assert invited.status == BadgeIssuerAuthorizationStatus.INVITED
        # Issuer requesting while invited counts as acceptance
        accepted = await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)
        assert accepted.status == BadgeIssuerAuthorizationStatus.APPROVED


async def test_browse_marketplace_includes_authorization_status():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, _, badge = _setup(session)
        _create_badge(session, badge_id=2, org_id=1, listed=False)
        await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)

        items = await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2)
        assert len(items) == 1  # unlisted badge excluded
        assert items[0]["authorization"]["status"] == "requested"


async def test_eligible_issuers_open_to_all_and_links():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        authorization = await _approved_authorization(session, alice, bob, badge)

        # Not open to all, no link: only creator eligible
        issuers = await list_eligible_issuers(_request(), badge.badge_uuid, carol, session)
        assert [i["org"]["slug"] for i in issuers] == ["creator"]

        # Link carol → issuer becomes eligible for her
        await create_learner_link(_request(), IssuerLearnerLinkCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2, user_id=carol.id), bob, session)
        issuers = await list_eligible_issuers(_request(), badge.badge_uuid, carol, session)
        assert [i["org"]["slug"] for i in issuers] == ["creator", "issuer"]
        assert issuers[1]["via_link"] is True

        # Open to all: eligible for everyone
        dave = _create_user(session, user_id=4, username="dave")
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAuthorizationUpdate(open_to_all=True), bob, session)
        issuers = await list_eligible_issuers(_request(), badge.badge_uuid, dave, session)
        assert [i["org"]["slug"] for i in issuers] == ["creator", "issuer"]


async def test_run_start_with_issuer_selection():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)

        # Unauthorized issuer org rejected
        with pytest.raises(HTTPException) as exc:
            await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session, issuing_org_id=2)
        assert exc.value.status_code == 403

        await _approved_authorization(session, alice, bob, badge)

        # Approved but not open, no link → still rejected
        with pytest.raises(HTTPException) as exc:
            await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session, issuing_org_id=2)
        assert exc.value.status_code == 403

        await create_learner_link(_request(), IssuerLearnerLinkCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2, user_id=carol.id), bob, session)
        run = await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=carol), session, issuing_org_id=2)
        assert run.issuing_org_id == 2

        # Selecting the creator org is equivalent to no issuer
        dave = _create_user(session, user_id=4, username="dave")
        run = await start_or_resume_run(_request(), badge.badge_uuid, LearningActor(user=dave), session, issuing_org_id=1)
        assert run.issuing_org_id is None


def _create_gradable_attempt(session: Session, *, badge: LearningBadge, user: PublicUser, issuing_org_id: int | None) -> LearningResponseAttempt:
    path = LearningPath(id=1, path_uuid="path_1", badge_id=badge.id, org_id=badge.org_id, creation_date=NOW, update_date=NOW)
    activity = LearningActivity(
        id=1, activity_uuid="learning_activity_1", path_id=1, badge_id=badge.id, org_id=badge.org_id,
        title="Activity", order=1, required=True, published=True, settings={}, creation_date=NOW, update_date=NOW,
    )
    page = LearningPage(
        id=1, page_uuid="learning_page_1", activity_id=1, badge_id=badge.id, org_id=badge.org_id,
        page_type="standard", title="Question", order=1, required=True,
        content={}, design={}, scoring={"points": 5}, completion={}, creation_date=NOW, update_date=NOW,
    )
    run = LearningRun(
        id=1, run_uuid="learning_run_1", badge_id=badge.id, path_id=1, org_id=badge.org_id,
        issuing_org_id=issuing_org_id, user_id=user.id, started_at=datetime.utcnow(),
        creation_date=NOW, update_date=NOW,
    )
    attempt = LearningResponseAttempt(
        id=1, attempt_uuid="learning_attempt_1", run_id=1, page_id=1, user_id=user.id,
        answer={"text": "my essay"}, submitted_at=datetime.utcnow(),
        result={"grading_status": "pending", "max_score": 5},
    )
    for item in (path, activity, page, run, attempt):
        session.add(item)
    session.commit()
    return attempt


async def test_grading_routed_to_issuing_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge, open_to_all=True)
        attempt = _create_gradable_attempt(session, badge=badge, user=carol, issuing_org_id=2)

        # Creator org admin can no longer grade a run issued under the issuer org
        with pytest.raises(HTTPException) as exc:
            await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=4, feedback="ok"), alice, session)
        assert exc.value.status_code == 403

        graded = await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=4, feedback="ok"), bob, session)
        assert graded["result"]["grading_status"] == "graded"
        assert graded["result"]["graded_by_user_id"] == bob.id


async def test_grading_defaults_to_creator_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        attempt = _create_gradable_attempt(session, badge=badge, user=carol, issuing_org_id=None)

        with pytest.raises(HTTPException) as exc:
            await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=4), bob, session)
        assert exc.value.status_code == 403

        graded = await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=5), alice, session)
        assert graded["result"]["grading_status"] == "graded"


async def test_response_listing_scoped_by_issuing_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge, open_to_all=True)
        _create_gradable_attempt(session, badge=badge, user=carol, issuing_org_id=2)

        issuer_view = await list_learning_responses(_request(), bob, session, org_id=2)
        assert len(issuer_view) == 1
        creator_view = await list_learning_responses(_request(), alice, session, org_id=1)
        assert len(creator_view) == 0


async def test_confer_award_as_issuer():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)

        # No authorization yet → forbidden
        with pytest.raises(HTTPException) as exc:
            await confer_award(_request(), LearningAwardCreate(badge_uuid=badge.badge_uuid, user_id=carol.id, issuing_org_id=2), bob, session)
        assert exc.value.status_code == 403

        await _approved_authorization(session, alice, bob, badge)
        result = await confer_award(_request(), LearningAwardCreate(badge_uuid=badge.badge_uuid, user_id=carol.id, issuing_org_id=2), bob, session)
        assert result["award"]["issuing_org_id"] == 2
        assert result["issuing_org"]["slug"] == "issuer"
        # The visible issuer profile is the issuing org, not the creator
        assert "issuer" in result["open_badges"]["credential"]["issuer"]["id"] or result["open_badges"]["credential"]["issuer"]["name"] == "Issuer"


async def test_ob3_credential_creator_vs_issuer():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        creator_org, issuer_org, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge)
        result = await confer_award(_request(), LearningAwardCreate(badge_uuid=badge.badge_uuid, user_id=carol.id, issuing_org_id=2), bob, session)
        credential = result["open_badges"]["credential"]

        assert credential["type"] == ["VerifiableCredential", "OpenBadgeCredential"]
        assert "https://www.w3.org/ns/credentials/v2" in credential["@context"]
        # Authoritative issuer is the issuing org
        assert credential["issuer"]["name"] == issuer_org.name
        assert credential["issuer"]["type"] == ["Profile"]
        # Badge designer is the achievement creator
        achievement = credential["credentialSubject"]["achievement"]
        assert achievement["creator"]["name"] == creator_org.name
        assert achievement["type"] == ["Achievement"]
        assert credential["credentialSubject"]["identifier"][0]["identityType"] == "emailAddress"
        assert credential["validFrom"]


def test_build_ob3_credential_unit():
    creator = Organization(
        id=1, org_uuid="org_creator", name="Creator Org", slug="creator", email="c@example.com",
        socials={}, links={}, scripts={}, previews={}, explore=False,
        creation_date=NOW, update_date=NOW,
    )
    issuer = Organization(
        id=2, org_uuid="org_issuer", name="Issuer Org", slug="issuer", email="i@example.com",
        socials={}, links={}, scripts={}, previews={}, explore=False,
        creation_date=NOW, update_date=NOW,
    )
    badge = LearningBadge(id=1, org_id=1, badge_uuid="badge_1", name="Badge", status="published", creation_date=NOW, update_date=NOW)
    award = LearningBadgeAward(
        id=1, award_uuid="award_abcdef123456", badge_id=1, org_id=1, issuing_org_id=2, user_id=3,
        issued_at=datetime(2026, 1, 1), creation_date=NOW, update_date=NOW,
    )
    user = User(id=3, user_uuid="user_3", username="carol", email="carol@example.com", creation_date=NOW, update_date=NOW)

    credential = build_ob3_credential(_request(), issuer, None, creator, None, badge, award, user)
    assert credential["issuer"]["name"] == "Issuer Org"
    assert credential["credentialSubject"]["achievement"]["creator"]["name"] == "Creator Org"
    assert credential["id"].endswith("/badge-awards/credential/award_abcdef123456")
    assert credential["validFrom"] == "2026-01-01T00:00:00Z"

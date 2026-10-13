from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select
from src.db.learning import (
    BadgeCollection,
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    IssuerAuthorizationInvite,
    IssuerAuthorizationRequest,
    IssuerLearnerLinkCreate,
    IssuerLearnerRequestCreate,
    IssuerLearnerRequestDecision,
    LearningActivity,
    LearningAwardCreate,
    LearningBadge,
    LearningBadgeCreate,
    LearningBadgeAward,
    LearningBadgeVersion,
    LearningPage,
    LearningPageProgress,
    LearningPageType,
    LearningResponseAttempt,
    LearningResponseGrade,
    LearningResponseSubmit,
    LearningRun,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest
from src.db.portfolio import Portfolio
from src.db.badge_routes import BadgePlanStart, BadgeRoute, BadgeRouteInput, BadgeRouteOffer, BadgeRoutesUpdate
from src.db.planning import Plan, PlanActivity, PlanCollaborator, PlanInvitation, PlanObjective, PlanObjectiveProgress, PlanPhase, PlanRole
from src.db.programs import Objective, ObjectiveCreate, ObjectiveKind, Program, ProgramAssignment, ProgramObjective, ProgramCreate, ProgramParticipant, ProgramPhase, ProgramTemplateVersion, FrozenActivity
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.badge_routes import set_routes, start_badge_plan
from src.services.learning import (
    build_ob3_credential,
    confer_award,
    create_badge,
    grade_learning_response,
    list_collections,
    list_learning_responses,
    runtime,
)
from src.services.learning_page_convert import normalize_question_settings, question_block
from src.services.learning_issuers import IssuerAccessUpdate
from src.services.learning_marketplace import (
    browse_marketplace_badges,
    create_learner_link,
    decide_authorization,
    decide_learner_request,
    invite_issuer,
    issuer_badge_metrics,
    list_eligible_issuers,
    request_authorization,
    request_learner_support,
    update_authorization,
)
from src.services.plan_activities import start_objective_activity
from src.services.programs import add_program_objective, create_program
from starlette.requests import Request


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
        Portfolio,
        BadgeCollection,
        LearningBadge,
        LearningBadgeVersion,
        BadgeRoute,
        BadgeRouteOffer,
        LearningActivity,
        LearningPage,
        LearningRun,
        LearningPageProgress,
        LearningResponseAttempt,
        LearningBadgeAward,
        BadgeIssuerAuthorization,
        BadgeIssuerLearnerLink,
        Program,
        Objective,
        ProgramPhase,
        ProgramObjective,
        ProgramAssignment,
        ProgramTemplateVersion,
        FrozenActivity,
        ProgramParticipant,
        Plan,
        PlanRole,
        PlanCollaborator,
        PlanPhase,
        PlanObjective,
        PlanObjectiveProgress,
        PlanInvitation,
        PlanActivity,
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
            config={
                "config_version": "2.0",
                "plan": plan,
                "packages": ["badge_creation"] if plan != "free" else [],
            },
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
    session.flush()
    version = LearningBadgeVersion(
        id=badge_id,
        version_uuid=f"badge_version_{badge_id}",
        badge_id=badge_id,
        org_id=org_id,
        state="published",
        semantic_version="1.0.0",
        title=badge.name,
        definition={},
        creation_date=NOW,
        update_date=NOW,
    )
    session.add(version)
    session.flush()
    badge.active_version_id = version.id
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
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAccessUpdate(open_to_all=True), bob, session)
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


async def test_badge_issuing_is_available_on_free_plan():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        badge = _create_badge(session, badge_id=1, org_id=1)
        result = await request_authorization(_request(), IssuerAuthorizationRequest(badge_uuid=badge.badge_uuid, issuer_org_id=2), bob, session)
        assert result.status == BadgeIssuerAuthorizationStatus.REQUESTED


async def test_badge_creation_requires_badge_publishing_package():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator", plan="free")
        alice = _create_user(session, user_id=1, username="alice", org_id=1)

        with pytest.raises(HTTPException) as exc:
            await create_badge(_request(), LearningBadgeCreate(org_id=1, name="Blocked"), alice, session)
        assert exc.value.status_code == 403
        assert "Badge Publishing" in str(exc.value.detail)

        config = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).one()
        config.config = {"config_version": "2.0", "plan": "full", "packages": ["badge_creation"]}
        session.add(config)
        session.commit()

        badge = await create_badge(_request(), LearningBadgeCreate(org_id=1, name="Allowed"), alice, session)
        assert badge.name == "Allowed"


async def test_legacy_pending_issuing_package_does_not_queue_free_request():
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
        assert result.status == BadgeIssuerAuthorizationStatus.REQUESTED
        items = await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2)
        assert items[0]["issuing_access"] == "active"


async def test_marketplace_marks_free_plan_issuing_access_active():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        _create_badge(session, badge_id=1, org_id=1)

        items = await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2)
        assert items[0]["issuing_access"] == "active"


async def test_creator_sees_free_plan_authorization_request():
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
        assert len(creator_items) == 1
        assert len(issuer_items) == 1
        assert creator_items[0].status == BadgeIssuerAuthorizationStatus.REQUESTED
        assert issuer_items[0].status == BadgeIssuerAuthorizationStatus.REQUESTED


async def test_creator_view_promotes_legacy_free_plan_queued_request():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", plan="free")
        alice = _create_user(session, user_id=1, username="alice", org_id=1)
        badge = _create_badge(session, badge_id=1, org_id=1)
        session.add(BadgeIssuerAuthorization(
            authorization_uuid="issuer_auth_legacy_queued",
            badge_id=badge.id or 0,
            creator_org_id=1,
            issuer_org_id=2,
            status=BadgeIssuerAuthorizationStatus.QUEUED,
            creation_date=NOW,
            update_date=NOW,
        ))
        session.commit()

        from src.services.learning_marketplace import list_authorizations
        creator_items = await list_authorizations(_request(), 1, "creator", alice, session)

        assert len(creator_items) == 1
        assert creator_items[0].status == BadgeIssuerAuthorizationStatus.REQUESTED


async def test_issuer_badge_metrics_are_scoped_to_issuer_and_include_programs():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge, open_to_all=True)
        program = Program(id=1, program_uuid="program_1", org_id=2, name="Issuer Program", creation_date=NOW, update_date=NOW)
        objective = Objective(
            id=1,
            objective_uuid="objective_1",
            org_id=2,
            title="Earn the badge",
            kind=ObjectiveKind.BADGE,
            badge_id=badge.id,
            creation_date=NOW,
            update_date=NOW,
        )
        session.add(program)
        session.add(objective)
        session.add(ProgramObjective(id=1, program_id=1, objective_id=1, creation_date=NOW, update_date=NOW))
        session.add(ProgramAssignment(
            id=1,
            assignment_uuid="assignment_1",
            org_id=2,
            program_id=1,
            user_id=carol.id,
            creation_date=NOW,
            update_date=NOW,
        ))
        session.add(LearningBadgeAward(
            award_uuid="award_issuer_1",
            badge_id=badge.id or 0,
            org_id=1,
            issuing_org_id=2,
            user_id=carol.id,
            issued_at=datetime(2026, 1, 2),
            creation_date=NOW,
            update_date=NOW,
        ))
        session.commit()

        metrics = await issuer_badge_metrics(_request(), 2, badge.badge_uuid, bob, session)

        assert metrics["issued_count"] == 1
        assert metrics["authorization"]["open_to_all"] is True
        assert metrics["programs"] == [{
            "program_uuid": "program_1",
            "name": "Issuer Program",
            "status": "active",
            "assignment_count": 1,
        }]


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


async def test_authorized_badges_appear_in_issuer_collections_without_edit_access():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        creator_org, _, alice, bob, _, badge = _setup(session)
        collection = BadgeCollection(
            id=1,
            org_id=creator_org.id,
            collection_uuid="badge_collection_creator",
            name="Creator collection",
            public=False,
            creation_date=NOW,
            update_date=NOW,
        )
        session.add(collection)
        badge.collection_id = collection.id
        badge.public = False
        session.add(badge)
        session.commit()

        await _approved_authorization(session, alice, bob, badge)

        collections = await list_collections(_request(), 2, bob, session, admin=True)
        assert len(collections) == 1
        assert collections[0].access_type == "authorized"
        assert collections[0].can_edit is False
        assert collections[0].creator_org["slug"] == "creator"
        assert [item.badge_uuid for item in collections[0].badges] == [badge.badge_uuid]
        assert collections[0].badges[0].can_edit is False



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
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAccessUpdate(open_to_all=True), bob, session)
        issuers = await list_eligible_issuers(_request(), badge.badge_uuid, dave, session)
        assert [i["org"]["slug"] for i in issuers] == ["creator", "issuer"]


async def test_open_issuer_can_accept_learner_request_and_connect_user():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge, open_to_all=True)

        requested = await request_learner_support(
            _request(),
            IssuerLearnerRequestCreate(
                badge_uuid=badge.badge_uuid,
                issuer_org_id=2,
                message="I would like support",
            ),
            carol,
            session,
        )
        assert requested["status"] == BadgeIssuerLearnerLinkStatus.REQUESTED

        accepted = await decide_learner_request(
            _request(),
            requested["link_uuid"],
            True,
            IssuerLearnerRequestDecision(),
            bob,
            session,
        )
        assert accepted["status"] == BadgeIssuerLearnerLinkStatus.ACCEPTED
        assert accepted["staff_user_ids"] == [bob.id]
        membership = session.exec(
            select(UserOrganization).where(
                UserOrganization.user_id == carol.id,
                UserOrganization.org_id == 2,
            )
        ).first()
        assert membership is not None


async def test_demo_learner_request_is_accepted_without_issuer_staff():
    from src.services.demo.context import DemoContext, current_demo

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        dave = _create_user(session, user_id=4, username="dave")
        await _approved_authorization(session, alice, bob, badge, open_to_all=True)
        request = IssuerLearnerRequestCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2)
        # Outside a demo the request waits for issuer staff.
        pending = await request_learner_support(_request(), request, carol, session)
        assert pending["status"] == BadgeIssuerLearnerLinkStatus.REQUESTED

        token = current_demo.set(DemoContext("session", "namespace", "visitor"))
        try:
            accepted = await request_learner_support(_request(), request, dave, session)
        finally:
            current_demo.reset(token)
        assert accepted["status"] == BadgeIssuerLearnerLinkStatus.ACCEPTED
        assert accepted["active"] is True
        assert session.exec(
            select(UserOrganization).where(
                UserOrganization.user_id == dave.id,
                UserOrganization.org_id == 2,
            )
        ).first() is not None


async def test_badge_plan_start_with_issuer_selection():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        _add_activity_route(session, alice, badge)

        # Unauthorized issuer org rejected
        with pytest.raises(HTTPException) as exc:
            start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart(issuer_org_id=2))
        assert exc.value.status_code == 403

        await _approved_authorization(session, alice, bob, badge)

        # Approved but invite-only, no link: still rejected
        with pytest.raises(HTTPException) as exc:
            start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart(issuer_org_id=2))
        assert exc.value.status_code == 403

        await create_learner_link(_request(), IssuerLearnerLinkCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2, user_id=carol.id), bob, session)
        plan = start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart(issuer_org_id=2))
        assert plan["source_organization"]["name"] == "Issuer"
        assert plan["source_badge"]["badge_uuid"] == badge.badge_uuid

        # Selecting the creator org (or none) starts with the creator
        dave = _create_user(session, user_id=4, username="dave")
        plan = start_badge_plan(session, dave, badge.badge_uuid, BadgePlanStart(issuer_org_id=1))
        assert plan["source_organization"]["name"] == "Creator"


ESSAY_PAGE_UUID = "learning_page_essay"


def _add_activity_route(session: Session, admin: PublicUser, badge: LearningBadge) -> dict:
    """A plan template with one activity step (a manually graded essay) as the badge's only route."""
    program = create_program(session, admin, ProgramCreate(org_id=badge.org_id, name="Write it up"))
    program = add_program_objective(session, admin, badge.org_id, program["program_uuid"], ObjectiveCreate(title="Reflect", kind=ObjectiveKind.ACTIVITY))
    activity = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == program["objectives"][0]["activity"]["activity_uuid"])).one()
    content = normalize_question_settings(
        {"version": 2, "blocks": [question_block("text_input", {"inputs": [{"id": "reflection", "label": "Reflection"}]}, block_id="reflection")]},
        {"mode": "manual", "points": 5},
        {"inputs": {"reflection": {"required": True, "min_words": 1}}},
    )
    session.add(LearningPage(
        page_uuid=ESSAY_PAGE_UUID, activity_id=activity.id, org_id=badge.org_id, page_type=LearningPageType.STANDARD,
        title="Question", order=1, required=True, content=content, creation_date=NOW, update_date=NOW,
    ))
    session.commit()
    set_routes(session, admin, badge.badge_uuid, BadgeRoutesUpdate(routes=[BadgeRouteInput(program_uuid=program["program_uuid"])]))
    return program


async def _submit_essay(session: Session, learner: PublicUser, plan: dict) -> LearningResponseAttempt:
    """The learner plays the plan's activity step and submits an essay that waits for a grade."""
    started = start_objective_activity(session, learner, plan["slug"], plan["objectives"][0]["objective_uuid"])
    run = started["run"]
    # The plan plays the published version's frozen copy of the essay page.
    page_uuid = next(page["page_uuid"] for page in started["activity"]["pages"] if page["title"] == "Question")
    await runtime.submit_response(
        None,
        LearningResponseSubmit(run_uuid=run["run_uuid"], page_uuid=page_uuid, answer={"inputs": {"reflection": {"text": "my essay"}}}),
        learner,
        session,
    )
    attempt = session.exec(select(LearningResponseAttempt).where(LearningResponseAttempt.user_id == learner.id)).one()
    assert attempt.result["grading_status"] == "pending"
    return attempt


def _step_status(session: Session, plan: dict) -> str:
    plan_id = session.exec(select(Plan.id).where(Plan.plan_uuid == plan["plan_uuid"])).one()
    progress = session.exec(
        select(PlanObjectiveProgress).join(PlanObjective, PlanObjective.id == PlanObjectiveProgress.plan_objective_id).where(PlanObjective.plan_id == plan_id)
    ).one()
    return getattr(progress.status, "value", progress.status)


async def test_grading_routed_to_issuing_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        _add_activity_route(session, alice, badge)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAccessUpdate(learner_access="open"), bob, session)
        plan = start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart(issuer_org_id=2))
        attempt = await _submit_essay(session, carol, plan)
        assert _step_status(session, plan) == "submitted"

        # Creator org admin cannot grade a plan offered by the issuer org
        with pytest.raises(HTTPException) as exc:
            await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=4, feedback="ok"), alice, session)
        assert exc.value.status_code == 403

        graded = await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=4, feedback="ok"), bob, session)
        assert graded["result"]["grading_status"] == "graded"
        assert graded["result"]["graded_by_user_id"] == bob.id
        assert graded["result"]["graded_by"]["org_name"] == "Issuer"
        assert "award" not in graded
        with pytest.raises(HTTPException) as exc:
            await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=1), bob, session)
        assert exc.value.status_code == 409

        # Grading finishes the step, which finishes the plan and awards the badge under the issuer
        assert _step_status(session, plan) == "completed"
        award = session.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == carol.id)).one()
        assert award.issuing_org_id == 2 and award.source == "plan_completion"


async def test_plan_reviewer_can_grade_without_being_an_org_admin():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        dave = _create_user(session, user_id=4, username="dave", org_id=2, role_id=4)
        erin = _create_user(session, user_id=5, username="erin", org_id=2, role_id=4)
        _add_activity_route(session, alice, badge)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAccessUpdate(learner_access="request"), bob, session)
        requested = await request_learner_support(_request(), IssuerLearnerRequestCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2), carol, session)
        await decide_learner_request(_request(), requested["link_uuid"], True, IssuerLearnerRequestDecision(staff_user_ids=[dave.id]), bob, session)
        plan = start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart(issuer_org_id=2))
        attempt = await _submit_essay(session, carol, plan)

        # Staff of the issuer org who are not reviewers on this plan cannot grade it
        with pytest.raises(HTTPException) as exc:
            await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=5), erin, session)
        assert exc.value.status_code == 403

        graded = await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=5), dave, session)
        assert graded["result"]["graded_by"] == {"user_id": dave.id, "staff_name": "Dave Test", "org_id": 2, "org_name": "Issuer"}


async def test_grading_preserves_activity_and_question_feedback():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, _, carol, badge = _setup(session)
        _add_activity_route(session, alice, badge)
        plan = start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart())
        attempt = await _submit_essay(session, carol, plan)
        assert attempt.result["questions"]["reflection"]["grading_status"] == "pending"

        graded = await grade_learning_response(
            _request(),
            attempt.attempt_uuid,
            LearningResponseGrade(
                score=4,
                feedback="Strong activity overall.",
                question_scores={"reflection": 4},
                question_feedback={"reflection": "Add one concrete example."},
            ),
            alice,
            session,
        )

        assert graded["score"] == 4
        assert graded["result"]["feedback"] == "Strong activity overall."
        assert graded["result"]["questions"]["reflection"]["score"] == 4
        assert graded["result"]["questions"]["reflection"]["feedback"] == "Add one concrete example."


async def test_grading_defaults_to_creator_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        _add_activity_route(session, alice, badge)
        plan = start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart())
        attempt = await _submit_essay(session, carol, plan)

        with pytest.raises(HTTPException) as exc:
            await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=4), bob, session)
        assert exc.value.status_code == 403

        graded = await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=5), alice, session)
        assert graded["result"]["grading_status"] == "graded"
        assert graded["result"]["graded_by_org_id"] == 1
        award = session.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == carol.id)).one()
        assert award.issuing_org_id is None


async def test_response_listing_scoped_by_issuing_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        _add_activity_route(session, alice, badge)
        authorization = await _approved_authorization(session, alice, bob, badge)
        await update_authorization(_request(), authorization.authorization_uuid, IssuerAccessUpdate(learner_access="open"), bob, session)
        plan = start_badge_plan(session, carol, badge.badge_uuid, BadgePlanStart(issuer_org_id=2))
        attempt = await _submit_essay(session, carol, plan)

        issuer_view = await list_learning_responses(_request(), bob, session, org_id=2)
        assert [item["attempt_uuid"] for item in issuer_view] == [attempt.attempt_uuid]
        assert issuer_view[0]["badge"]["badge_uuid"] == badge.badge_uuid
        assert issuer_view[0]["plan"]["plan_uuid"] == plan["plan_uuid"]
        assert issuer_view[0]["user"]["username"] == "carol"
        assert len(await list_learning_responses(_request(), bob, session, org_id=2, badge_uuid=badge.badge_uuid)) == 1
        creator_view = await list_learning_responses(_request(), alice, session, org_id=1)
        assert creator_view == []
        with pytest.raises(HTTPException) as exc:
            await list_learning_responses(_request(), alice, session, org_id=2)
        assert exc.value.status_code == 403

        await grade_learning_response(_request(), attempt.attempt_uuid, LearningResponseGrade(score=5), bob, session)
        assert await list_learning_responses(_request(), bob, session, org_id=2) == []
        assert len(await list_learning_responses(_request(), bob, session, org_id=2, grading_status="graded")) == 1


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

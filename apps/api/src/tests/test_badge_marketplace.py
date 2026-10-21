from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select
from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goals import Goal, GoalAssignment, GoalStage, GoalStep, GoalStory, GoalTemplate, GoalTemplateVersion, StepEntry, StepProgress
from src.db.goal_sharing import OrganizationPlanRole, PlanActivity, PlanCollaborator, PlanInvitation, PlanRole
from src.db.learning import (
    BadgeCollection,
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    IssuerLearnerLinkCreate,
    IssuerLearnerRequestCreate,
    IssuerLearnerRequestDecision,
    LearningActivity,
    LearningBadge,
    LearningBadgeCreate,
    LearningBadgeAward,
    LearningBadgeVersion,
    LearningPage,
    LearningPageProgress,
    LearningPageType,
    LearningResponseAttempt,
    LearningRun,
)
from src.db.learning_requests import LearningAwardCreate, LearningResponseGrade, LearningResponseSubmit
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest
from src.db.portfolio import Portfolio
from src.db.badge_routes import BadgeRoute, BadgeRouteOffer
from src.db.template_marketplace import GoalTemplateAuthorization, GoalTemplateLearnerAccess, GoalTemplateListing, TemplateAuthorizationRequest
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services.goals import goals, plan_access, template_marketplace, templates
from src.services.goals.badges import start_badge_goal
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
from src.services.learning_marketplace import (
    browse_marketplace_badges,
    create_learner_link,
    decide_learner_request,
    issuer_badge_metrics,
    list_eligible_issuers,
    list_issued_badges,
    request_learner_support,
)
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
        BadgeIssuerLearnerLink,
        GoalTemplate,
        GoalTemplateListing,
        GoalTemplateAuthorization,
        GoalTemplateLearnerAccess,
        PlanRole,
        PlanCollaborator,
        PlanInvitation,
        PlanActivity,
        OrganizationPlanRole,
        GoalTemplateVersion,
        GoalAssignment,
        Goal,
        GoalStage,
        GoalStep,
        StepProgress,
        StepEntry,
        GoalStory,
        # Goals keep their chats in step (services/connect/workspace.py).
        Conversation,
        ConversationMember,
        ConversationMessage,
        ConversationMessageRef,
        UserGroup,
        UserGroupUser,
    ):
        model.__table__.create(engine)


NOW = "2026-01-01T00:00:00+00:00"


def _create_org(session: Session, *, org_id: int, slug: str, tier: str = "enterprise") -> Organization:
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
                "config_version": "3.0",
                "tier": tier,
                "partners": ["badge_publisher"] if tier != "free" else [],
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


def _plan(session: Session, badge: LearningBadge) -> GoalTemplate:
    """The badge's plan: a template of the badge's org that is its only way to earn it."""
    template = session.exec(select(GoalTemplate).join(BadgeRoute, BadgeRoute.goal_template_id == GoalTemplate.id).where(BadgeRoute.badge_id == badge.id)).first()
    if template is None:
        template = GoalTemplate(template_uuid=f"template_{badge.id}", org_id=badge.org_id, title=f"Plan for {badge.name}", creation_date=NOW, update_date=NOW)
        session.add(template)
        session.flush()
        session.add(BadgeRoute(route_uuid=f"route_{badge.id}", badge_id=badge.id, goal_template_id=template.id, recommended=True, creation_date=NOW))
        session.commit()
    return template


def _set_access(session: Session, badge: LearningBadge, org_id: int, access: str) -> None:
    """Who may start the badge's plan at this organization."""
    plan_access.set_access(session, int(_plan(session, badge).id), org_id, access, None)  # type: ignore[arg-type]
    session.commit()


def _ask(session: Session, admin: PublicUser, badge: LearningBadge, org_id: int = 2) -> dict:
    """The issuer asks to run the badge's plan (so to issue the badge through it)."""
    return template_marketplace.request_use(session, admin, TemplateAuthorizationRequest(template_uuid=_plan(session, badge).template_uuid, issuer_org_id=org_id))


async def _approved_authorization(session: Session, alice: PublicUser, bob: PublicUser, badge: LearningBadge, access: str = "invite") -> dict:
    """Bob's org (2) asks for the badge's plan and Alice (the owner) approves it."""
    asked = _ask(session, bob, badge)
    approved = template_marketplace.decide(session, alice, asked["authorization_uuid"], True)
    _set_access(session, badge, 2, access)
    return approved


async def test_an_issuer_asks_for_a_badges_plan_and_issues_once_the_owner_approves():
    from src.services.goals.plan_issuers import may_issue

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, _, badge = _setup(session)
        # The plan isn't listed itself: asking for a marketplace badge's plan is how an org asks to issue it.
        asked = _ask(session, bob, badge)
        assert asked["status"] == "requested" and [item["badge_uuid"] for item in asked["badges"]] == [badge.badge_uuid]
        assert not may_issue(session, badge, 2)
        # Only the plan's owner decides.
        with pytest.raises(HTTPException) as exc:
            template_marketplace.decide(session, bob, asked["authorization_uuid"], True)
        assert exc.value.status_code == 403
        assert template_marketplace.decide(session, alice, asked["authorization_uuid"], True)["status"] == "approved"
        assert may_issue(session, badge, 2) and may_issue(session, badge, 1) and not may_issue(session, badge, 3)
        # Leaving the plan stops issuing the badge; asking again asks again.
        assert template_marketplace.revoke(session, bob, asked["authorization_uuid"])["status"] == "revoked"
        assert not may_issue(session, badge, 2)
        assert _ask(session, bob, badge)["status"] == "requested"


async def test_a_plan_of_an_unlisted_badge_cannot_be_asked_for():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _create_org(session, org_id=1, slug="creator")
        _create_org(session, org_id=2, slug="issuer", tier="free")
        bob = _create_user(session, user_id=2, username="bob", org_id=2)
        badge = _create_badge(session, badge_id=1, org_id=1, listed=False)
        with pytest.raises(HTTPException) as exc:
            _ask(session, bob, badge)
        assert exc.value.status_code == 422
        # Listed again, a free-plan organization may ask.
        badge.marketplace_listed = True
        session.add(badge)
        session.commit()
        assert _ask(session, bob, badge)["status"] == "requested"


async def test_badge_creation_requires_the_badge_publisher_program():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        # Org 1 is the owner org, which has every program.
        _create_org(session, org_id=1, slug="platform")
        _create_org(session, org_id=2, slug="creator", tier="full")
        config = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 2)).one()
        config.config = {"config_version": "3.0", "tier": "full"}
        session.add(config)
        session.commit()
        alice = _create_user(session, user_id=1, username="alice", org_id=2)

        with pytest.raises(HTTPException) as exc:
            await create_badge(_request(), LearningBadgeCreate(org_id=2, name="Blocked"), alice, session)
        assert exc.value.status_code == 403
        assert "badge publisher" in str(exc.value.detail)

        config.config = {"config_version": "3.0", "tier": "full", "partners": ["badge_publisher"]}
        session.add(config)
        session.commit()

        badge = await create_badge(_request(), LearningBadgeCreate(org_id=2, name="Allowed"), alice, session)
        assert badge.name == "Allowed"


async def test_issuer_badge_metrics_are_scoped_to_issuer_and_include_templates():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge, access="request")
        steps = [{"key": "earn", "type": "badge", "title": "Earn the badge", "config": {"badge_uuid": badge.badge_uuid}}]
        session.add(GoalTemplate(id=10, template_uuid="goal_template_10", org_id=2, title="Issuer template",
                                 document={"stages": [{"key": "one", "title": "One", "steps": steps}]}, creation_date=NOW, update_date=NOW))
        session.add(GoalTemplate(id=11, template_uuid="goal_template_11", org_id=2, title="Unrelated", document={"stages": []}, creation_date=NOW, update_date=NOW))
        session.add(GoalAssignment(id=1, assignment_uuid="assignment_1", org_id=2, template_id=10, version_id=1, user_id=carol.id, creation_date=NOW, update_date=NOW))
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
        assert metrics["learner_access"] == "request"
        assert [plan["template_uuid"] for plan in metrics["plans"]] == ["template_1"] and metrics["plans"][0]["authorization_uuid"]
        assert metrics["templates"] == [{
            "template_uuid": "goal_template_10",
            "title": "Issuer template",
            "status": "active",
            "assignment_count": 1,
        }]


async def test_browse_shows_each_badges_plans_with_this_orgs_permission():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, _, badge = _setup(session)
        _create_badge(session, badge_id=2, org_id=1, listed=False)
        _ask(session, bob, badge)

        items = await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2)
        assert len(items) == 1  # unlisted badge excluded
        assert items[0]["issuing"] is False
        [plan] = items[0]["plans"]
        assert plan["template_uuid"] == "template_1" and plan["authorization"]["status"] == "requested"
        template_marketplace.decide(session, alice, plan["authorization"]["authorization_uuid"], True)
        assert (await browse_marketplace_badges(_request(), bob, session, issuer_org_id=2))[0]["issuing"] is True
        [issued] = await list_issued_badges(_request(), 2, bob, session)
        assert issued["badge"]["badge_uuid"] == badge.badge_uuid and issued["plans"][0]["authorization_uuid"] == plan["authorization"]["authorization_uuid"]


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
        _set_access(session, badge, 1, "open")
        await _approved_authorization(session, alice, bob, badge)

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
        _set_access(session, badge, 2, "request")
        issuers = await list_eligible_issuers(_request(), badge.badge_uuid, dave, session)
        assert [i["org"]["slug"] for i in issuers] == ["creator", "issuer"]


async def test_open_issuer_can_accept_learner_request_and_connect_user():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        await _approved_authorization(session, alice, bob, badge, access="request")

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
        await _approved_authorization(session, alice, bob, badge, access="request")
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


ESSAY_PAGE_UUID = "learning_page_essay"


def _add_activity_route(session: Session, admin: PublicUser, badge: LearningBadge) -> GoalTemplate:
    """A goal template with one activity step (a manually graded essay) as the badge's only route."""
    document = {"template": {"title": "Write it up"}, "stages": [{"key": "one", "title": "One", "steps": [{"type": "activity", "title": "Reflect"}]}]}
    created = templates.create_template(session, admin, badge.org_id, document)
    template = templates.template_or_404(session, badge.org_id, created["template_uuid"])
    activity = session.exec(select(LearningActivity).where(LearningActivity.goal_template_id == template.id)).one()
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
    templates.publish(session, admin, badge.org_id, template.template_uuid, "First")
    session.add(BadgeRoute(route_uuid=f"route_{badge.id}", badge_id=badge.id, goal_template_id=template.id, recommended=True, position=0, creation_date=NOW))
    session.commit()
    _set_access(session, badge, badge.org_id, "open")  # the creator lets anyone start it
    return template


async def _submit_essay(session: Session, learner: PublicUser, goal: Goal) -> LearningResponseAttempt:
    """The learner plays the goal's activity step and submits an essay that waits for a grade."""
    step = session.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).one()
    started = goals.start_activity(session, learner, goal.goal_uuid, step.step_uuid)
    run = started["run"]
    # The goal plays the published version's frozen copy of the essay page.
    page_uuid = session.exec(select(LearningPage.page_uuid).where(LearningPage.activity_id == step.activity_id, LearningPage.title == "Question")).one()
    await runtime.submit_response(
        None,
        LearningResponseSubmit(run_uuid=run["run_uuid"], page_uuid=page_uuid, answer={"inputs": {"reflection": {"text": "my essay"}}}),
        learner,
        session,
    )
    attempt = session.exec(select(LearningResponseAttempt).where(LearningResponseAttempt.user_id == learner.id)).one()
    assert attempt.result["grading_status"] == "pending"
    return attempt


def _step_status(session: Session, goal: Goal) -> str:
    progress = session.exec(select(StepProgress).join(GoalStep, GoalStep.id == StepProgress.step_id).where(GoalStep.goal_id == goal.id)).one()
    return getattr(progress.status, "value", progress.status)


async def test_grading_routed_to_issuing_org():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, carol, badge = _setup(session)
        _add_activity_route(session, alice, badge)
        await _approved_authorization(session, alice, bob, badge, access="open")
        goal = start_badge_goal(session, carol, badge, None, 2)
        attempt = await _submit_essay(session, carol, goal)
        assert _step_status(session, goal) == "submitted"

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
        assert _step_status(session, goal) == "completed"
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
        await _approved_authorization(session, alice, bob, badge, access="request")
        requested = await request_learner_support(_request(), IssuerLearnerRequestCreate(badge_uuid=badge.badge_uuid, issuer_org_id=2), carol, session)
        await decide_learner_request(_request(), requested["link_uuid"], True, IssuerLearnerRequestDecision(staff_user_ids=[dave.id]), bob, session)
        goal = start_badge_goal(session, carol, badge, None, 2)
        attempt = await _submit_essay(session, carol, goal)

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
        goal = start_badge_goal(session, carol, badge, None, 1)
        attempt = await _submit_essay(session, carol, goal)
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
        goal = start_badge_goal(session, carol, badge, None, 1)
        attempt = await _submit_essay(session, carol, goal)

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
        await _approved_authorization(session, alice, bob, badge, access="open")
        goal = start_badge_goal(session, carol, badge, None, 2)
        attempt = await _submit_essay(session, carol, goal)

        issuer_view = await list_learning_responses(_request(), bob, session, org_id=2)
        assert [item["attempt_uuid"] for item in issuer_view] == [attempt.attempt_uuid]
        assert issuer_view[0]["badge"]["badge_uuid"] == badge.badge_uuid
        assert issuer_view[0]["goal"]["goal_uuid"] == goal.goal_uuid
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



async def test_staff_browse_badges_read_only_and_learners_cannot():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, _, bob, _, badge = _setup(session)
        session.add(Role(id=5, role_uuid="role_teacher", name="Teacher", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
        session.commit()
        teacher = _create_user(session, user_id=4, username="tia", org_id=2, role_id=5)
        learner = _create_user(session, user_id=5, username="lou", org_id=2, role_id=4)
        _ask(session, bob, badge)

        items = await browse_marketplace_badges(_request(), teacher, session, issuer_org_id=2)
        assert items[0]["plans"][0]["authorization"]["status"] == "requested"
        with pytest.raises(HTTPException) as denied:
            await browse_marketplace_badges(_request(), learner, session, issuer_org_id=2)
        assert denied.value.status_code == 403
        # Requesting stays an admin action.
        with pytest.raises(HTTPException):
            _ask(session, teacher, badge)


async def test_requests_summary_counts_plan_requests_both_ways():
    from src.services.goals.template_marketplace import requests_summary

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    with Session(engine) as session:
        _, _, alice, bob, _, badge = _setup(session)
        assert requests_summary(session, alice, 1)["incoming_requested"] == 0
        _ask(session, bob, badge)
        assert requests_summary(session, alice, 1) == {"incoming_requested": 1, "outgoing_pending": 0}
        assert requests_summary(session, bob, 2)["outgoing_pending"] == 1
        with pytest.raises(HTTPException):
            requests_summary(session, bob, 1)

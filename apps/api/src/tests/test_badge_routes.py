import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.badge_routes import BadgePlanStart, BadgeRoute, BadgeRouteInput, BadgeRouteOffer, BadgeRouteOffersUpdate, BadgeRoutesUpdate
from src.db.learning import (
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeStatus,
    LearningBadgeVersion,
)
from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjective, PlanObjectiveCreate, PlanObjectiveProgressUpdate, PlanObjectiveStatus
from src.db.programs import ObjectiveCreate, ProgramCreate
from src.db.users import PublicUser
from src.services import badge_routes, planning
from src.services.programs import add_program_objective, create_program
from src.tests.test_programs import NOW, _setup, _tables

LEARNER = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")


def _world(session: Session, issuer_access: str = "open"):
    admin = _setup(session)
    for model in (LearningBadge, LearningBadgeVersion, BadgeIssuerAuthorization, BadgeIssuerLearnerLink, BadgeRoute, BadgeRouteOffer):
        model.__table__.create(session.get_bind(), checkfirst=True)
    session.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
    badge = LearningBadge(badge_uuid="badge_adapt", org_id=1, name="Adaptability", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW)
    session.add(badge)
    session.flush()
    version = LearningBadgeVersion(version_uuid="v1", badge_id=badge.id, org_id=1, state="published", semantic_version="1.0.0", creation_date=NOW, update_date=NOW)
    session.add(version)
    session.flush()
    badge.active_version_id = version.id
    session.add(BadgeIssuerAuthorization(
        authorization_uuid="auth_2", badge_id=badge.id, creator_org_id=1, issuer_org_id=2,
        status=BadgeIssuerAuthorizationStatus.APPROVED, learner_access=issuer_access, open_to_all=issuer_access != "invite",
        creation_date=NOW, update_date=NOW,
    ))
    session.commit()
    routes = []
    for name, titles in (("On your own", ["Notice change", "Your story"]), ("With your teacher", ["Write it up"])):
        program = create_program(session, admin, ProgramCreate(org_id=1, name=name))
        for title in titles:
            program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title=title, allow_learner_confirmation=True))
        routes.append(program["program_uuid"])
    badge_routes.set_routes(session, admin, "badge_adapt", BadgeRoutesUpdate(routes=[BadgeRouteInput(program_uuid=routes[0], recommended=True), BadgeRouteInput(program_uuid=routes[1])]))
    return admin, badge, routes


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    return Session(engine)


def test_routes_list_the_ways_to_earn_with_their_issuers():
    with _session() as session:
        _, _, routes = _world(session)
        listed = badge_routes.list_routes(session, None, "badge_adapt")
        assert [(item["name"], item["recommended"], item["step_count"]) for item in listed["routes"]] == [("On your own", True, 2), ("With your teacher", False, 1)]
        assert [issuer["org"]["name"] for issuer in listed["routes"][0]["issuers"]] == ["Studio", "Partner"]
        assert [step["title"] for step in listed["routes"][0]["steps"]] == ["Notice change", "Your story"]
        assert listed["plan"] is None


def test_starting_a_badge_creates_the_learners_own_locked_plan_and_finishing_it_awards_the_badge():
    with _session() as session:
        _, badge, routes = _world(session)
        plan = badge_routes.start_badge_plan(session, LEARNER, "badge_adapt", BadgePlanStart())
        assert plan["name"] == "Adaptability" and plan["is_mine"] and plan["source_badge"]["badge_uuid"] == "badge_adapt"
        assert [item["title"] for item in plan["objectives"]] == ["Notice change", "Your story"]
        assert plan["source_organization"]["name"] == "Studio"
        # Starting again returns the same plan.
        assert badge_routes.start_badge_plan(session, LEARNER, "badge_adapt", BadgePlanStart(program_uuid=routes[1]))["plan_uuid"] == plan["plan_uuid"]
        assert badge_routes.list_routes(session, LEARNER, "badge_adapt")["plan"]["slug"] == plan["slug"]

        with pytest.raises(HTTPException) as locked:
            planning.create_objective(session, LEARNER, plan["slug"], PlanObjectiveCreate(title="My own step"))
        assert locked.value.status_code == 409

        for item in plan["objectives"]:
            planning.update_objective_progress(session, LEARNER, plan["slug"], item["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED))
        award = session.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == 2)).one()
        assert award.badge_id == badge.id and award.source == "plan_completion" and award.issuing_org_id is None
        assert award.evidence == {"plan_uuid": plan["plan_uuid"]}
        assert session.exec(select(Plan).where(Plan.plan_uuid == plan["plan_uuid"])).one().status == "completed"


def test_issuers_offer_routes_and_their_access_is_respected():
    with _session() as session:
        admin, _, routes = _world(session)
        listed = badge_routes.list_routes(session, None, "badge_adapt")
        teacher_route = listed["routes"][1]["route_uuid"]
        badge_routes.set_offered_routes(session, admin, "badge_adapt", 2, BadgeRouteOffersUpdate(route_uuids=[teacher_route]))
        listed = badge_routes.list_routes(session, None, "badge_adapt")
        assert [issuer["org"]["name"] for issuer in listed["routes"][0]["issuers"]] == ["Studio"]
        assert [issuer["org"]["name"] for issuer in listed["routes"][1]["issuers"]] == ["Studio", "Partner"]
        with pytest.raises(HTTPException) as not_offered:
            badge_routes.start_badge_plan(session, LEARNER, "badge_adapt", BadgePlanStart(program_uuid=routes[0], issuer_org_id=2))
        assert not_offered.value.status_code == 403

        plan = badge_routes.start_badge_plan(session, LEARNER, "badge_adapt", BadgePlanStart(program_uuid=routes[1], issuer_org_id=2))
        assert plan["source_organization"]["name"] == "Partner"
        objective = session.exec(select(PlanObjective).where(PlanObjective.plan_id == session.exec(select(Plan.id).where(Plan.plan_uuid == plan["plan_uuid"])).one())).one()
        planning.update_objective_progress(session, LEARNER, plan["slug"], objective.objective_uuid, PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED))
        assert session.exec(select(LearningBadgeAward)).one().issuing_org_id == 2


def test_request_only_issuers_need_an_accepted_request():
    with _session() as session:
        _, _, routes = _world(session, issuer_access="request")
        with pytest.raises(HTTPException) as waiting:
            badge_routes.start_badge_plan(session, LEARNER, "badge_adapt", BadgePlanStart(issuer_org_id=2))
        assert waiting.value.status_code == 409


def test_converting_a_badge_path_makes_a_route_and_moves_learners_onto_plans():
    from src.db.learning import LearningActivity, LearningActivityRun, LearningPage, LearningPageType, LearningPath, LearningRun, LearningResponseAttempt, LearningPageProgress
    from src.services.badge_conversion import convert_badge_paths

    with _session() as session:
        _setup(session)
        for model in (LearningBadge, LearningBadgeVersion, LearningPath, LearningActivity, LearningPage, LearningRun, LearningActivityRun, LearningResponseAttempt, LearningPageProgress, BadgeIssuerAuthorization, BadgeIssuerLearnerLink, BadgeRoute, BadgeRouteOffer):
            model.__table__.create(session.get_bind(), checkfirst=True)
        session.add(LearningBadge(id=1, badge_uuid="badge_comm", org_id=1, name="Communication", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW))
        session.add(LearningBadgeVersion(id=1, version_uuid="v1", badge_id=1, org_id=1, state="published", semantic_version="1.0.0", creation_date=NOW, update_date=NOW))
        session.flush()
        session.get(LearningBadge, 1).active_version_id = 1
        session.add(LearningPath(id=1, path_uuid="path_1", badge_id=1, version_id=1, org_id=1))
        for activity_id, title in ((1, "Listen"), (2, "Speak up")):
            session.add(LearningActivity(id=activity_id, activity_uuid=f"learning_activity_{activity_id}", path_id=1, badge_id=1, version_id=1, org_id=1, title=title, order=activity_id,
                                         settings={"flow": {"start": f"learning_page_{activity_id}a"}} if activity_id == 1 else {}))
            for suffix in ("a", "b"):
                session.add(LearningPage(activity_id=activity_id, badge_id=1, version_id=1, org_id=1, page_uuid=f"learning_page_{activity_id}{suffix}", page_type=LearningPageType.STANDARD, title=f"{title} {suffix}", order=1 if suffix == "a" else 2, content={"blocks": []}))
        session.add(LearningRun(id=1, run_uuid="learning_run_1", badge_id=1, path_id=1, badge_version_id=1, org_id=1, user_id=2, status="in_progress"))
        session.add(LearningActivityRun(run_id=1, activity_id=1, status="completed"))
        session.commit()

        assert convert_badge_paths(session) == ["badge_comm"]
        listed = badge_routes.list_routes(session, LEARNER, "badge_comm")
        assert [(route["name"], route["recommended"], route["activity_count"]) for route in listed["routes"]] == [("Communication", True, 2)]
        copies = session.exec(select(LearningActivity).where(LearningActivity.objective_id.is_not(None))).all()
        assert [item.title for item in copies] == ["Listen", "Speak up"]
        first_pages = session.exec(select(LearningPage).where(LearningPage.activity_id == copies[0].id).order_by(LearningPage.order)).all()
        assert first_pages[0].page_uuid != "learning_page_1a" and copies[0].settings["flow"]["start"] == first_pages[0].page_uuid
        assert session.get(LearningActivity, 1).objective_id is None  # the published badge version is untouched

        plan = planning.get_plan(session, LEARNER, listed["plan"]["slug"])
        assert plan["step_order"] == "in_order" and plan["source_badge"]["badge_uuid"] == "badge_comm"
        steps = {item["title"]: item for item in plan["objectives"]}
        assert steps["Listen"]["progress"]["status"] == "completed"
        assert steps["Speak up"]["availability"]["state"] == "open" and steps["Speak up"]["kind"] == "activity"
        assert convert_badge_paths(session) == []

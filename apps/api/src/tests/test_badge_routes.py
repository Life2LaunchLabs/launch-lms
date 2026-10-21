"""Legacy badge plans (the old ``Plan`` model): one already running finishes and awards its badge.

Starting badges through legacy program routes is gone; badges are earned through plan templates
(``goals/badges``). These helpers also give other tests a badge with two legacy programs."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.badge_routes import BadgeRoute, BadgeRouteOffer
from src.db.learning import BadgeIssuerLearnerLink, LearningBadge, LearningBadgeAward, LearningBadgeStatus, LearningBadgeVersion
from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjectiveCreate, PlanObjectiveProgressUpdate, PlanObjectiveStatus
from src.db.programs import ObjectiveCreate, Program, ProgramCreate
from src.db.users import PublicUser
from src.services import planning
from src.services.programs import add_program_objective, create_program
from src.tests.test_programs import NOW, _setup, _tables

LEARNER = PublicUser(id=2, user_uuid="user_2", username="learner", email="learner@example.com", first_name="Lee", last_name="Arner")


def _world(session: Session):
    admin = _setup(session)
    for model in (LearningBadge, LearningBadgeVersion, BadgeIssuerLearnerLink, BadgeRoute, BadgeRouteOffer):
        model.__table__.create(session.get_bind(), checkfirst=True)
    session.add(Organization(id=2, org_uuid="org_2", name="Partner", slug="partner", email="partner@example.com", creation_date=NOW, update_date=NOW))
    badge = LearningBadge(badge_uuid="badge_adapt", org_id=1, name="Adaptability", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW)
    session.add(badge)
    session.flush()
    version = LearningBadgeVersion(version_uuid="v1", badge_id=badge.id, org_id=1, state="published", semantic_version="1.0.0", creation_date=NOW, update_date=NOW)
    session.add(version)
    session.flush()
    badge.active_version_id = version.id
    session.commit()
    routes = []
    for position, (name, titles) in enumerate((("On your own", ["Notice change", "Your story"]), ("With your teacher", ["Write it up"]))):
        program = create_program(session, admin, ProgramCreate(org_id=1, name=name))
        for title in titles:
            program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title=title, allow_learner_confirmation=True))
        program_id = session.exec(select(Program.id).where(Program.program_uuid == program["program_uuid"])).one()
        session.add(BadgeRoute(route_uuid=f"legacy_route_{position}", badge_id=badge.id, program_id=program_id, recommended=position == 0, position=position, creation_date=NOW))
        routes.append(program["program_uuid"])
    session.commit()
    return admin, badge, routes


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    return Session(engine)


def test_a_running_legacy_badge_plan_stays_locked_and_finishing_it_awards_the_badge():
    from src.services.own_plans import create_own_plan

    with _session() as session:
        _, badge, routes = _world(session)
        program = session.exec(select(Program).where(Program.program_uuid == routes[0])).one()
        row = create_own_plan(session, program, LEARNER.id, 1, [])
        row.source_badge_id, row.name = badge.id, badge.name
        session.add(row)
        session.commit()
        plan = planning._plan_dict(session, row, LEARNER.id, True)
        assert plan["source_badge"]["badge_uuid"] == "badge_adapt" and "edit_structure" not in plan["capabilities"]
        with pytest.raises(HTTPException) as locked:
            planning.create_objective(session, LEARNER, plan["slug"], PlanObjectiveCreate(title="My own step"))
        assert locked.value.status_code == 409

        for item in plan["objectives"]:
            planning.update_objective_progress(session, LEARNER, plan["slug"], item["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED))
        award = session.exec(select(LearningBadgeAward).where(LearningBadgeAward.user_id == 2)).one()
        assert award.badge_id == badge.id and award.source == "plan_completion" and award.issuing_org_id is None
        assert award.evidence == {"plan_uuid": plan["plan_uuid"]}
        assert session.exec(select(Plan).where(Plan.plan_uuid == plan["plan_uuid"])).one().status == "completed"

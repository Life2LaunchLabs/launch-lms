"""The Launch Ready starter plan: a system plan template every learner gets a plan from."""

import json

from sqlmodel import Session, create_engine, select

from src.db.learning import LearningActivity, LearningBadge, LearningPage
from src.db.media import MediaAsset
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanObjectiveStatus
from src.db.portfolio import (
    PortfolioLink,
    PortfolioSection,
    PortfolioVisibility,
    ProfileTrait,
    ProjectItem,
    ProjectItemBlock,
    TimelineEntry,
    TimelineEntryBlock,
    TimelineProjectLink,
)
from src.db.programs import Objective, Program, ProgramObjective, ProgramPhase
from src.services import starter_plan
from src.services.learning_documents.document import prepare_document
from src.services.starter_plan import ensure_starter_plan, starter_checklist, sync_starter_template
from src.db.portfolio import Portfolio
from src.tests.test_badge_marketplace import _create_badge, _create_org, _create_tables, _create_user

KEYS = ["welcome", "timeline", "project", "traits", "badges", "launch"]


def _session() -> Session:
    engine = create_engine("sqlite://")
    _create_tables(engine)
    for model in (
        MediaAsset, PortfolioSection, PortfolioLink, ProfileTrait, ProjectItem, ProjectItemBlock,
        TimelineEntry, TimelineEntryBlock, TimelineProjectLink,
    ):
        model.__table__.create(engine)
    session = Session(engine)
    _create_org(session, org_id=1, slug="owner")
    _create_org(session, org_id=2, slug="school")
    return session


def _template_state(db: Session) -> dict:
    program = db.exec(select(Program).where(Program.program_uuid == starter_plan.TEMPLATE_UUID)).one()
    links = db.exec(select(ProgramObjective).where(ProgramObjective.program_id == program.id).order_by(ProgramObjective.position)).all()
    objectives = [db.get(Objective, link.objective_id) for link in links]
    activities = {
        objective.objective_uuid: db.exec(select(LearningActivity).where(LearningActivity.objective_id == objective.id)).all()
        for objective in objectives
    }
    pages = {
        activity.activity_uuid: [page.page_uuid for page in db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()]
        for rows in activities.values() for activity in rows
    }
    return {
        "program": (program.id, program.org_id, program.system_type),
        "phases": len(db.exec(select(ProgramPhase).where(ProgramPhase.program_id == program.id)).all()),
        "objectives": [(objective.objective_uuid, getattr(objective.kind, "value", objective.kind)) for objective in objectives],
        "activities": {key: [activity.activity_uuid for activity in rows] for key, rows in activities.items()},
        "pages": pages,
    }


def _plan_objective(db: Session, plan: Plan, key: str) -> PlanObjective:
    return db.exec(
        select(PlanObjective).join(Objective, Objective.id == PlanObjective.source_objective_id)
        .where(PlanObjective.plan_id == plan.id, Objective.objective_uuid == f"objective_starter_{key}")
    ).one()


def _done(db: Session, plan: Plan) -> set[str]:
    done = set()
    for key in KEYS:
        progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == _plan_objective(db, plan, key).id)).first()
        if progress and getattr(progress.status, "value", progress.status) == PlanObjectiveStatus.COMPLETED.value:
            done.add(key)
    return done


def test_sync_creates_six_activity_steps_with_pages_and_is_idempotent():
    db = _session()
    sync_starter_template(db)
    first = _template_state(db)

    assert first["program"][1:] == (1, "starter")
    assert first["phases"] == 1
    assert first["objectives"] == [(f"objective_starter_{key}", "activity") for key in KEYS]
    assert first["activities"] == {f"objective_starter_{key}": [f"learning_activity_starter_{key}"] for key in KEYS}
    data = starter_plan.starter_data()
    assert first["pages"] == {
        step["document"]["activity"]["activity_uuid"]: [page["page_uuid"] for page in step["document"]["pages"]] for step in data["steps"]
    }
    assert all(first["pages"].values())

    sync_starter_template(db)
    assert _template_state(db) == first
    assert len(db.exec(select(Program).where(Program.system_type == "starter")).all()) == 1


def test_every_starter_activity_is_a_valid_activity_document():
    for step in starter_plan.starter_data()["steps"]:
        document = step["document"]
        prepared = prepare_document(document, existing_page_uuids={page["page_uuid"] for page in document["pages"]}, allow_system_blocks=True)
        assert prepared.ok, (step["key"], prepared.errors)


def test_ensure_starter_plan_is_one_plan_per_learner():
    db = _session()
    _create_user(db, user_id=10, username="maya")
    _create_user(db, user_id=11, username="leo")

    plan = ensure_starter_plan(db, 10)
    again = ensure_starter_plan(db, 10)
    other = ensure_starter_plan(db, 11)

    assert again.id == plan.id
    assert other.id != plan.id
    assert plan.subject_user_id == 10
    assert len(db.exec(select(Plan).where(Plan.subject_user_id == 10)).all()) == 1
    template = db.exec(select(Program).where(Program.program_uuid == starter_plan.TEMPLATE_UUID)).one()
    assert plan.source_program_id == template.id
    assert _done(db, plan) == set()


def test_ensure_starter_plan_checks_off_steps_already_done_in_the_portfolio():
    db = _session()
    _create_user(db, user_id=10, username="maya")
    badge = _create_badge(db, badge_id=5, org_id=2)
    portfolio = Portfolio(portfolio_uuid="por_maya", user_id=10, display_name="Maya", creation_date="", update_date="")
    db.add(portfolio)
    db.commit()

    plan = ensure_starter_plan(db, 10)
    assert _done(db, plan) == {"welcome"}

    db.add(TimelineEntry(timeline_uuid="tml_1", portfolio_id=portfolio.id, title="Intern", slug="intern", creation_date="", update_date=""))
    db.add(ProjectItem(project_uuid="prj_1", portfolio_id=portfolio.id, title="Garden", slug="garden", creation_date="", update_date=""))
    db.add(ProfileTrait(trait_uuid="trt_1", portfolio_id=portfolio.id, trait_type="strength", label="Curious", creation_date="", update_date=""))
    db.commit()
    assert ensure_starter_plan(db, 10).id == plan.id
    # A strength alone does not complete the traits step; it needs a value too.
    assert _done(db, plan) == {"welcome", "timeline", "project"}

    db.add(ProfileTrait(trait_uuid="trt_2", portfolio_id=portfolio.id, trait_type="value", label="Kindness", creation_date="", update_date=""))
    db.add(Plan(plan_uuid="plan_badge", slug="badge-plan", name="Badge 5", subject_user_id=10, source_badge_id=badge.id, creation_date="", update_date=""))
    portfolio.visibility = PortfolioVisibility.PUBLIC
    db.add(portfolio)
    db.commit()
    ensure_starter_plan(db, 10)
    assert _done(db, plan) == set(KEYS)


def test_starter_checklist_shape_and_hrefs():
    db = _session()
    _create_user(db, user_id=10, username="maya")
    db.add(Portfolio(portfolio_uuid="por_maya", user_id=10, display_name="Maya", creation_date="", update_date=""))
    db.commit()
    plan = ensure_starter_plan(db, 10)

    checklist = starter_checklist(db, plan)

    assert checklist["plan"] == {"plan_uuid": plan.plan_uuid, "slug": plan.slug, "name": plan.name}
    assert checklist["total"] == 6
    assert checklist["completed"] == 1
    assert checklist["percent"] == 17
    assert checklist["complete"] is False
    assert [item["complete"] for item in checklist["items"]] == [True, False, False, False, False, False]
    first = checklist["items"][0]
    assert set(first) == {"key", "label", "supportingText", "href", "complete"}
    assert first["key"] == _plan_objective(db, plan, "welcome").objective_uuid
    assert first["label"] == "Welcome"
    assert first["supportingText"]
    for item in checklist["items"]:
        assert item["href"] == f"/plans/{plan.slug}/objectives/{item['key']}/activity"
    assert checklist["nextIncomplete"] == checklist["items"][1]
    assert checklist["nextIncomplete"]["key"] == _plan_objective(db, plan, "timeline").objective_uuid


def test_managed_pages_are_restored_and_stale_pages_removed_on_sync():
    db = _session()
    sync_starter_template(db)
    page = db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_starter_timeline")).one()
    page.title, page.content = "Broken", {"version": 2, "blocks": []}
    db.add(page)
    activity = db.get(LearningActivity, page.activity_id)
    activity.title = "Renamed by an admin"
    db.add(activity)
    db.add(LearningPage(page_uuid="learning_page_starter_stray", page_type="standard", title="Stray", content={}, design={}, activity_id=activity.id, org_id=1, creation_date=""))
    db.commit()

    sync_starter_template(db)
    db.refresh(page)
    db.refresh(activity)
    assert page.title != "Broken" and page.content["blocks"]
    assert activity.title != "Renamed by an admin"
    assert db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_starter_stray")).first() is None


def test_seed_pages_keep_admin_edits_and_regain_missing_bindings():
    db = _session()
    sync_starter_template(db)
    name_page = db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_starter_name")).one()
    content = json.loads(json.dumps(name_page.content))
    content["blocks"][0]["content"]["node"]["content"][0]["text"] = "Edited by an admin"
    content["blocks"][1]["completion"]["variable_bindings"] = {}
    name_page.content, name_page.title = content, "Your name"
    db.add(name_page)
    welcome = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == "learning_activity_starter_welcome")).one()
    welcome.title = "Hello there"
    db.add(welcome)
    db.add(LearningPage(page_uuid="learning_page_admin_extra", page_type="standard", title="Extra", content={}, design={}, activity_id=welcome.id, org_id=1, creation_date=""))
    db.commit()

    sync_starter_template(db)
    db.refresh(name_page)
    db.refresh(welcome)
    assert name_page.title == "Your name"
    assert name_page.content["blocks"][0]["content"]["node"]["content"][0]["text"] == "Edited by an admin"
    assert name_page.content["blocks"][1]["completion"]["variable_bindings"]["inputs"]["first_name"] == {"target": "user.first_name"}
    assert welcome.title == "Hello there"
    assert db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_admin_extra")).first() is not None


def test_template_belongs_to_owner_org_and_creates_no_system_badge():
    db = _session()
    sync_starter_template(db)
    assert db.exec(select(Program).where(Program.program_uuid == starter_plan.TEMPLATE_UUID)).one().org_id == 1
    assert db.exec(select(LearningBadge)).all() == []

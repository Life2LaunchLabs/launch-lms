from types import SimpleNamespace

from sqlmodel import Session, create_engine, select

from src.db.learning import LearningActivity, LearningBadge
from src.db.planning import PlanObjective
from src.db.programs import ObjectiveCreate, ProgramAssignmentCreate, ProgramCreate
from src.db.requirements import RequirementAttainmentSource
from src.services.goals.legacy import (
    STATUS_MAP,
    convert_objective,
    objective_from_plan,
    objective_from_template,
    step_mix,
)
from src.services.programs import add_program_objective, assign_program, create_program
from src.tests.test_programs import _setup, _tables


def _plan_objective(**changes):
    row = {"title": "Portfolio", "kind": "custom", "fields": [], "activity_id": None, "completion_restricted": False}
    return objective_from_plan(SimpleNamespace(**{**row, **changes}))


def _types(conversion):
    return [(step.type, step.completed_by, step.review_required) for step in conversion.steps]


def test_objective_without_fields_becomes_one_task_for_whoever_could_finish_it():
    assert _types(convert_objective(_plan_objective())) == [("task", "learner", False)]
    assert _types(convert_objective(_plan_objective(completion_restricted=True))) == [("task", "staff", False)]


def test_activity_objective_becomes_one_activity_step():
    conversion = convert_objective(_plan_objective(kind="activity", activity_id=7))
    assert _types(conversion) == [("activity", "learner", False)]
    assert conversion.steps[0].config == {"activity_id": 7}
    assert conversion.warnings == []


def test_media_fields_become_one_upload_with_a_slot_each_and_keep_the_objective_title():
    conversion = convert_objective(_plan_objective(fields=[
        {"field_uuid": "resume", "type": "media", "title": "Resume", "allowed_types": ["document"]},
        {"field_uuid": "photo", "type": "media", "title": "Headshot", "allowed_types": ["image"]},
    ]))
    assert not conversion.split
    [upload] = conversion.steps
    assert upload.type == "upload" and upload.title == "Portfolio"
    assert [slot["key"] for slot in upload.config["slots"]] == ["resume", "photo"]
    assert upload.source_field_uuids == ["resume", "photo"]


def test_mixed_objective_splits_in_field_order_and_staff_only_learner_fields_need_review():
    conversion = convert_objective(_plan_objective(completion_restricted=True, fields=[
        {"field_uuid": "why", "type": "text", "title": "Why this school"},
        {"field_uuid": "essay", "type": "media", "title": "Essay"},
        {"field_uuid": "site", "type": "link", "title": "Portfolio site"},
        {"field_uuid": "met", "type": "checkbox", "title": "Met with counselor", "restricted": True},
    ]))
    assert conversion.split
    assert [step.title for step in conversion.steps] == ["Why this school", "Essay", "Portfolio site", "Met with counselor"]
    assert _types(conversion) == [
        ("write", "learner", True),
        ("upload", "learner", True),
        ("task", "learner", True),
        ("task", "staff", False),
    ]
    assert conversion.steps[2].config["list"]["target"] == 1


def test_link_only_media_field_is_a_link():
    conversion = convert_objective(_plan_objective(fields=[{"field_uuid": "url", "type": "media", "allowed_types": ["link"], "title": "Link"}]))
    assert _types(conversion) == [("task", "learner", False)]
    assert step_mix(_plan_objective(fields=[{"type": "media", "allowed_types": ["link"]}])) == "link"


def test_template_objective_with_badge_id_gets_a_badge_step():
    legacy = objective_from_template({"title": "Earn First Aid", "kind": "badge", "custom_fields": [], "allow_learner_confirmation": True})
    conversion = convert_objective(legacy, badge_id_uuid="badge_first_aid")
    assert _types(conversion) == [("badge", "learner", False)]
    assert conversion.steps[0].config == {"badge_uuid": "badge_first_aid"}


def test_unknown_field_types_are_kept_as_write_with_a_warning():
    conversion = convert_objective(_plan_objective(fields=[{"field_uuid": "x", "type": "rating", "title": "Rate it"}]))
    assert _types(conversion) == [("write", "learner", False)]
    assert conversion.warnings == ["unknown field type 'rating', kept as Write"]


def test_every_legacy_status_has_a_goal_status():
    assert set(STATUS_MAP.values()) == {"not_started", "in_progress", "submitted", "changes_requested", "completed", "excused"}


def test_report_counts_templates_plans_and_conversion_without_writing():
    from scripts.goals_migration_report import report

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    for model in (LearningBadge, LearningActivity, RequirementAttainmentSource):
        model.__table__.create(engine, checkfirst=True)
    with Session(engine) as session:
        admin = _setup(session)
        program = create_program(session, admin, ProgramCreate(org_id=1, name="College Ready"))
        add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(title="Orientation"))
        add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(
            title="Application", allow_learner_confirmation=True,
            custom_fields=[{"field_uuid": "essay", "type": "text", "title": "Essay"}, {"field_uuid": "transcript", "type": "media", "title": "Transcript"}],
        ))
        assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        before = len(session.exec(select(PlanObjective)).all())

        data = report(session)

        assert data["templates"]["templates"] == 1
        assert data["assignments"]["assignments"] == 1
        assert data["plans"]["by_source"] == {"assignment": 1}
        assert data["objectives"]["objectives"] == 2
        assert data["objectives"]["by_step_mix"] == {"(no fields)": 1, "media+text": 1}
        assert data["conversion"]["objectives_split"] == 1
        assert data["conversion"]["steps_after"] == 3
        assert data["template_objectives"]["split"] == 1
        assert data["progress"]["by_new_status"] == {"not_started": 2}
        assert len(session.exec(select(PlanObjective)).all()) == before

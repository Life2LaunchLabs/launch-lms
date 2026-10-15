"""The plans-to-goals move: templates, versions, assignments and live plans carry over with their progress."""

from datetime import datetime

import pytest
from sqlmodel import select

from src.db.goals import (
    Goal,
    GoalAssignment,
    GoalStage,
    GoalStep,
    GoalStory,
    GoalTemplate,
    GoalTemplateVersion,
    StepEntry,
    StepProgress,
)
from src.db.learning import LearningActivity, LearningRun
from src.db.media import MediaAsset
from src.db.planning import Plan, PlanCreate, PlanObjective, PlanObjectiveProgress, PlanObjectiveStatus, PlanRole
from src.db.programs import ObjectiveCreate, Program, ProgramAssignment, ProgramUpdate
from src.db.requirements import RequirementAttainmentSource
from src.services import planning
from src.services.goals import goals as goal_service
from src.services.goals.migration import run, verify
from src.services.programs import add_program_objective, update_program
from src.tests.test_plan_activities import LEARNER, _session as _legacy_session, _template_with_activities
from src.tests.test_programs import _setup
from src.tests.test_template_versions import _issue

FIELDS = [
    {"field_uuid": "field_essay", "type": "text", "title": "Your reflection"},
    {"field_uuid": "field_photo", "type": "media", "title": "A photo", "allowed_types": ["image"]},
    {"field_uuid": "field_slides", "type": "media", "title": "Slides", "allowed_types": ["document"]},
    {"field_uuid": "field_signed", "type": "checkbox", "title": "Mentor signed off", "restricted": True},
]


def _session():
    session = _legacy_session()
    for model in (GoalTemplate, GoalTemplateVersion, GoalAssignment, Goal, GoalStage, GoalStep, StepProgress, StepEntry, GoalStory, RequirementAttainmentSource):
        model.__table__.create(session.get_bind(), checkfirst=True)
    return session


def _template(session, admin) -> dict:
    """Two activities in order, then a mixed evidence step that waits on the first activity."""
    program = _template_with_activities(session, admin)
    first = program["objectives"][0]["objective_uuid"]
    program = add_program_objective(session, admin, 1, program["program_uuid"], ObjectiveCreate(
        title="Show your work", custom_fields=FIELDS, allow_learner_confirmation=False, reviewer_guidance="Look for a real photo",
    ))
    from src.db.programs import Objective, ProgramObjective
    evidence = session.exec(select(ProgramObjective).join(Objective).where(Objective.title == "Show your work")).one()
    evidence.after_objective_uuids = [first]
    session.add(evidence)
    session.commit()
    update_program(session, admin, 1, program["program_uuid"], ProgramUpdate(step_order="any"))
    return program


def _progress(session, objective, **values) -> None:
    row = session.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == objective.id)).first()
    row = row or PlanObjectiveProgress(progress_uuid=f"progress_{objective.id}", plan_objective_id=objective.id, creation_date="2026-09-01")
    for key, value in values.items():
        setattr(row, key, value)
    session.add(row)


def _seed(session):
    admin = _setup(session)
    program = _template(session, admin)
    plan = _issue(session, admin, program)
    objectives = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()
    session.add(MediaAsset(id=7, asset_uuid="asset_photo", owner_user_id=2, owner_type="user", source_type="upload", url="https://cdn/photo.jpg", filename="photo.jpg", media_type="image",
                           creation_date="2026-09-01", update_date="2026-09-01"))
    evidence, first = objectives[-1], objectives[0]
    _progress(session, evidence, status=PlanObjectiveStatus.SUBMITTED, subject_note="Here it is", updated_by_user_id=2,
              field_values={"field_essay": "I learned to adapt.", "field_photo": [{"asset_uuid": "asset_photo", "name": "photo.jpg", "url": "https://cdn/photo.jpg"}]})
    _progress(session, first, status=PlanObjectiveStatus.COMPLETED, completed_at=datetime(2026, 9, 3), updated_by_user_id=2)
    session.flush()
    evidence_progress = session.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == evidence.id)).one()
    session.add(RequirementAttainmentSource(source_uuid="source_1", enrollment_id=1, node_uuid="node_1", plan_objective_progress_id=evidence_progress.id,
                                            creation_date="2026-09-02", update_date="2026-09-02"))
    session.add(LearningRun(run_uuid="run_1", activity_id=first.activity_id, org_id=1, plan_id=plan.id, plan_objective_id=first.id, user_id=2,
                            creation_date="2026-09-01", update_date="2026-09-03"))
    session.commit()
    personal = planning.create_plan(session, LEARNER, PlanCreate(name="Learn guitar"))
    return admin, program, plan, personal


def test_templates_versions_and_assignments_become_goal_templates():
    with _session() as session:
        _, program, plan, _ = _seed(session)
        result = run(session)
        session.commit()

        template = session.exec(select(GoalTemplate)).one()
        assert template.template_uuid == program["program_uuid"] and template.title == "Adaptability"
        steps = [step for stage in template.document["stages"] for step in stage["steps"]]
        assert [step["type"] for step in steps] == ["activity", "activity", "write", "upload", "task"]
        write, upload, signed = steps[2], steps[3], steps[4]
        assert write["after"] == [steps[0]["key"]] and write["key"] == program["objectives"][-1]["objective_uuid"]
        # Learner fields on a staff-only objective are reviewed; the restricted checkbox stays a staff step.
        assert (write["completed_by"], write["review_required"]) == ("learner", True)
        assert [slot["label"] for slot in upload["config"]["slots"]] == ["A photo", "Slides"]
        assert (signed["completed_by"], signed["review_required"]) == ("staff", False)
        # The draft plays the template's own activities; the published version plays frozen copies.
        working = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == steps[0]["config"]["activity_uuid"])).one()
        assert working.goal_template_id == template.id and working.frozen_from_id is None
        version = session.get(GoalTemplateVersion, template.published_version_id)
        frozen_uuid = version.document["stages"][0]["steps"][0]["config"]["activity_uuid"]
        frozen = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == frozen_uuid)).one()
        assert frozen.frozen_from_id == working.id
        assignment = session.exec(select(GoalAssignment)).one()
        assert assignment.assignment_uuid == session.exec(select(ProgramAssignment)).one().assignment_uuid
        assert assignment.version_id == version.id
        assert result.counts["templates"] == 1 and result.counts["goals"] == 2


def test_live_plans_keep_their_uuids_progress_evidence_and_runs():
    with _session() as session:
        _, _, plan, personal = _seed(session)
        run(session)
        session.commit()

        goal = session.exec(select(Goal).where(Goal.goal_uuid == plan.plan_uuid)).one()
        assert (goal.source, goal.ownership, goal.subject_user_id) == ("assignment", "external", 2)
        steps = session.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position)).all()
        objectives = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()
        assert steps[0].step_uuid == objectives[0].objective_uuid and steps[2].step_uuid == objectives[2].objective_uuid
        assert steps[2].after_step_uuids == [objectives[0].objective_uuid]

        progress = {row.step_id: row for row in session.exec(select(StepProgress)).all()}
        assert progress[steps[0].id].status == "completed" and progress[steps[0].id].completion_method == "auto"
        write, upload, signed = steps[2], steps[3], steps[4]
        assert progress[write.id].status == progress[upload.id].status == progress[signed.id].status == "submitted"
        assert progress[write.id].submission == {"text": "I learned to adapt."} and progress[write.id].learner_note == "Here it is"
        entries = session.exec(select(StepEntry).where(StepEntry.step_id == upload.id)).all()
        assert [(entry.kind, entry.slot, entry.asset_id) for entry in entries] == [("file", "field_photo", 7)]
        assert session.exec(select(LearningRun)).one().goal_step_id == steps[0].id
        # Requirement credit follows the step that finishes the old objective.
        assert session.exec(select(RequirementAttainmentSource)).one().step_progress_id == progress[signed.id].id

        # Roles moved with the plan, so the learner sees their goal through the new API.
        assert session.exec(select(PlanRole).where(PlanRole.plan_id == plan.id)).first().goal_id == goal.id
        view = goal_service.get_goal(session, LEARNER, goal.goal_uuid)
        assert [step["title"] for step in view["stages"][0]["steps"]][:2] == ["What just changed?", "See it coming"]

        mine = session.exec(select(Goal).where(Goal.goal_uuid == personal["plan_uuid"])).one()
        assert (mine.source, mine.ownership, mine.owner_user_id) == ("none", "personal", 2)


def test_the_move_runs_once_and_checks_itself():
    with _session() as session:
        _seed(session)
        run(session)
        session.commit()
        with pytest.raises(RuntimeError, match="runs once"):
            run(session)
        # A plan without its goal fails the check.
        session.delete(session.exec(select(Goal).where(Goal.source == "none")).one())
        session.commit()
        with pytest.raises(RuntimeError, match="goals: 2 legacy rows, 1 migrated"):
            verify(session)
        assert session.exec(select(Program)).one() and session.exec(select(Plan)).all()


def test_a_step_whose_badge_was_deleted_becomes_a_task():
    with _session() as session:
        _, _, plan, _ = _seed(session)
        gone = {"field_uuid": "field_gone", "type": "badge", "title": "Earn the old badge", "badge_uuid": "badge_deleted"}
        assignment = session.exec(select(ProgramAssignment)).one()
        snapshot = [dict(item) for item in assignment.objective_snapshot]
        snapshot[-1]["custom_fields"] = [*snapshot[-1].get("custom_fields", []), gone]
        assignment.objective_snapshot = snapshot
        live = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position.desc())).first()
        live.fields = [*(live.fields or []), gone]
        session.add_all([assignment, live])
        session.commit()

        result = run(session)
        session.commit()

        assert any("badge missing, kept as a task" in warning for warning in result.warnings)
        goal = session.exec(select(Goal).where(Goal.goal_uuid == plan.plan_uuid)).one()
        steps = session.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()
        assert "badge" not in {step.type for step in steps} and any(step.title == "Earn the old badge" for step in steps)

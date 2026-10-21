"""The plans-to-goals move: templates, versions, assignments and live plans carry over with their progress.

The database is built as it stood before the move: the legacy tables from the
frozen definitions, and the shared tables with their plan columns back on.
"""

from datetime import datetime

import pytest
from sqlalchemy import Column, Integer, MetaData, Table, insert, select as core_select
from sqlmodel import select

from src.db.goal_sharing import DEFAULT_ROLE_DEFINITIONS, PlanActivity, PlanAttachment, PlanCollaborator, PlanCollaboratorRequest, PlanInvitation, PlanRole
from src.db.goals import Goal, GoalAssignment, GoalStep, GoalTemplate, GoalTemplateVersion, StepEntry, StepProgress
from src.db.learning import LearningActivity, LearningPage, LearningRun
from src.db.media import MediaAsset
from src.db.requirements import RequirementAttainmentSource
from src.services.goals import goals as goal_service
from src.services.goals.migration import run, verify
from src.services.goals.migration.drafts import TEMPLATE_FIELDS, draft_fingerprint, program_phases
from src.services.goals.migration.legacy_tables import (
    FrozenActivity,
    LegacyTable,
    Objective,
    Plan,
    PlanObjective,
    PlanObjectiveProgress,
    PlanPhase,
    Program,
    ProgramAssignment,
    ProgramObjective,
    ProgramPhase,
    ProgramTemplateVersion,
)
from src.tests.test_goals import ADMIN, LEARNER, NOW, _session as _goal_session, _user

FIELDS = [
    {"field_uuid": "field_essay", "type": "text", "title": "Your reflection", "restricted": False, "access": "contributor"},
    {"field_uuid": "field_photo", "type": "media", "title": "A photo", "allowed_types": ["image"], "restricted": False, "access": "contributor"},
    {"field_uuid": "field_slides", "type": "media", "title": "Slides", "allowed_types": ["document"], "restricted": False, "access": "contributor"},
    {"field_uuid": "field_signed", "type": "checkbox", "title": "Mentor signed off", "restricted": True, "access": "reviewer"},
]
# Shared tables and the plan columns they had before the move.
PLAN_COLUMNS = {
    LearningActivity: ("objective_id",),
    LearningRun: ("plan_id", "plan_objective_id"),
    RequirementAttainmentSource: ("plan_objective_progress_id", "objective_progress_id"),
    **{model: ("plan_id",) for model in (PlanRole, PlanCollaborator, PlanInvitation, PlanCollaboratorRequest, PlanAttachment, PlanActivity)},
}
REKEYED_COLUMNS = {"goal_id", "goal_step_id", "step_progress_id"}


def _session():
    session = _goal_session()
    bind = session.get_bind()
    tables = {}
    for model, columns in PLAN_COLUMNS.items():
        current = model.__table__
        current.drop(bind, checkfirst=True)
        tables[current.name] = Table(current.name, MetaData(), *(
            Column(column.name, column.type, primary_key=column.primary_key, nullable=column.nullable or column.name in REKEYED_COLUMNS, server_default=column.server_default)
            for column in current.columns
        ), *(Column(name, Integer) for name in columns))
        tables[current.name].create(bind)
    LegacyTable.metadata.create_all(bind)
    return session, tables


def _add(session, table: Table, **values) -> None:
    session.execute(insert(table).values(**values))


def _template(session, tables) -> Program:
    """Two activities, then a mixed evidence step that waits on the first, published as version 1 with frozen copies of the activities."""
    program = Program(id=1, program_uuid="program_adapt", slug="adaptability", org_id=1, name="Adaptability", role_definitions=list(DEFAULT_ROLE_DEFINITIONS),
                      published_version_id=1, created_by_user_id=ADMIN, creation_date=NOW, update_date=NOW)
    session.add(program)
    session.add(ProgramPhase(id=1, phase_uuid="program_phase_1", program_id=1, name="Phase 1"))
    for id_, title in ((1, "What just changed?"), (2, "See it coming")):
        session.add(Objective(id=id_, objective_uuid=f"objective_{id_}", org_id=1, title=title, kind="activity", completion_policy="either", allow_learner_confirmation=True))
        session.add(ProgramObjective(id=id_, program_id=1, phase_id=1, objective_id=id_, position=id_ - 1))
        # The template's editable activity, and the published version's frozen copy.
        for activity_id in (id_, id_ + 2):
            _add(session, tables["learningactivity"], id=activity_id, activity_uuid=f"learning_activity_{activity_id}", objective_id=id_, org_id=1, title=title,
                 description="", thumbnail_image="", settings={}, creation_date=NOW, update_date=NOW)
            session.add(LearningPage(id=activity_id, activity_id=activity_id, org_id=1, page_uuid=f"learning_page_{activity_id}", page_type="standard",
                                     title=f"{title} page", order=1, required=True, content={"blocks": []}))
        session.add(FrozenActivity(activity_id=id_ + 2, source_activity_id=id_))
    session.add(Objective(id=3, objective_uuid="objective_3", org_id=1, title="Show your work", completion_policy="staff", evidence_policy="both",
                          custom_fields=FIELDS, reviewer_guidance="Look for a real photo"))
    session.add(ProgramObjective(id=3, program_id=1, phase_id=1, objective_id=3, position=2, after_objective_uuids=["objective_1"]))
    session.flush()
    phases = program_phases(session, program)
    objectives = [{**item, "phase_uuid": phase["phase_uuid"], "phase_name": phase["name"]} for phase in phases for item in phase["objectives"]]
    for item in objectives[:2]:
        frozen = item["activity_id"] + 2
        item.update(activity_id=frozen, activity={**item["activity"], "activity_uuid": f"learning_activity_{frozen}"})
    snapshot = {"template": {key: getattr(program, key) for key in TEMPLATE_FIELDS},
                "phases": [{key: value for key, value in phase.items() if key not in {"id", "objectives"}} for phase in phases], "objectives": objectives}
    session.add(ProgramTemplateVersion(id=1, version_uuid="template_version_1", program_id=1, org_id=1, snapshot=snapshot,
                                       content_hash=draft_fingerprint(session, program), published_by_user_id=ADMIN, published_at=datetime(2026, 9, 1)))
    session.add(ProgramAssignment(id=1, assignment_uuid="assignment_adapt", org_id=1, program_id=1, user_id=LEARNER, template_version_id=1,
                                  objective_snapshot=objectives, staff_user_ids=[ADMIN], collaborators=[{"user_id": ADMIN, "role_key": "plan_admin"}],
                                  created_by_user_id=ADMIN, owner_user_id=ADMIN))
    return program


def _plan(session, tables, plan_id: int, plan_uuid: str, name: str, owner: int, **values) -> None:
    """A live plan with the default roles, its learner a collaborator in the subject role (and its owner staff, when that isn't the learner)."""
    session.add(Plan(id=plan_id, plan_uuid=plan_uuid, slug=plan_uuid, name=name, owner_user_id=owner, subject_user_id=LEARNER, creation_date=NOW, update_date=NOW, **values))
    for position, role in enumerate(DEFAULT_ROLE_DEFINITIONS):
        _add(session, tables["planrole"], id=plan_id * 10 + position, role_uuid=f"plan_role_{plan_id}_{role['key']}", plan_id=plan_id, key=role["key"], name=role["name"],
             capabilities=role["capabilities"], grantable_role_keys=[], creation_date=NOW, update_date=NOW)
    members = [(LEARNER, plan_id * 10)] + ([(owner, plan_id * 10 + 2)] if owner != LEARNER else [])
    for user_id, role_id in members:
        _add(session, tables["plancollaborator"], collaborator_uuid=f"plan_collaborator_{plan_id}_{user_id}", plan_id=plan_id, user_id=user_id, role_id=role_id,
             active=True, creation_date=NOW, update_date=NOW)
    _add(session, tables["planactivity"], activity_uuid=f"plan_activity_{plan_id}", plan_id=plan_id, actor_user_id=LEARNER, action="plan.created", payload={}, creation_date=NOW)


def _progress(session, objective_id: int, status: str, **values) -> None:
    session.add(PlanObjectiveProgress(id=objective_id, progress_uuid=f"plan_progress_{objective_id}", plan_objective_id=objective_id, status=status, **values))


def _seed(session, tables):
    program = _template(session, tables)
    _plan(session, tables, 1, "plan_adapt", "Adaptability", ADMIN, source_org_id=1, source_program_id=1, source_assignment_id=1)
    session.add(PlanPhase(id=1, phase_uuid="plan_phase_1", plan_id=1, name="Phase 1"))
    for id_, title in ((1, "What just changed?"), (2, "See it coming")):
        session.add(PlanObjective(id=id_, objective_uuid=f"plan_objective_{id_}", plan_id=1, phase_id=1, source_objective_id=id_, title=title, kind="activity",
                                  position=id_ - 1, activity_id=id_ + 2))
    session.add(PlanObjective(id=3, objective_uuid="plan_objective_3", plan_id=1, phase_id=1, source_objective_id=3, title="Show your work", position=2,
                              fields=FIELDS, completion_restricted=True, reviewer_guidance="Look for a real photo", after_objective_uuids=["plan_objective_1"]))
    session.add(MediaAsset(id=7, asset_uuid="asset_photo", owner_user_id=LEARNER, owner_type="user", source_type="upload", url="https://cdn/photo.jpg", filename="photo.jpg",
                           media_type="image", creation_date="2026-09-01", update_date="2026-09-01"))
    _progress(session, 1, "completed", completed_at=datetime(2026, 9, 3), updated_by_user_id=LEARNER)
    _progress(session, 2, "not_started")
    _progress(session, 3, "submitted", subject_note="Here it is", updated_by_user_id=LEARNER,
              field_values={"field_essay": "I learned to adapt.", "field_photo": [{"asset_uuid": "asset_photo", "name": "photo.jpg", "url": "https://cdn/photo.jpg"}]})
    _add(session, tables["requirementattainmentsource"], source_uuid="source_1", enrollment_id=1, node_uuid="node_1", plan_objective_progress_id=3,
         objective_title="", evidence_snapshot={}, creation_date="2026-09-02", update_date="2026-09-02")
    _add(session, tables["learningrun"], run_uuid="run_1", activity_id=3, org_id=1, plan_id=1, plan_objective_id=1, user_id=LEARNER, status="IN_PROGRESS", started_at=datetime(2026, 9, 1),
         data={}, creation_date="2026-09-01", update_date="2026-09-03")
    _plan(session, tables, 2, "plan_guitar", "Learn guitar", LEARNER)
    session.add(PlanPhase(id=2, phase_uuid="plan_phase_2", plan_id=2, name="Getting started"))
    session.commit()
    return program


def test_templates_versions_and_assignments_become_goal_templates():
    session, tables = _session()
    with session:
        _seed(session, tables)
        result = run(session)
        session.commit()

        template = session.exec(select(GoalTemplate)).one()
        assert template.template_uuid == "program_adapt" and template.title == "Adaptability"
        steps = [step for stage in template.document["stages"] for step in stage["steps"]]
        assert [step["type"] for step in steps] == ["activity", "activity", "write", "upload", "task"]
        write, upload, signed = steps[2], steps[3], steps[4]
        assert write["after"] == [steps[0]["key"]] and write["key"] == "objective_3"
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
        assert assignment.assignment_uuid == "assignment_adapt"
        assert assignment.version_id == version.id
        assert result.counts["templates"] == 1 and result.counts["goals"] == 2


def test_live_plans_keep_their_uuids_progress_evidence_and_runs():
    session, tables = _session()
    with session:
        _seed(session, tables)
        run(session)
        session.commit()

        goal = session.exec(select(Goal).where(Goal.goal_uuid == "plan_adapt")).one()
        assert (goal.source, goal.ownership, goal.subject_user_id) == ("assignment", "external", LEARNER)
        steps = session.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position)).all()
        assert steps[0].step_uuid == "plan_objective_1" and steps[2].step_uuid == "plan_objective_3"
        assert steps[2].after_step_uuids == ["plan_objective_1"]

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
        planrole = tables["planrole"]
        assert set(session.execute(core_select(planrole.c.goal_id).where(planrole.c.plan_id == 1)).scalars()) == {goal.id}
        view = goal_service.get_goal(session, _user(LEARNER), goal.goal_uuid)
        assert [step["title"] for step in view["stages"][0]["steps"]][:2] == ["What just changed?", "See it coming"]

        mine = session.exec(select(Goal).where(Goal.goal_uuid == "plan_guitar")).one()
        assert (mine.source, mine.ownership, mine.owner_user_id) == ("none", "personal", LEARNER)


def test_the_move_runs_once_and_checks_itself():
    session, tables = _session()
    with session:
        _seed(session, tables)
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
    session, tables = _session()
    with session:
        _seed(session, tables)
        gone = {"field_uuid": "field_gone", "type": "badge", "title": "Earn the old badge", "badge_uuid": "badge_deleted"}
        assignment = session.exec(select(ProgramAssignment)).one()
        snapshot = [dict(item) for item in assignment.objective_snapshot]
        snapshot[-1]["custom_fields"] = [*snapshot[-1].get("custom_fields", []), gone]
        assignment.objective_snapshot = snapshot
        live = session.get(PlanObjective, 3)
        live.fields = [*(live.fields or []), gone]
        session.add_all([assignment, live])
        session.commit()

        result = run(session)
        session.commit()

        assert any("badge missing, kept as a task" in warning for warning in result.warnings)
        goal = session.exec(select(Goal).where(Goal.goal_uuid == "plan_adapt")).one()
        steps = session.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()
        assert "badge" not in {step.type for step in steps} and any(step.title == "Earn the old badge" for step in steps)

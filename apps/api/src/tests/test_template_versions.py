"""Plan template versions: issued plans keep their version, rollback only affects new issuances."""

import asyncio

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.learning import LearningActivity, LearningPage, LearningPageType, LearningRun
from src.db.planning import Plan, PlanObjective
from src.db.programs import FrozenActivity, Program, ProgramAssignment, ProgramAssignmentCreate, ProgramParticipant, ProgramTemplateVersion
from src.db.users import User
from src.services import plan_activities, template_versions
from src.services.learning_documents import store
from src.services.programs import assign_program, get_program, respond_to_invitation
from src.tests.test_plan_activities import LEARNER, _session, _template_with_activities
from src.tests.test_programs import _setup


def _issue(session, admin, program: dict) -> Plan:
    """Assign the template to the learner and accept: a newly issued plan."""
    assign_program(session, admin, 1, program["program_uuid"], ProgramAssignmentCreate(user_id=2, staff_user_ids=[1]))
    participant = session.exec(select(ProgramParticipant).order_by(ProgramParticipant.id.desc())).first()
    respond_to_invitation(session, LEARNER, 1, participant.participant_uuid, True)
    return session.exec(select(Plan).order_by(Plan.id.desc())).first()


def _status(session, program: dict) -> dict:
    return template_versions.version_status(session, session.exec(select(Program).where(Program.program_uuid == program["program_uuid"])).one())


def _first_activity(session, plan: Plan) -> LearningActivity:
    objective = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).first()
    return session.get(LearningActivity, objective.activity_id)


def _working(session, program: dict) -> LearningActivity:
    return session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == program["objectives"][0]["activity"]["activity_uuid"])).one()


def _pages(session, activity: LearningActivity) -> list[str]:
    return [page.title for page in session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()]


def _add_page(session, activity: LearningActivity, title: str) -> None:
    session.add(LearningPage(activity_id=activity.id, org_id=1, page_uuid=f"learning_page_{title}", page_type=LearningPageType.STANDARD, title=title, order=2, required=True, content={"blocks": []}))
    session.commit()


def test_first_issue_publishes_version_one_and_plans_play_frozen_copies():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin)
        status = _status(session, program)
        assert status["published_version"] is None and status["has_unpublished_changes"]

        plan = _issue(session, admin, program)
        played, working = _first_activity(session, plan), _working(session, program)
        assert session.get(FrozenActivity, played.id).source_activity_id == working.id and session.get(FrozenActivity, working.id) is None
        assert _pages(session, played) == _pages(session, working) == ["What just changed? page"]
        status = _status(session, program)
        assert status["published_version"]["number"] == 1 and not status["has_unpublished_changes"]
        assert status["versions"][0]["assignment_count"] == 1
        assert session.exec(select(ProgramAssignment)).one().template_version_id == session.exec(select(ProgramTemplateVersion)).one().id

        # The template's editable activity is still the working one; frozen copies cannot be edited.
        assert program["objectives"][0]["activity"]["activity_uuid"] == get_program(session, admin, 1, program["program_uuid"])["objectives"][0]["activity"]["activity_uuid"]
        user_row = session.get(User, 1)
        current = asyncio.run(store.get_activity_document(None, played.activity_uuid, user_row, session))
        with pytest.raises(HTTPException) as frozen:
            asyncio.run(store.save_activity_document(None, played.activity_uuid, store.ActivityDocumentSave(document=current["document"], base_etag=current["etag"]), user_row, session))
        assert frozen.value.status_code == 409


def test_draft_edits_reach_new_plans_only_after_publishing_and_rollback_only_affects_new_plans():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin)
        first = _issue(session, admin, program)
        _add_page(session, _working(session, program), "Added in v2")

        status = _status(session, program)
        assert status["has_unpublished_changes"]
        unpublished = _issue(session, admin, program)
        assert _pages(session, _first_activity(session, unpublished)) == ["What just changed? page"]  # still version 1

        published = template_versions.publish(session, admin, 1, program["program_uuid"], "Add a page")
        assert published["published"]["number"] == 2 and published["published"]["note"] == "Add a page"
        with pytest.raises(HTTPException) as nothing:
            template_versions.publish(session, admin, 1, program["program_uuid"])
        assert nothing.value.status_code == 409
        second = _issue(session, admin, program)
        assert _pages(session, _first_activity(session, second)) == ["What just changed? page", "Added in v2"]
        assert _pages(session, _first_activity(session, first)) == ["What just changed? page"]  # issued plans keep their version

        restored = template_versions.restore(session, admin, 1, program["program_uuid"], 1)
        assert restored["published"]["number"] == 3 and restored["published"]["restored_from_number"] == 1
        third = _issue(session, admin, program)
        # Version 3 reuses version 1's frozen activity: same content, same learner records space.
        assert _first_activity(session, third).id == _first_activity(session, first).id
        assert _pages(session, _first_activity(session, second)) == ["What just changed? page", "Added in v2"]
        # The draft keeps the newer edits, so it differs from the restored version.
        assert restored["has_unpublished_changes"]
        counts = {item["number"]: item["assignment_count"] for item in restored["versions"]}
        assert counts == {3: 0, 2: 1, 1: 2}


def test_unchanged_activities_are_reused_across_versions():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin)
        first = _issue(session, admin, program)
        row = session.exec(select(Program).where(Program.program_uuid == program["program_uuid"])).one()
        row.instructions = "Meet weekly"  # a template-level change only
        session.add(row)
        session.commit()
        template_versions.publish(session, admin, 1, program["program_uuid"])
        second = _issue(session, admin, program)
        assert _first_activity(session, second).id == _first_activity(session, first).id
        assert len(session.exec(select(FrozenActivity)).all()) == 2  # one per activity step


def test_plans_issued_before_versioning_keep_their_activity_and_answers():
    with _session() as session:
        admin = _setup(session)
        program = _template_with_activities(session, admin)
        plan = _issue(session, admin, program)
        played = _first_activity(session, plan)
        working = _working(session, program)
        # Simulate a plan issued before versioning: it plays the editable activity itself, and has a run on it.
        objective = session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).first()
        objective.activity_id = working.id
        session.add(objective)
        session.commit()
        run = plan_activities.start_objective_activity(session, LEARNER, plan.slug, objective.objective_uuid)["run"]
        assert run["activity_id"] == working.id
        _add_page(session, working, "Changed after")

        template_versions.publish(session, admin, 1, program["program_uuid"])
        session.refresh(working)
        # The row learners play became that version's frozen copy, untouched; a fresh copy is the new draft.
        assert session.get(FrozenActivity, working.id) and _pages(session, working) == ["What just changed? page", "Changed after"]
        draft = template_versions.working_activity(session, working.objective_id)
        assert draft.id != working.id and session.get(FrozenActivity, draft.id) is None and _pages(session, draft) == _pages(session, working)
        assert session.exec(select(LearningRun).where(LearningRun.run_uuid == run["run_uuid"])).one().activity_id == working.id
        assert get_program(session, admin, 1, program["program_uuid"])["objectives"][0]["activity"]["activity_uuid"] == draft.activity_uuid
        assert played.id != working.id

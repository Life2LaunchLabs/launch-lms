"""Synthetic learner path and invitation fixtures for isolated browser tests."""

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import get_launchlms_config
from sqlalchemy import create_engine
from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.db.organizations import Organization
from src.db.planning import Plan, PlanCreate, PlanInvitationCreate, PlanObjective, PlanObjectiveProgress
from src.db.programs import ObjectiveCreate, ObjectiveKind, ProgramAssignment, ProgramAssignmentCreate, ProgramCreate, ProgramParticipant, ProgramUpdate
from src.db.requirements import RequirementFrameworkCreate, RequirementNodeInput
from src.db.users import PublicUser, User
from src.services import planning, programs, requirements


def main():
    config = get_launchlms_config()
    database_url = os.environ.get("LAUNCHLMS_SQL_CONNECTION_STRING", "")
    if not config.general_config.development_mode or os.environ.get("LAUNCHLMS_UI_TEST_FIXTURES") != "true" or "test" not in database_url:
        raise SystemExit("Learner fixtures require development mode, UI test fixtures, and a test database")
    now = "2026-10-13T12:00:00"
    with Session(create_engine(database_url)) as db:
        admin_row = db.exec(select(User).where(User.email == os.environ["LAUNCHLMS_INITIAL_ADMIN_EMAIL"])).one()
        admin = PublicUser.model_validate(admin_row, from_attributes=True)
        org = db.exec(select(Organization).order_by(Organization.id)).first()
        template = programs.create_program(db, admin, ProgramCreate(org_id=org.id, name="Focused learner path"))
        for title in ["Welcome submission", "Practice activity", "Conclusion step"]:
            template = programs.add_program_objective(db, admin, org.id, template["program_uuid"], ObjectiveCreate(title=title, kind=ObjectiveKind.ACTIVITY))
        programs.update_program(db, admin, org.id, template["program_uuid"], ProgramUpdate(step_order="in_order"))
        for objective in template["objectives"]:
            activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == objective["activity"]["activity_uuid"])).one()
            db.add(LearningPage(activity_id=activity.id, org_id=org.id, page_uuid=f"learning_page_{uuid4()}", page_type=LearningPageType.STANDARD, title="Focused practice", content={"version": 2, "blocks": [{"id": "intro", "type": "text", "content": {"nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Take a moment to practice."}]}]}}]}, creation_date=now, update_date=now))
        db.commit()
        assignment = programs.assign_program(db, admin, org.id, template["program_uuid"], ProgramAssignmentCreate(user_id=admin.id))
        assignment_id = db.exec(select(ProgramAssignment.id).where(ProgramAssignment.assignment_uuid == assignment["assignment_uuid"])).one()
        participant = db.exec(select(ProgramParticipant).where(ProgramParticipant.user_id == admin.id, ProgramParticipant.assignment_id == assignment_id)).one()
        programs.respond_to_invitation(db, admin, org.id, participant.participant_uuid, True)
        plan = db.exec(select(Plan).where(Plan.source_program_id == template["id"], Plan.subject_user_id == admin.id)).one()
        steps = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id).order_by(PlanObjective.position)).all()
        progress = db.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == steps[0].id)).one()
        progress.status = "submitted"
        db.add(progress)
        db.commit()
        # A separate unaccepted organization invitation remains on the landing page.
        invited = programs.create_program(db, admin, ProgramCreate(org_id=org.id, name="Organization invitation test"))
        programs.add_program_objective(db, admin, org.id, invited["program_uuid"], ObjectiveCreate(title="Invited step"))
        programs.assign_program(db, admin, org.id, invited["program_uuid"], ProgramAssignmentCreate(user_id=admin.id))
        inviter_row = User(user_uuid=f"user_{uuid4()}", username=f"fixture-inviter-{uuid4().hex[:6]}", email=f"{uuid4().hex}@example.org", first_name="Personal", last_name="Inviter", creation_date=now, update_date=now)
        db.add(inviter_row)
        db.commit()
        inviter = PublicUser.model_validate(inviter_row, from_attributes=True)
        personal = planning.create_plan(db, inviter, PlanCreate(name="Personal invitation test"))
        planning.create_invitation(db, inviter, personal["slug"], PlanInvitationCreate(email=admin.email, role_key="viewer"))
        framework = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=org.id, name="Manual code editor test", source_metadata={"source_url": "https://example.org/standards"}, nodes=[
            RequirementNodeInput(node_uuid=f"manual-root-{uuid4()}", code="HS.HECPS", title="Higher Education and Career Path Skills", metadata={"reference": "page 1"}),
        ]))
        output = Path(sys.argv[1])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"org_id": org.id, "org_slug": org.slug, "org_name": org.name, "plan_slug": plan.slug, "pending_uuid": steps[0].objective_uuid, "activity_uuid": steps[1].objective_uuid, "framework_uuid": framework["framework_uuid"], "assignment_uuid": assignment["assignment_uuid"]}, indent=2) + "\n")


if __name__ == "__main__":
    main()

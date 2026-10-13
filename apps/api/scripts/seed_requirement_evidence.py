"""Seed synthetic teacher evidence scenarios in a disposable browser-test DB."""

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import get_launchlms_config
from sqlalchemy import create_engine
from sqlmodel import Session, select

from src.db.organizations import Organization
from src.db.planning import Plan, PlanObjective, PlanObjectiveProgressUpdate
from src.db.programs import ObjectiveCreate, ProgramAssignment, ProgramAssignmentCreate, ProgramCreate, ProgramParticipant
from src.db.requirements import RequirementAssignmentCreate, RequirementFrameworkCreate, RequirementNodeInput
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services import plan_admin, planning, requirements
from src.services.programs import add_program_objective, assign_program, create_program, respond_to_invitation


def main():
    config = get_launchlms_config()
    database_url = os.environ.get("LAUNCHLMS_SQL_CONNECTION_STRING", "")
    if not config.general_config.development_mode or os.environ.get("LAUNCHLMS_UI_TEST_FIXTURES") != "true" or "test" not in database_url:
        raise SystemExit("Evidence fixtures require development mode, UI test fixtures, and a test database")
    output = Path(sys.argv[1])
    now = "2026-10-13T12:00:00"
    with Session(create_engine(database_url)) as db:
        admin_row = db.exec(select(User).where(User.email == os.environ["LAUNCHLMS_INITIAL_ADMIN_EMAIL"])).one()
        admin = PublicUser.model_validate(admin_row, from_attributes=True)
        org = db.exec(select(Organization).order_by(Organization.id)).first()
        group = UserGroup(org_id=org.id, usergroup_uuid=f"usergroup_{uuid4()}", name="SB3 evidence test", description="Synthetic browser fixtures", creation_date=now, update_date=now)
        db.add(group)
        db.flush()
        users = []
        for first, last in [("Alex", "Approved"), ("Parker", "Pending")]:
            user = User(user_uuid=f"user_{uuid4()}", username=f"sb3-{first.lower()}-{uuid4().hex[:6]}", email=f"{uuid4().hex}@example.org", first_name=first, last_name=last, creation_date=now, update_date=now)
            db.add(user)
            db.flush()
            db.add(UserOrganization(user_id=user.id, org_id=org.id, role_id=4, creation_date=now, update_date=now))
            db.add(UserGroupUser(usergroup_id=group.id, user_id=user.id, org_id=org.id, creation_date=now, update_date=now))
            users.append(user)
        db.commit()
        framework = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=org.id, name="Oregon SB3 synthetic evidence", source_metadata={"source_url": "https://www.oregon.gov/ode/", "fixture": True}, nodes=[
            RequirementNodeInput(node_uuid="sb3-root", code="HS.HECPS", title="Higher Education and Career Path Skills"),
            RequirementNodeInput(node_uuid="sb3-domain", code="HS.HECPS.D", parent_node_uuid="sb3-root", title="Workforce Readiness"),
            RequirementNodeInput(node_uuid="sb3-resume", code="HS.HECPS.D.2", parent_node_uuid="sb3-domain", title="Resume and portfolio", description="Synthetic standard with an official identifier for layout verification."),
            RequirementNodeInput(node_uuid="sb3-interview", code="HS.HECPS.D.3", parent_node_uuid="sb3-domain", title="Interview skills"),
        ]))
        requirements.publish_framework(db, admin, org.id, framework["framework_uuid"])
        requirements.assign_framework(db, admin, org.id, framework["framework_uuid"], RequirementAssignmentCreate(usergroup_id=group.id))
        program = create_program(db, admin, ProgramCreate(org_id=org.id, name="SB3 Career Path Skills"))
        program = add_program_objective(db, admin, org.id, program["program_uuid"], ObjectiveCreate(
            title="Build a professional resume", requirement_node_uuids=["sb3-resume"], reviewer_guidance="Clear contact details\nRelevant experience",
            custom_fields=[{"field_uuid": "reflection", "title": "Resume reflection", "type": "text"}, {"field_uuid": "resume_link", "title": "Resume document", "type": "link"}],
        ))
        assignment = assign_program(db, admin, org.id, program["program_uuid"], ProgramAssignmentCreate(usergroup_id=group.id, staff_user_ids=[admin.id]))
        assignment_id = db.exec(select(ProgramAssignment.id).where(ProgramAssignment.assignment_uuid == assignment["assignment_uuid"])).one()
        for user in users:
            learner = PublicUser.model_validate(user, from_attributes=True)
            participant = db.exec(select(ProgramParticipant).where(ProgramParticipant.user_id == user.id, ProgramParticipant.assignment_id == assignment_id)).one()
            respond_to_invitation(db, learner, org.id, participant.participant_uuid, True)
            plan = db.exec(select(Plan).where(Plan.subject_user_id == user.id, Plan.source_assignment_id == assignment_id)).one()
            objective = db.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id)).one()
            planning.update_objective_progress(db, learner, plan.plan_uuid, objective.objective_uuid, PlanObjectiveProgressUpdate(status="submitted", field_values={"reflection": f"<p>{user.first_name}'s synthetic resume reflection.</p>", "resume_link": ["https://example.org/synthetic-resume"]}))
            if user.first_name == "Alex":
                plan_admin.decide(db, admin, org.id, objective.objective_uuid, "confirm", "Reviewed against the resume criteria")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"group_id": group.id, "assignment_uuid": assignment["assignment_uuid"], "framework_uuid": framework["framework_uuid"], "org_slug": org.slug, "approved_username": users[0].username, "user_ids": [user.id for user in users]}, indent=2) + "\n")


if __name__ == "__main__":
    main()

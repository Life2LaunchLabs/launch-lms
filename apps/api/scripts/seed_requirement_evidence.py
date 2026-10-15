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

from src.db.goals import Goal, GoalAssignment, GoalAssignmentCreate, GoalStep, StepEntryCreate, StepEntryKind, StepStatus, StepStatusChange
from src.db.organizations import Organization
from src.db.requirements import RequirementAssignmentCreate, RequirementFrameworkCreate, RequirementNodeInput
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services import requirements
from src.services.goals import assignments, goals, review, templates


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
        # One reviewed upload step mapped to the resume standard; the interview standard stays a gap.
        template = templates.create_template(db, admin, org.id, {"template": {"title": "SB3 Career Path Skills"}, "stages": [{"key": "resume", "title": "Resume", "steps": [{
            "key": "resume", "type": "upload", "title": "Build a professional resume", "review_required": True,
            "reviewer_guidance": "Clear contact details\nRelevant experience", "requirement_node_uuids": ["sb3-resume"],
            "config": {"slots": [{"key": "reflection", "label": "Resume reflection", "kinds": ["link"]}, {"key": "resume_link", "label": "Resume document", "kinds": ["link"]}]},
        }]}]})
        templates.publish(db, admin, org.id, template["template_uuid"])
        assignment = assignments.assign(db, admin, org.id, template["template_uuid"], GoalAssignmentCreate(usergroup_id=group.id, staff_user_ids=[admin.id]))
        assignment_id = db.exec(select(GoalAssignment.id).where(GoalAssignment.assignment_uuid == assignment["assignment_uuid"])).one()
        for user in users:
            learner = PublicUser.model_validate(user, from_attributes=True)
            goal = db.exec(select(Goal).where(Goal.subject_user_id == user.id, Goal.assignment_id == assignment_id)).one()
            goals.respond(db, learner, goal.goal_uuid, True)
            step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).one()
            for slot, title, url in [("reflection", f"{user.first_name}'s synthetic resume reflection.", "https://example.org/synthetic-reflection"),
                                     ("resume_link", "Synthetic resume", "https://example.org/synthetic-resume")]:
                goals.add_entry(db, learner, goal.goal_uuid, step.step_uuid, StepEntryCreate(kind=StepEntryKind.LINK, slot=slot, title=title, url=url))
            # Reviewed steps go to staff when the learner finishes them.
            goals.change_status(db, learner, goal.goal_uuid, step.step_uuid, StepStatusChange(status=StepStatus.COMPLETED))
            if user.first_name == "Alex":
                review.decide(db, admin, org.id, step.step_uuid, "confirm", "Reviewed against the resume criteria")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"group_id": group.id, "assignment_uuid": assignment["assignment_uuid"], "framework_uuid": framework["framework_uuid"], "org_slug": org.slug, "approved_username": users[0].username, "user_ids": [user.id for user in users]}, indent=2) + "\n")


if __name__ == "__main__":
    main()

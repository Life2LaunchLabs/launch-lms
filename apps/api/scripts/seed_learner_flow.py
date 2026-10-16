"""Synthetic learner goal and invitation fixtures for isolated browser tests."""

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import get_launchlms_config
from sqlalchemy import create_engine
from sqlmodel import Session, select

from src.db.goals import CompletionMethod, Goal, GoalAssignmentCreate, GoalCreate, GoalStep, StepStatus
from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.db.organizations import Organization
from src.db.goal_sharing import PlanInvitationCreate
from src.db.requirements import RequirementFrameworkCreate, RequirementNodeInput
from src.db.users import PublicUser, User
from src.services import requirements
from src.services.goals import assignments, completion, goals, sharing, templates

PAGE_CONTENT = {"version": 2, "blocks": [{"id": "intro", "type": "text", "content": {"nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Take a moment to practice."}]}]}}]}


def _template(db: Session, admin: PublicUser, org_id: int, title: str, steps: list[dict], step_order: str = "any") -> dict:
    document = {"template": {"title": title, "step_order": step_order}, "stages": [{"key": "path", "title": "Path", "steps": steps}]}
    return templates.create_template(db, admin, org_id, document)


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
        # Three activity steps in order, each with one standard page in its working activity.
        template = _template(db, admin, org.id, "Focused learner path", [
            {"type": "activity", "title": title} for title in ["Welcome submission", "Practice activity", "Conclusion step"]
        ], step_order="in_order")
        for step in template["document"]["stages"][0]["steps"]:
            activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).one()
            db.add(LearningPage(activity_id=activity.id, org_id=org.id, page_uuid=f"learning_page_{uuid4()}", page_type=LearningPageType.STANDARD,
                                title="Focused practice", content=PAGE_CONTENT, creation_date=now, update_date=now))
        db.commit()
        templates.publish(db, admin, org.id, template["template_uuid"], "Browser fixture")
        assignment = assignments.assign(db, admin, org.id, template["template_uuid"], GoalAssignmentCreate(user_id=admin.id))
        goal_uuid = assignment["goal_uuids"][0]
        goals.respond(db, admin, goal_uuid, True)
        goal = db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one()
        steps = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id).order_by(GoalStep.position, GoalStep.id)).all()
        # Activity steps finish on their own, so staff hand the first one in for review.
        completion.set_status(db, goal, steps[0], StepStatus.SUBMITTED, actor_user_id=admin.id, method=CompletionMethod.STAFF)
        # A separate unaccepted organization invitation remains on the landing page.
        invited = _template(db, admin, org.id, "Organization invitation test", [{"type": "task", "title": "Invited step"}])
        templates.publish(db, admin, org.id, invited["template_uuid"])
        assignments.assign(db, admin, org.id, invited["template_uuid"], GoalAssignmentCreate(user_id=admin.id))
        inviter_row = User(user_uuid=f"user_{uuid4()}", username=f"fixture-inviter-{uuid4().hex[:6]}", email=f"{uuid4().hex}@example.org", first_name="Personal", last_name="Inviter", creation_date=now, update_date=now)
        db.add(inviter_row)
        db.commit()
        inviter = PublicUser.model_validate(inviter_row, from_attributes=True)
        personal = goals.create_personal_goal(db, inviter, GoalCreate(title="Personal invitation test"))
        sharing.create_invitation(db, inviter, personal["goal_uuid"], PlanInvitationCreate(email=admin.email, role_key="viewer"))
        framework = requirements.create_framework(db, admin, RequirementFrameworkCreate(org_id=org.id, name="Manual code editor test", source_metadata={"source_url": "https://example.org/standards"}, nodes=[
            RequirementNodeInput(node_uuid=f"manual-root-{uuid4()}", code="HS.HECPS", title="Higher Education and Career Path Skills", metadata={"reference": "page 1"}),
        ]))
        output = Path(sys.argv[1])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({
            "org_id": org.id, "org_slug": org.slug, "org_name": org.name, "goal_uuid": goal_uuid, "pending_uuid": steps[0].step_uuid,
            "activity_uuid": steps[1].step_uuid, "framework_uuid": framework["framework_uuid"], "assignment_uuid": assignment["assignment_uuid"],
        }, indent=2) + "\n")


if __name__ == "__main__":
    main()

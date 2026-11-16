"""Synthetic Connect fixtures for isolated browser tests: a friend's chat, a plan shared with a parent, and a chat report for admins to review."""

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import get_launchlms_config
from sqlalchemy import create_engine
from sqlmodel import Session, select

from src.db.conversations import ChatReportCreate, Conversation, ConversationReport
from src.db.goal_sharing import PlanInvitationCreate
from src.db.goals import Goal, GoalCreate
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.security import security_hash_password
from src.services.connect import chats, people, workspace
from src.services.goals import goals, sharing
from src.services.school import chats as school_chats

NOW = "2026-10-13T12:00:00"


def _person(db: Session, org_id: int, first: str, last: str, password: str | None = None) -> PublicUser:
    row = User(user_uuid=f"user_{uuid4()}", username=f"{first.lower()}-{uuid4().hex[:6]}", email=f"{uuid4().hex}@example.org",
               first_name=first, last_name=last, creation_date=NOW, update_date=NOW, **({"password": security_hash_password(password)} if password else {}))
    db.add(row)
    db.flush()
    db.add(UserOrganization(user_id=row.id, org_id=org_id, role_id=4, creation_date=NOW, update_date=NOW))
    db.commit()
    return PublicUser.model_validate(row, from_attributes=True)


def parent_row_email(db: Session, person: PublicUser) -> str:
    return db.get(User, person.id).email


def main():
    config = get_launchlms_config()
    database_url = os.environ.get("LAUNCHLMS_SQL_CONNECTION_STRING", "")
    if not config.general_config.development_mode or os.environ.get("LAUNCHLMS_UI_TEST_FIXTURES") != "true" or "test" not in database_url:
        raise SystemExit("Connect fixtures require development mode, UI test fixtures, and a test database")
    with Session(create_engine(database_url)) as db:
        admin_row = db.exec(select(User).where(User.email == os.environ["LAUNCHLMS_INITIAL_ADMIN_EMAIL"])).one()
        admin = PublicUser.model_validate(admin_row, from_attributes=True)
        org = db.exec(select(Organization).order_by(Organization.id)).first()
        # The learner's chat with the organization, where their plans talk.
        school_chats.school_chat(db, org.id, admin.id)
        # A friend who already talks with the learner.
        friend = _person(db, org.id, "Jordan", "Friend")
        people.update_settings(db, friend, True)
        direct = chats.ensure_direct(db, friend.id, admin.id)
        chats.post(db, direct, friend.id, "Want to practice interview questions on Thursday?")
        db.commit()
        # A plan the learner shares with a parent, whose earlier answer sits in a plan chat split
        # from their direct chat (as before a plan only two people are on talked in their direct chat).
        parent_password = f"parent-{uuid4().hex}"
        parent = _person(db, org.id, "Melissa", "Parent", parent_password)
        plan = goals.create_personal_goal(db, admin, GoalCreate(title="Explore jobs with animals and art"))
        invitation = sharing.create_invitation(db, admin, plan["goal_uuid"], PlanInvitationCreate(email=parent_row_email(db, parent), role_key="commenter"))
        sharing.respond_to_invitation(db, parent, invitation["invitation_uuid"], True)
        goal = db.exec(select(Goal).where(Goal.goal_uuid == plan["goal_uuid"])).one()
        split = Conversation(conversation_uuid=f"chat_{uuid4()}", kind=workspace.GOAL, direct_key=workspace._goal_key(goal.id), title=goal.title,
                             org_id=goal.org_id, created_by_user_id=admin.id, creation_date=NOW, update_date=NOW)
        db.add(split)
        db.flush()
        workspace._set_members(db, split, {admin.id, parent.id})
        chats.post(db, split, parent.id, "Yes! Let's look at vet tech programs this weekend.")
        db.commit()
        # Two members whose chat ended in a report, for the admin to review in Users.
        reporter, reported = _person(db, org.id, "Riley", "Reporter"), _person(db, org.id, "Casey", "Reported")
        chat = chats.ensure_direct(db, reported.id, reporter.id)
        chats.post(db, chat, reported.id, "Hey, are you in the robotics group?")
        unkind = chats.post(db, chat, reported.id, "Nobody wants you there")
        db.commit()
        chats.report(db, reporter, chat.conversation_uuid, ChatReportCreate(reason="Mean messages", message_uuid=unkind.message_uuid))
        report = db.exec(select(ConversationReport).where(ConversationReport.message_id == unkind.id)).one()
        output = Path(sys.argv[1])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({
            "org_slug": org.slug, "org_name": org.name,
            "friend": {"name": f"{friend.first_name} {friend.last_name}", "username": friend.username},
            "shared_plan": {"goal_uuid": plan["goal_uuid"], "title": goal.title, "parent_reply": "Yes! Let's look at vet tech programs this weekend.",
                            "parent": {"name": "Melissa Parent", "email": parent_row_email(db, parent), "password": parent_password},
                            "learner_name": " ".join(part for part in (admin.first_name, admin.last_name) if part) or admin.username},
            "report": {"report_uuid": report.report_uuid, "reporter": "Riley Reporter", "reported": "Casey Reported", "reason": "Mean messages", "message": "Nobody wants you there"},
        }, indent=2) + "\n")


if __name__ == "__main__":
    main()

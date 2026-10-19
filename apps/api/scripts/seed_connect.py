"""Synthetic Connect fixtures for isolated browser tests: a friend's chat, and a chat report for admins to review."""

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config.config import get_launchlms_config
from sqlalchemy import create_engine
from sqlmodel import Session, select

from src.db.conversations import ChatReportCreate, ConversationReport
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services.connect import chats, people
from src.services.school import chats as school_chats

NOW = "2026-10-13T12:00:00"


def _person(db: Session, org_id: int, first: str, last: str) -> PublicUser:
    row = User(user_uuid=f"user_{uuid4()}", username=f"{first.lower()}-{uuid4().hex[:6]}", email=f"{uuid4().hex}@example.org",
               first_name=first, last_name=last, creation_date=NOW, update_date=NOW)
    db.add(row)
    db.flush()
    db.add(UserOrganization(user_id=row.id, org_id=org_id, role_id=4, creation_date=NOW, update_date=NOW))
    db.commit()
    return PublicUser.model_validate(row, from_attributes=True)


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
            "report": {"report_uuid": report.report_uuid, "reporter": "Riley Reporter", "reported": "Casey Reported", "reason": "Mean messages", "message": "Nobody wants you there"},
        }, indent=2) + "\n")


if __name__ == "__main__":
    main()

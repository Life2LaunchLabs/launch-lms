from sqlmodel import Session, create_engine, select

from src.db.messages import InboxMessage, InboxMessageTemplate
from src.db.organizations import Organization
from src.db.users import PublicUser, User
from src.services import messages


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    for model in (Organization, User, InboxMessageTemplate, InboxMessage):
        model.__table__.create(engine)
    return Session(engine)


def _public_user(user_id: int = 2, email: str = "member@example.com") -> PublicUser:
    return PublicUser(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=f"member{user_id}",
        email=email,
        first_name="Member",
        last_name="Person",
    )


def test_welcome_message_uses_owner_org_template_and_is_idempotent():
    with _session() as db:
        db.add(Organization(id=1, org_uuid="org_owner", name="Launch", slug="launch", email="hello@example.com"))
        db.add(User(id=2, user_uuid="user_2", username="member", email="member@example.com", first_name="M", last_name="P"))
        db.commit()

        first = messages.create_welcome_message(db, 2)
        second = messages.create_welcome_message(db, 2)

        assert first is not None and second is not None
        assert first.message_uuid == second.message_uuid
        assert first.sender_org_id == 1
        assert first.subject == messages.DEFAULT_WELCOME_SUBJECT
        assert len(db.exec(select(InboxMessage)).all()) == 1


def test_platform_template_changes_only_future_welcome_messages():
    with _session() as db:
        db.add(Organization(id=1, org_uuid="org_owner", name="Launch", slug="launch", email="hello@example.com"))
        db.add_all([
            User(id=1, user_uuid="user_1", username="admin", email="admin@example.com", first_name="A", last_name="D"),
            User(id=2, user_uuid="user_2", username="first", email="first@example.com", first_name="F", last_name="One"),
            User(id=3, user_uuid="user_3", username="second", email="second@example.com", first_name="S", last_name="Two"),
        ])
        db.commit()
        first = messages.create_welcome_message(db, 2)
        messages.update_welcome_template(db, _public_user(1, "admin@example.com"), subject="Hello", body="Custom copy")
        second = messages.create_welcome_message(db, 3)

        assert first is not None and first.subject == messages.DEFAULT_WELCOME_SUBJECT
        assert second is not None and (second.subject, second.body) == ("Hello", "Custom copy")
        reset = messages.reset_welcome_template(db)
        assert reset["customized"] is False
        assert reset["subject"] == messages.DEFAULT_WELCOME_SUBJECT


def test_email_addressed_invitation_is_claimed_and_drives_unread_count():
    with _session() as db:
        db.add(Organization(id=1, org_uuid="org_owner", name="Launch", slug="launch", email="hello@example.com"))
        db.add(User(id=2, user_uuid="user_2", username="member", email="member@example.com", first_name="M", last_name="P"))
        messages.create_inbox_message(
            db,
            recipient_email=" Member@Example.com ",
            sender_org_id=1,
            message_type="invitation",
            subject="Join us",
            body="You are invited.",
            action_kind="organization_invitation",
            action_data={"invitation_uuid": "invite_1"},
            dedupe_key="organization_invitation:invite_1",
        )
        db.commit()

        current_user = _public_user()
        inbox = messages.list_my_messages(current_user, db)
        stored = db.exec(select(InboxMessage)).one()
        assert len(inbox) == 1 and inbox[0]["unread"] is True
        assert stored.recipient_user_id == 2

        result = messages.mark_my_messages_viewed(current_user, db)
        db.refresh(stored)
        assert result["updated"] == 1
        assert stored.read_at is not None


def test_message_dedupe_prevents_duplicate_invitation_notifications():
    with _session() as db:
        kwargs = dict(
            recipient_email="member@example.com",
            message_type="invitation",
            subject="Join",
            body="Invitation",
            action_kind="plan_invitation",
            dedupe_key="plan_invitation:invite_1",
        )
        first = messages.create_inbox_message(db, **kwargs)
        db.commit()
        second = messages.create_inbox_message(db, **kwargs)
        assert first.message_uuid == second.message_uuid
        assert len(db.exec(select(InboxMessage)).all()) == 1

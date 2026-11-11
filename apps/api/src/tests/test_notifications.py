"""Email notifications: hand-ins email reviewers (batched), reviews email the person, new plans email them,
and the switches and the unsubscribe link work."""

from datetime import datetime, timedelta

import pytest
from sqlmodel import select

from src.db.notifications import NotificationEvent
from src.db.users import User
from src.services.email import utils as email_utils
from src.services.goals import goals, review
from src.services.notifications import outbox, preferences, unsubscribe
from src.tests.test_goal_review import RESUME, _assigned, _goal, _submit_resume
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _session, _user


@pytest.fixture
def sent(monkeypatch):
    mail: list[dict] = []
    monkeypatch.setattr(email_utils, "send_email", lambda to, subject, body, idempotency_key=None: mail.append({"to": to, "subject": subject, "body": body}) or {"id": "x"})
    return mail


def _later(minutes: float) -> datetime:
    return datetime.utcnow() + timedelta(minutes=minutes)


def _run(db, minutes: float) -> int:
    return outbox.run_due(db.get_bind(), now=_later(minutes))


def test_assigning_a_plan_emails_people_who_have_an_account(sent):
    with _session() as db:
        _assigned(db, RESUME)
        assert _run(db, 0) == 0  # waits a minute, so a burst goes as one email
        assert _run(db, 2) == 2
        by_to = {mail["to"]: mail for mail in sent}
        assert set(by_to) == {"l@example.com", "s@example.com"}
        assert by_to["l@example.com"]["subject"] == "Studio gave you College ready"
        assert "/orgs/studio/plans" in by_to["l@example.com"]["body"] and "Stop these emails" in by_to["l@example.com"]["body"]
        # Sent once only.
        assert _run(db, 30) == 0


def test_hand_ins_email_reviewers_at_most_once_an_hour_and_skip_what_was_reviewed(sent):
    with _session() as db:
        assignment = _assigned(db, RESUME)
        _run(db, 2)
        sent.clear()

        first = _submit_resume(db, LEARNER)
        assert _run(db, 3) == 1
        assert sent[-1]["to"] == "t@example.com" and sent[-1]["subject"] == "Lee Arner handed in Your first resume"
        body = sent[-1]["body"]
        assert f"assignment={assignment['assignment_uuid']}" in body and "step_key=resume" in body and f"focus={first}" in body

        # A second hand-in within the hour waits for the window, then goes in one email with any others.
        _submit_resume(db, OTHER)
        assert _run(db, 10) == 0
        assert _run(db, 64) == 1
        assert sent[-1]["subject"] == "Sam Other handed in Your first resume"

        # Reviewed before the email went: nothing to say.
        goal = _goal(db, LEARNER)
        review.decide(db, _user(ADMIN), 1, first, "flag", "Add your phone number.")
        from src.tests.test_goals import _status
        from src.db.goals import StepStatus
        _status(db, LEARNER, goal, {"step_uuid": first}, StepStatus.SUBMITTED)
        review.decide(db, _user(ADMIN), 1, first, "confirm")
        count = len(sent)
        _run(db, 200)
        assert not [mail for mail in sent[count:] if mail["to"] == "t@example.com"]
        skipped = db.exec(select(NotificationEvent).where(NotificationEvent.kind == "step_submitted", NotificationEvent.status == "skipped")).all()
        assert skipped and skipped[-1].last_error == "no longer relevant"


def test_reviews_email_the_person_with_the_note_and_the_name_they_know(sent):
    with _session() as db:
        _assigned(db, RESUME)
        _run(db, 2)
        sent.clear()
        from src.db.user_organizations import UserOrganization
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == ADMIN)).one()
        membership.learner_name = "Ms. Rivera"
        db.add(membership)
        db.commit()

        step = _submit_resume(db, LEARNER)
        review.decide(db, _user(ADMIN), 1, step, "flag", "Add your phone number.")
        _run(db, 5)
        to_lee = [mail for mail in sent if mail["to"] == "l@example.com"]
        assert len(to_lee) == 1 and to_lee[0]["subject"] == "Changes to make on Your first resume"
        assert "Ms. Rivera sent" in to_lee[0]["body"] and "Add your phone number." in to_lee[0]["body"]
        assert f"/orgs/studio/plans/{_goal(db, LEARNER).goal_uuid}" in to_lee[0]["body"]
        # The reviewer never gets an email about their own review.
        assert not [mail for mail in sent if mail["to"] == "t@example.com" and "Changes" in mail["subject"]]


def test_switched_off_streams_send_nothing_and_the_unsubscribe_link_switches_them_off(sent):
    with _session() as db:
        lee = db.get(User, LEARNER)
        assert [stream["key"] for stream in preferences.view(db, LEARNER)["streams"]] == ["review_results", "new_plans"]
        assert "review_requests" in [stream["key"] for stream in preferences.view(db, ADMIN)["streams"]]

        token = unsubscribe.token(lee, "new_plans")
        assert unsubscribe.resolve(db, token[:-1] + ("0" if token[-1] != "0" else "1")) is None
        assert unsubscribe.resolve(db, token.replace("new_plans", "review_results")) is None
        assert unsubscribe.apply(db, token, False) == "New plans"
        db.refresh(lee)
        assert not preferences.enabled(lee, "new_plans") and preferences.enabled(lee, "review_results")

        _assigned(db, RESUME)
        _run(db, 2)
        assert [mail["to"] for mail in sent] == ["s@example.com"]
        assert db.exec(select(NotificationEvent).where(NotificationEvent.recipient_user_id == LEARNER)).one().status == "skipped"


def test_a_failed_send_is_retried_and_notify_never_breaks_the_change(monkeypatch):
    with _session() as db:
        calls = []

        def flaky(to, subject, body, idempotency_key=None):
            calls.append(idempotency_key)
            if len(calls) == 1:
                raise email_utils.EmailDeliveryError("busy", retryable=True)
            return {"id": "ok"}

        monkeypatch.setattr(email_utils, "send_email", flaky)
        _assigned(db, RESUME)
        _run(db, 2)
        pending = db.exec(select(NotificationEvent).where(NotificationEvent.status == "pending")).all()
        assert len(pending) == 1 and pending[0].attempts == 1
        _run(db, 9)
        assert db.exec(select(NotificationEvent).where(NotificationEvent.status == "sent")).all().__len__() == 2
        # Same email, same idempotency key on the retry.
        assert calls[0] == calls[-1]

        # An unknown kind or a missing recipient queues nothing and raises nothing.
        assert outbox.notify(db, "nope", LEARNER, org_id=1, data={}) is None
        assert outbox.notify(db, "plan_assigned", None, org_id=1, data={}) is None
        assert outbox.notify(db, "plan_assigned", LEARNER, org_id=1, data={}, actor_user_id=LEARNER) is None
        assert goals.list_my_goals(db, _user(LEARNER))

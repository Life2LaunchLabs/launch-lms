"""Invitation emails that the provider refuses or drops: the invitation is kept, the admin is told why,
and short-lived provider hiccups are retried before giving up."""
from types import SimpleNamespace

import pytest
import resend
from starlette.requests import Request
from sqlmodel import Session, select

from src.db.organization_invitations import InviteUsersRequest, OrganizationInvitation
from src.db.users import PublicUser
from src.services.email import utils as email_utils
from src.services.email.utils import EmailDeliveryError
from src.services.orgs import invites as org_invites_service
from src.services.orgs import users as org_users_service
from src.tests.test_organization_invitations import _invitation, _seed, session  # noqa: F401


def _owner() -> PublicUser:
    return PublicUser(id=1, user_uuid="user_1", username="owner", email="owner@example.com", first_name="O", last_name="Wner", is_superadmin=True)


def _request() -> Request:
    return Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": []})


@pytest.fixture
def allow(monkeypatch):
    async def allow_rbac(*_args, **_kwargs):
        return True
    monkeypatch.setattr(org_users_service, "rbac_check", allow_rbac)
    monkeypatch.setattr("src.security.superadmin.is_user_superadmin", lambda *_args, **_kwargs: True)


@pytest.mark.asyncio
async def test_batch_invite_keeps_invitation_and_reports_why_the_email_failed(session: Session, monkeypatch, allow):  # noqa: F811
    _seed(session)

    def send(_org, _user, email, *_args, **_kwargs):
        if email == "bounced@example.com":
            raise EmailDeliveryError("The app's daily email limit is used up, so the email wasn't sent.")
        return True

    monkeypatch.setattr(org_invites_service, "send_direct_invitation_email", send)
    result = await org_users_service.invite_batch_users(
        _request(), 1, InviteUsersRequest(emails=["ok@example.com", "bounced@example.com"], role_id=4), session, _owner(),
    )

    assert result.created == 2
    by_email = {item.email: item for item in result.results}
    assert by_email["ok@example.com"].email_sent is True and by_email["ok@example.com"].detail is None
    assert by_email["bounced@example.com"].email_sent is False
    assert "daily email limit" in by_email["bounced@example.com"].detail
    rows = {row.email: row for row in session.exec(select(OrganizationInvitation)).all()}
    assert rows["ok@example.com"].delivery_status == "delivered"
    assert rows["bounced@example.com"].delivery_status == "delivery_failed"
    assert rows["bounced@example.com"].status == "pending" and rows["bounced@example.com"].delivery_attempts == 1


@pytest.mark.asyncio
async def test_resend_after_a_failed_email_needs_no_wait_and_says_whether_it_sent(session: Session, monkeypatch, allow):  # noqa: F811
    _seed(session)
    from datetime import datetime
    session.add(_invitation(invite_code_uuid=None, email_sent=False, delivery_status="delivery_failed", delivery_attempts=1, last_sent_at=datetime.utcnow()))
    session.commit()

    outcomes = [EmailDeliveryError("Couldn't reach the email provider."), True]
    keys: list[str] = []

    def send(*_args, idempotency_key=None, **_kwargs):
        keys.append(idempotency_key)
        outcome = outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(org_invites_service, "send_direct_invitation_email", send)
    failed = await org_users_service.resend_invited_user(_request(), 1, "invite_1", session, _owner())
    assert failed["email_sent"] is False and "Couldn't reach" in failed["detail"]
    sent = await org_users_service.resend_invited_user(_request(), 1, "invite_1", session, _owner())
    assert sent["email_sent"] is True
    row = session.exec(select(OrganizationInvitation)).one()
    assert row.delivery_status == "delivered" and row.delivery_attempts == 3
    assert keys == ["invite_1:2", "invite_1:3"]

    with pytest.raises(Exception) as too_soon:
        await org_users_service.resend_invited_user(_request(), 1, "invite_1", session, _owner())
    assert getattr(too_soon.value, "status_code", None) == 429


def _mailing():
    return SimpleNamespace(mailing_config=SimpleNamespace(
        email_provider="resend", resend_api_key="re_test", system_email_address="hi@example.com",
    ))


def _resend_error(kind: str, code: str, message: str = "nope"):
    return resend.exceptions.ResendError(code=code, error_type=kind, message=message, suggested_action="")


def test_resend_retries_a_rate_limit_then_sends_once_with_the_same_key(monkeypatch):
    monkeypatch.setattr(email_utils, "get_launchlms_config", _mailing)
    monkeypatch.setattr(email_utils.time, "sleep", lambda _seconds: None)
    calls = []

    def fake_send(params, options=None):
        calls.append(options)
        if len(calls) < 3:
            raise _resend_error("rate_limit_exceeded", "429") if len(calls) == 1 else RuntimeError("Request failed: timed out")
        return {"id": "email_1"}

    monkeypatch.setattr(resend.Emails, "send", fake_send)
    assert email_utils.send_email("a@example.com", "Hi", "<p>Hi</p>", idempotency_key="invite_1:1") == {"id": "email_1"}
    assert calls == [{"idempotency_key": "invite_1:1"}] * 3


@pytest.mark.parametrize(("kind", "code", "message", "expected"), [
    ("daily_quota_exceeded", "429", "You have reached your daily email sending quota.", "daily email limit"),
    ("validation_error", "403", "You can only send testing emails to your own email address. To send emails to other recipients, please verify a domain", "domain is verified"),
    ("invalid_api_key", "403", "API key is invalid", "API key"),
])
def test_resend_does_not_retry_what_waiting_wont_fix(monkeypatch, kind, code, message, expected):
    monkeypatch.setattr(email_utils, "get_launchlms_config", _mailing)
    monkeypatch.setattr(email_utils.time, "sleep", lambda _seconds: pytest.fail("should not wait"))
    calls = []

    def fake_send(params, options=None):
        calls.append(params)
        raise _resend_error(kind, code, message)

    monkeypatch.setattr(resend.Emails, "send", fake_send)
    with pytest.raises(EmailDeliveryError) as failure:
        email_utils.send_email("a@example.com", "Hi", "<p>Hi</p>")
    assert expected in failure.value.reason
    assert len(calls) == 1


def test_resend_gives_up_after_three_tries(monkeypatch):
    monkeypatch.setattr(email_utils, "get_launchlms_config", _mailing)
    monkeypatch.setattr(email_utils.time, "sleep", lambda _seconds: None)
    calls = []

    def fake_send(params, options=None):
        calls.append(params)
        raise _resend_error("application_error", "500")

    monkeypatch.setattr(resend.Emails, "send", fake_send)
    with pytest.raises(EmailDeliveryError) as failure:
        email_utils.send_email("a@example.com", "Hi", "<p>Hi</p>")
    assert "had a problem" in failure.value.reason
    assert len(calls) == 3

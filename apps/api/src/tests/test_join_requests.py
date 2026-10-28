"""Asking to join an invite-only organization: with an account or just an address, and the answer."""

import pytest
from fastapi import HTTPException
from sqlmodel import select
from starlette.requests import Request

from src.db.conversations import ConversationMessage
from src.db.organization_invitations import InviteRecipientResult, InviteUsersResponse, OrganizationInvitation
from src.db.organization_join_requests import JoinRequestCreate, OrganizationJoinRequest
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.services.orgs import join_requests
from src.services.school import chats as school_chats, threads
from src.tests.test_goals import ADMIN, LEARNER, NOW, _session, _user

ASKER = 21
ARI = PublicUser(id=ASKER, user_uuid="user_21", username="ari", email="ari@example.com", first_name="Ari", last_name="Asks")
REQUEST = Request({"type": "http", "scheme": "https", "server": ("studio.example.com", 443), "path": "/", "headers": [], "client": ("1.2.3.4", 1)})


@pytest.fixture
def db(monkeypatch):
    async def invite_only(*_args, **_kwargs):
        return "inviteOnly"

    monkeypatch.setattr("src.services.orgs.orgs.get_org_join_mechanism", invite_only)
    monkeypatch.setattr(join_requests, "check_rate_limit", lambda *_args: (True, 1, 3600))
    emails: list[tuple[str, str]] = []
    monkeypatch.setattr(join_requests, "send_email", lambda to, subject, body: emails.append((to, subject)))
    session = _session()
    OrganizationInvitation.__table__.create(session.get_bind(), checkfirst=True)  # the organization's log lists invitations
    session.add(User(id=ASKER, user_uuid="user_21", username="ari", email="ari@example.com", first_name="Ari", last_name="Asks", creation_date=NOW, update_date=NOW))
    session.commit()
    session.emails = emails  # type: ignore[attr-defined]
    with session:
        yield session


@pytest.mark.asyncio
async def test_someone_with_an_account_asks_and_approving_makes_them_a_learner(db):
    asked = await join_requests.ask(REQUEST, db, ARI, 1, JoinRequestCreate(message="My cousin goes here"))
    assert join_requests.mine(db, ARI, 1) == {"status": "requested", "request_uuid": asked["request_uuid"]}
    # Asking again keeps one request; a member can't ask.
    await join_requests.ask(REQUEST, db, ARI, 1, JoinRequestCreate(message="Please"))
    assert len(db.exec(select(OrganizationJoinRequest)).all()) == 1
    with pytest.raises(HTTPException) as member:
        await join_requests.ask(REQUEST, db, _user(LEARNER), 1, JoinRequestCreate())
    assert member.value.status_code == 409

    # The organization's thread holds the request for staff who answer, and the list row says so.
    org = threads.org_thread(db, _user(ADMIN), 1)
    assert [(row["name"], row["message"]) for row in org["join_requests"]] == [("Ari Asks", "Please")]
    assert threads.pinned(db, _user(ADMIN), 1)[1]["preview"] == "1 person asking to join"
    with pytest.raises(HTTPException) as learner:
        await join_requests.decide(REQUEST, db, _user(LEARNER), asked["request_uuid"], True)
    assert learner.value.status_code == 403

    answered = await join_requests.decide(REQUEST, db, _user(ADMIN), asked["request_uuid"], True)
    assert answered["status"] == "approved" and not answered["invited"]
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == ASKER, UserOrganization.org_id == 1)).one().role_id == 4
    chat = school_chats.find(db, 1, ASKER)
    assert chat and "approved your request to join" in db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == chat.id)).all()[-1].body
    assert db.emails == [("ari@example.com", "You're in Studio")]
    assert {"join_asked", "join_answered"} <= {entry["kind"] for entry in threads.org_log(db, 1)}
    with pytest.raises(HTTPException) as twice:
        await join_requests.decide(REQUEST, db, _user(ADMIN), asked["request_uuid"], False)
    assert twice.value.status_code == 409


@pytest.mark.asyncio
async def test_an_address_without_an_account_is_invited_when_approved_and_a_full_org_says_so(db, monkeypatch):
    with pytest.raises(HTTPException) as no_email:
        await join_requests.ask(REQUEST, db, AnonymousUser(), 1, JoinRequestCreate(name="Bo"))
    assert no_email.value.status_code == 400
    asked = await join_requests.ask(REQUEST, db, AnonymousUser(), 1, JoinRequestCreate(email="bo@example.com", name="Bo"))
    invited: list[list[str]] = []

    async def invite(_request, _org_id, payload, _db, _user):
        invited.append(payload.emails)
        return InviteUsersResponse(created=1, results=[InviteRecipientResult(email=payload.emails[0], status="invited")])

    monkeypatch.setattr("src.services.orgs.users.invite_batch_users", invite)
    answered = await join_requests.decide(REQUEST, db, _user(ADMIN), asked["request_uuid"], True)
    # The invitation email carries them through signup; no second email.
    assert answered["invited"] and invited == [["bo@example.com"]] and db.emails == []

    # Ari asks while there are no seats: approving says so, and the request still waits.
    ari = await join_requests.ask(REQUEST, db, ARI, 1, JoinRequestCreate())

    def full(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="This organization has reached its limit of 25 learners")

    monkeypatch.setattr(join_requests, "require_capacity", full)
    with pytest.raises(HTTPException) as seats:
        await join_requests.decide(REQUEST, db, _user(ADMIN), ari["request_uuid"], True)
    assert seats.value.status_code == 403 and "limit" in seats.value.detail
    assert join_requests.mine(db, ARI, 1)["status"] == "requested"
    declined = await join_requests.decide(REQUEST, db, _user(ADMIN), ari["request_uuid"], False)
    assert declined["status"] == "declined" and db.emails == [("ari@example.com", "Your request to join Studio")]

"""The invite landing page names who sent the invitation, the organization, the role and the group."""

import hashlib
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from src.db.organization_invitations import OrganizationJoinLink
from src.services.orgs import invite_landing
from src.tests.test_organization_invitations import NOW, _invitation, _seed, session  # noqa: F401


def test_an_invitation_names_who_sent_it_and_the_address_it_went_to(session: Session):  # noqa: F811
    _seed(session)
    session.add(_invitation(created_by_user_id=1, usergroup_id=1))
    session.add(_invitation(invitation_uuid="invite_2", role_id=1, expires_at=NOW - timedelta(days=1)))
    session.commit()

    card = invite_landing.preview(session, 1, invitation="invite_1")
    assert (card["kind"], card["status"], card["role"], card["group"], card["email"]) == ("invitation", "pending", "learner", "Blue group", "pending@example.com")
    assert card["inviter"]["name"] == "O Wner" and card["org"]["name"] == "Studio"
    expired = invite_landing.preview(session, 1, invitation="invite_2")
    assert (expired["status"], expired["role"], expired["inviter"]) == ("expired", "admin", None)
    # Another organization's invitation, or a made-up one, isn't found.
    for org_id, token in ((2, "invite_1"), (1, "nope")):
        with pytest.raises(HTTPException) as missing:
            invite_landing.preview(session, org_id, invitation=token)
        assert missing.value.status_code == 404


def test_a_join_link_says_when_it_can_no_longer_be_used(session: Session):  # noqa: F811
    _seed(session)
    session.add(OrganizationJoinLink(
        link_uuid="link_1", token_hash=hashlib.sha256(b"secret").hexdigest(), org_id=1, role_id=4, usergroup_id=1,
        max_redemptions=2, redemption_count=0, created_by_user_id=1, expires_at=NOW + timedelta(days=3),
    ))
    session.commit()

    card = invite_landing.preview(session, 1, invite_code="secret")
    assert (card["kind"], card["status"], card["group"], card["email"]) == ("link", "pending", "Blue group", None)
    link = session.get(OrganizationJoinLink, 1)
    assert link is not None
    link.redemption_count = 2
    session.commit()
    assert invite_landing.preview(session, 1, invite_code="secret")["status"] == "used_up"
    link.redemption_count, link.status = 0, "revoked"
    session.commit()
    assert invite_landing.preview(session, 1, invite_code="secret")["status"] == "revoked"

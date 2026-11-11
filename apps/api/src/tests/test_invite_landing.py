"""The invite landing page names who sent the invitation, the organization, the role and the group."""

import hashlib
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.organizations import Organization
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
    # A made-up one isn't found, nor any on a site that doesn't exist.
    for org_id, token in ((9, "invite_1"), (1, "nope")):
        with pytest.raises(HTTPException) as missing:
            invite_landing.preview(session, org_id, invitation=token)
        assert missing.value.status_code == 404
    # Opened on another organization's site (FEED-83: the email linked the main site), the card still
    # names the invitation's own organization, so the page can move there.
    session.add(Organization(id=2, org_uuid="org_2", name="Main", slug="main", email="main@example.com"))
    session.commit()
    elsewhere = invite_landing.preview(session, 2, invitation="invite_1")
    assert (elsewhere["org"]["slug"], elsewhere["email"]) == ("studio", "pending@example.com")


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


def test_accepting_in_the_app_names_the_org_and_role_to_open(session: Session):  # noqa: F811
    # FEED-84/95: a helper who accepted a staff invite in Connect stayed on their personal Goals.
    _seed(session)
    session.add(_invitation(role_id=2))
    session.add(_invitation(invitation_uuid="invite_2", role_id=4))
    session.commit()

    staff = session.exec(select(OrganizationInvitation).where(OrganizationInvitation.invitation_uuid == "invite_1")).one()
    learner = session.exec(select(OrganizationInvitation).where(OrganizationInvitation.invitation_uuid == "invite_2")).one()
    assert invite_landing.accepted(session, staff) == {"org_slug": "studio", "role": "staff"}
    assert invite_landing.accepted(session, learner) == {"org_slug": "studio", "role": "learner"}

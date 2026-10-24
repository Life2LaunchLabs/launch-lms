"""Signed Open Badges 3.0: each award is signed by its issuer's key (published as did:web), carries a status list slot, and can be revoked."""

import copy

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.audit_logs import AuditLog
from src.db.badges import BadgeAward
from src.db.organizations import Organization
from src.services.badges import awards, direct, open_badges, signing
from src.tests.plan_world import PARTNER, _assign, _finish, _goal_of, _world
from src.tests.test_badge_direct import STAFF, _payload, _people
from src.tests.test_goals import ADMIN, LEARNER, _user


def test_an_award_is_signed_by_its_issuer_and_verifies_until_tampered_with():
    db, (plan, _) = _world()
    with db:
        _finish(db, _goal_of(db, _assign(db, PARTNER, plan.template_uuid)))
        award = db.exec(select(BadgeAward)).one()
        partner = db.get(Organization, PARTNER)
        credential = award.credential
        assert credential["proof"]["cryptosuite"] == "eddsa-rdfc-2022" and credential["proof"]["proofValue"].startswith("z")
        assert credential["issuer"]["id"] == signing.did(partner) and credential["proof"]["verificationMethod"] == f"{signing.did(partner)}#key-1"
        assert credential["credentialStatus"]["statusListIndex"] == "0" and credential["credentialStatus"]["statusListCredential"].endswith(f"/status/{partner.org_uuid}")
        assert signing.verify(db, credential)
        # The served credential is the one issued.
        assert open_badges.credential(db, award) == credential

        changed = copy.deepcopy(credential)
        changed["credentialSubject"]["achievement"]["name"] = "Something else"
        assert not signing.verify(db, changed)

        document = signing.did_document(db, partner)
        assert document["id"] == signing.did(partner) and document["assertionMethod"] == [f"{signing.did(partner)}#key-1"]
        assert signing.public_key(document["verificationMethod"][0]["publicKeyMultibase"])


def test_awards_from_before_signing_are_signed_when_first_asked_for():
    db, (plan, _) = _world()
    with db:
        _finish(db, _goal_of(db, _assign(db, PARTNER, plan.template_uuid)))
        award = db.exec(select(BadgeAward)).one()
        award.credential, award.status_list_index = None, None
        db.add(award)
        db.commit()
        signed = open_badges.credential(db, award)
        assert signing.verify(db, signed) and db.get(BadgeAward, award.id).credential == signed


def test_revoking_sets_its_status_bit_frees_the_badge_and_needs_review_work():
    db, (plan, other) = _world()
    with db:
        _people(db)
        AuditLog.__table__.create(db.get_bind(), checkfirst=True)
        direct.award_directly(db, _user(ADMIN), PARTNER, _payload(other.template_uuid, user_ids=[LEARNER]))
        _finish(db, _goal_of(db, _assign(db, PARTNER, plan.template_uuid)))
        award = awards.held(db, plan.id, LEARNER)
        assert award.status_list_index == 1
        partner = db.get(Organization, PARTNER)
        listed = signing.status_list(db, partner)
        assert signing.verify(db, listed) and not signing.is_set(listed["credentialSubject"]["encodedList"], 1)

        with pytest.raises(HTTPException) as denied:
            awards.revoke(db, _user(STAFF), award.award_uuid, "Awarded by mistake")
        assert denied.value.status_code == 403
        with pytest.raises(HTTPException):
            awards.revoke(db, _user(ADMIN), award.award_uuid, " ")

        revoked = awards.revoke(db, _user(ADMIN), award.award_uuid, "Awarded by mistake")
        assert revoked.status == "revoked" and awards.award_dict(db, revoked)["revoked_reason"] == "Awarded by mistake"
        listed = signing.status_list(db, partner)
        assert signing.is_set(listed["credentialSubject"]["encodedList"], 1) and not signing.is_set(listed["credentialSubject"]["encodedList"], 0)
        # It no longer counts: not in their portfolio, and the badge can be awarded again.
        assert [item.template_id for item in awards.awards_of(db, LEARNER)] == [other.id]
        assert len(awards.awards_of(db, LEARNER, revoked=True)) == 2
        again = direct.award_directly(db, _user(ADMIN), PARTNER, _payload(plan.template_uuid, user_ids=[LEARNER]))
        assert len(again["awarded"]) == 1 and again["awarded"][0]["status"] == "active"
        assert db.exec(select(AuditLog).where(AuditLog.action == "badge.revoke")).one().request_metadata["reason"] == "Awarded by mistake"


def test_base58_and_status_lists_round_trip():
    for data in (b"", b"\0\0abc", bytes(range(40))):
        assert signing.b58decode(signing.b58encode(data)) == data
    encoded = signing.encoded_list([0, 9, 131071])
    assert encoded.startswith("u") and [signing.is_set(encoded, index) for index in (0, 1, 9, 131071)] == [True, False, True, True]

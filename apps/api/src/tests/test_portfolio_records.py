import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.media import MediaAsset
from src.db.portfolio import PublishRequest, TimelineEntryCreate
from src.db.portfolio_records import (
    ContactWrite,
    CredentialWrite,
    DocumentWrite,
    IdentityUpdate,
    PortfolioQuote,
    QuoteWrite,
    ResumeVersionWrite,
)
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services import portfolio as service, portfolio_identity, portfolio_records as records
from src.tests.test_portfolio import _public, _session, _user


def _learner(db, published=False):
    user = _user()
    db.add_all([user, Role(id=1, name="member")])
    db.commit()
    db.add(UserOrganization(user_id=1, org_id=1, role_id=1, creation_date="", update_date=""))
    db.commit()
    actor = _public(user)
    if published:
        portfolio = service.get_or_create_portfolio(actor, db)
        service.publish_portfolio(PublishRequest(revision=portfolio.revision, privacy_confirmed=True), actor, db)
    return actor


def _asset(db, asset_uuid="ast_1", media_type="image", owner=1):
    db.add(MediaAsset(asset_uuid=asset_uuid, owner_user_id=owner, owner_type="user", source_type="upload", media_type=media_type, url=f"/content/{asset_uuid}"))
    db.commit()


def test_name_you_go_by_is_shown_and_the_legal_name_is_kept():
    with _session() as db:
        actor = _learner(db)

        identity = portfolio_identity.update_identity(IdentityUpdate(preferred_name="Mya"), actor, db)

        assert identity == {"first_name": "Maya", "last_name": "Rivera", "preferred_name": "Mya", "legal_name": "Maya Rivera", "shown_name": "Mya"}
        assert service._get_portfolio(db, 1).display_name == "Mya"
        assert service.get_owner_shell(actor, db)["identity"]["legal_name"] == "Maya Rivera"
        # Going by your own first name is the same as not saying.
        assert portfolio_identity.update_identity(IdentityUpdate(preferred_name="Maya"), actor, db)["preferred_name"] == ""
        with pytest.raises(HTTPException):
            portfolio_identity.update_identity(IdentityUpdate(first_name=" "), actor, db)


def test_credentials_link_to_the_timeline_and_a_photo_counts_as_evidence():
    with _session() as db:
        actor = _learner(db)
        _asset(db)
        school = service.create_timeline(TimelineEntryCreate(title="Riverbend High School", entry_type="education"), actor, db)

        diploma = records.create_credential(CredentialWrite(kind="diploma", name="High school diploma", issuer="Riverbend High School", issued_on="2025-06", timeline_uuid=school["timeline_uuid"]), actor, db)
        card = records.create_credential(CredentialWrite(name="Oregon Food Handler Card", expires_on="2028-06", photo_asset_uuid="ast_1"), actor, db)
        score = records.create_credential(CredentialWrite(kind="test_score", name="SAT", score="1280"), actor, db)

        assert diploma["timeline_uuid"] == school["timeline_uuid"] and diploma["verification_status"] == "self_reported"
        assert card["verification_status"] == "photo_on_file" and card["photo_url"] == "/content/ast_1"
        assert score["visibility"] == "private"
        with pytest.raises(HTTPException):
            records.create_credential(CredentialWrite(name="CPR", issued_on="June 2026"), actor, db)
        with pytest.raises(HTTPException):
            records.update_credential(card["credential_uuid"], CredentialWrite(photo_asset_uuid="ast_someone_else"), actor, db)
        assert records.update_credential(card["credential_uuid"], CredentialWrite(photo_asset_uuid=None), actor, db)["verification_status"] == "self_reported"


def test_people_without_accounts_and_quotes_you_add_yourself():
    with _session() as db:
        actor = _learner(db)
        jordan = records.create_contact(ContactWrite(name="Jordan Lee", role_label="Owner, Tacos La Estrella", email="jordan@example.com", is_reference=True, note="Ask before the summer"), actor, db)

        quote = records.create_quote(QuoteWrite(contact_uuid=jordan["contact_uuid"], body="Best trainer we've had."), actor, db)

        assert jordan["on_app"] is False and jordan["is_reference"] is True
        assert quote["status"] == "self_reported" and quote["confirmed"] is False and quote["name"] == "Jordan Lee"
        with pytest.raises(HTTPException):
            records.create_quote(QuoteWrite(contact_uuid=jordan["contact_uuid"], body=" "), actor, db)
        records.delete_contact(jordan["contact_uuid"], actor, db)
        assert db.exec(select(PortfolioQuote)).all() == []


def test_editing_a_confirmed_quote_makes_it_yours_again():
    with _session() as db:
        actor = _learner(db)
        contact = records.create_contact(ContactWrite(name="Priya Shah"), actor, db)
        quote = records.create_quote(QuoteWrite(contact_uuid=contact["contact_uuid"], body="She asked the hard questions."), actor, db)
        row = db.exec(select(PortfolioQuote)).one()
        row.status, row.confirmed_at = "confirmed", "2026-10-29"
        db.add(row)
        db.commit()

        assert records.update_quote(quote["quote_uuid"], QuoteWrite(featured=True), actor, db)["confirmed"] is True
        assert records.update_quote(quote["quote_uuid"], QuoteWrite(body="She asked the best questions."), actor, db)["status"] == "self_reported"


def test_visitors_see_public_credentials_and_quotes_only():
    with _session() as db:
        actor = _learner(db, published=True)
        _asset(db, "ast_pdf", "document")
        records.create_credential(CredentialWrite(name="CPR / AED"), actor, db)
        records.create_credential(CredentialWrite(kind="test_score", name="SAT", score="1280"), actor, db)
        contact = records.create_contact(ContactWrite(name="Jordan Lee", email="jordan@example.com", note="private note"), actor, db)
        records.create_quote(QuoteWrite(contact_uuid=contact["contact_uuid"], body="Shows up early."), actor, db)
        records.create_quote(QuoteWrite(contact_uuid=contact["contact_uuid"], body="Hidden one.", visibility="private"), actor, db)
        requested = PortfolioQuote(quote_uuid="quo_req", portfolio_id=1, contact_id=1, body="", status="requested")
        db.add(requested)
        db.commit()
        records.create_document(DocumentWrite(title="My CIS PEP (2026)", kind="archive", media_asset_uuid="ast_pdf"), actor, db, source="cis")
        records.create_resume_version(ResumeVersionWrite(name="Design jobs"), actor, db)

        public = service.get_public_shell(1, "maya", db)
        owner = service.get_owner_shell(actor, db)

        assert [item["name"] for item in public["credentials"]] == ["CPR / AED"]
        assert [item["body"] for item in public["quotes"]] == ["Shows up early."]
        assert "status" not in public["quotes"][0] and "contact_uuid" not in public["quotes"][0]
        assert {"contacts", "documents", "resume_versions"}.isdisjoint(public)
        assert public["identity"] == {"shown_name": "Maya Rivera"}
        assert "jordan@example.com" not in str(public) and "private note" not in str(public)
        assert len(owner["credentials"]) == 2 and len(owner["quotes"]) == 3
        assert owner["documents"][0]["visibility"] == "private" and owner["documents"][0]["source"] == "cis"


def test_resume_versions_copy_and_only_take_off_known_items():
    with _session() as db:
        actor = _learner(db)
        design = records.create_resume_version(ResumeVersionWrite(name="Design jobs", layout="modern", excluded=["section:refs", "timeline:tim_1"]), actor, db)

        food = records.create_resume_version(ResumeVersionWrite(name="Food service", copy_from_uuid=design["version_uuid"]), actor, db)

        assert food["layout"] == "modern" and food["excluded"] == ["section:refs", "timeline:tim_1"]
        assert records.create_resume_version(ResumeVersionWrite(), actor, db)["name"] == "Version 3"
        with pytest.raises(HTTPException):
            records.update_resume_version(food["version_uuid"], ResumeVersionWrite(excluded=["drop table"]), actor, db)
        with pytest.raises(HTTPException):
            records.update_resume_version(food["version_uuid"], ResumeVersionWrite(layout="fancy"), actor, db)


def test_records_belong_to_their_owner():
    with _session() as db:
        actor = _learner(db)
        card = records.create_credential(CredentialWrite(name="CPR"), actor, db)
        other = User(id=2, user_uuid="user_2", username="sam", first_name="Sam", last_name="Okafor", email="sam@example.com", email_verified=True, profile={}, details={})
        db.add(other)
        db.commit()

        with pytest.raises(HTTPException) as error:
            records.delete_credential(card["credential_uuid"], _public(other), db)
        assert error.value.status_code == 404

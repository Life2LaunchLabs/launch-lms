"""Credentials, people and quotes, résumé versions and documents on a learner's own portfolio."""

import re
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.media import MediaAsset
from src.db.portfolio import Portfolio, PortfolioVisibility, ProjectItem, TimelineEntry
from src.db.portfolio_records import (
    ContactWrite,
    Credential,
    CredentialKind,
    CredentialWrite,
    DocumentWrite,
    PortfolioContact,
    PortfolioDocument,
    PortfolioQuote,
    QuoteStatus,
    QuoteWrite,
    ResumeVersion,
    ResumeVersionWrite,
)
from src.db.users import PublicUser, User
from src.services import portfolio as portfolio_service
from src.services.portfolio_display import display_for_shell
from src.services.portfolio_identity import identity_dto, shown_name

MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
RESUME_LAYOUTS = {"classic", "modern", "compact"}
RESUME_ACCENTS = {"blue", "violet", "teal", "pink", "orange", "ink"}
DOCUMENT_KINDS = {"upload", "resume", "archive"}
EXCLUDABLE = re.compile(r"^(section:[a-z_]+|timeline:[\w-]+|credential:[\w-]+)$")


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def _private(item) -> bool:
    return _value(item.visibility) == PortfolioVisibility.PRIVATE.value


def _month(value: str | None, field: str) -> str | None:
    if value in (None, ""):
        return None
    if not MONTH.match(value):
        raise HTTPException(status_code=422, detail=f"{field} must be a month like 2026-05")
    return value


def _owned(model, uuid_field: str, uuid: str, portfolio: Portfolio, db_session: Session):
    row = db_session.exec(select(model).where(getattr(model, uuid_field) == uuid, model.portfolio_id == portfolio.id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


def _asset(asset_uuid: str | None, user_id: int, db_session: Session, kinds: set[str]) -> int | None:
    if not asset_uuid:
        return None
    asset = db_session.exec(select(MediaAsset).where(MediaAsset.asset_uuid == asset_uuid, MediaAsset.owner_user_id == user_id)).first()
    if not asset or _value(asset.media_type) not in kinds:
        raise HTTPException(status_code=422, detail="File is not one of your uploads")
    return asset.id


def _timeline_id(timeline_uuid: str | None, portfolio: Portfolio, db_session: Session) -> int | None:
    if not timeline_uuid:
        return None
    return _owned(TimelineEntry, "timeline_uuid", timeline_uuid, portfolio, db_session).id


def _uuid_of(model, uuid_field: str, row_id: int | None, db_session: Session) -> str | None:
    if not row_id:
        return None
    row = db_session.get(model, row_id)
    return getattr(row, uuid_field) if row else None


def _url(asset_id: int | None, db_session: Session) -> str:
    asset = db_session.get(MediaAsset, asset_id) if asset_id else None
    return asset.url if asset else ""


def _touch(row, db_session: Session) -> None:
    row.update_date = portfolio_service._now()
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)


def _created(row, portfolio: Portfolio, db_session: Session) -> None:
    """Commits a new record through the portfolio, so plan steps it satisfies finish."""
    row.creation_date = row.update_date = portfolio_service._now()
    db_session.add(row)
    portfolio_service._save(portfolio, db_session, row.creation_date)
    db_session.refresh(row)


# ---------------------------------------------------------------- credentials

def credential_dto(item: Credential, db_session: Session, public_only: bool = False) -> dict:
    dto = {
        "credential_uuid": item.credential_uuid, "kind": item.kind, "name": item.name, "issuer": item.issuer,
        "issued_on": item.issued_on, "expires_on": item.expires_on, "expected_on": item.expected_on, "score": item.score,
        "verification_status": item.verification_status, "photo_url": _url(item.photo_asset_id, db_session),
        "timeline_uuid": _uuid_of(TimelineEntry, "timeline_uuid", item.timeline_entry_id, db_session), "featured": item.featured,
    }
    return dto if public_only else dto | {"visibility": _value(item.visibility), "source": item.source, "sort_order": item.sort_order}


def _apply_credential(item: Credential, payload: CredentialWrite, current_user: PublicUser, portfolio: Portfolio, db_session: Session) -> None:
    values = payload.model_dump(exclude_unset=True)
    for field in ("issued_on", "expires_on", "expected_on"):
        if field in values:
            setattr(item, field, _month(values[field], field))
    for field in ("issuer", "score"):
        if field in values:
            setattr(item, field, (values[field] or "").strip())
    for field in ("featured", "visibility"):
        if values.get(field) is not None:
            setattr(item, field, values[field])
    if values.get("kind"):
        item.kind = _value(values["kind"])
    if "name" in values:
        item.name = (values["name"] or "").strip()
    if "photo_asset_uuid" in values:
        item.photo_asset_id = _asset(values["photo_asset_uuid"], current_user.id, db_session, {"image"})
        # A photo of the card is evidence; an issuer's confirmation stays verified.
        if item.verification_status != "verified":
            item.verification_status = "photo_on_file" if item.photo_asset_id else "self_reported"
    if "timeline_uuid" in values:
        item.timeline_entry_id = _timeline_id(values["timeline_uuid"], portfolio, db_session)
    if not item.name:
        raise HTTPException(status_code=422, detail="Name is required")


def create_credential(payload: CredentialWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    kind = _value(payload.kind or CredentialKind.CARD)
    # Test scores are private until the learner chooses to show one.
    visibility = PortfolioVisibility.PRIVATE if kind == CredentialKind.TEST_SCORE.value else PortfolioVisibility.PUBLIC
    item = Credential(credential_uuid=f"crd_{uuid4().hex}", portfolio_id=portfolio.id or 0, kind=kind, name="", visibility=visibility)
    _apply_credential(item, payload, current_user, portfolio, db_session)
    _created(item, portfolio, db_session)
    return credential_dto(item, db_session)


def update_credential(credential_uuid: str, payload: CredentialWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(Credential, "credential_uuid", credential_uuid, portfolio, db_session)
    _apply_credential(item, payload, current_user, portfolio, db_session)
    _touch(item, db_session)
    return credential_dto(item, db_session)


def delete_credential(credential_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    db_session.delete(_owned(Credential, "credential_uuid", credential_uuid, portfolio, db_session))
    db_session.commit()
    return {"success": True}


# ---------------------------------------------------------------- people and quotes

def contact_dto(item: PortfolioContact, db_session: Session) -> dict:
    return {
        "contact_uuid": item.contact_uuid, "name": item.name, "role_label": item.role_label, "email": item.email,
        "phone": item.phone, "note": item.note, "is_reference": item.is_reference, "on_app": item.linked_user_id is not None,
        "timeline_uuid": _uuid_of(TimelineEntry, "timeline_uuid", item.timeline_entry_id, db_session), "source": item.source,
    }


def _apply_contact(item: PortfolioContact, payload: ContactWrite, portfolio: Portfolio, db_session: Session) -> None:
    values = payload.model_dump(exclude_unset=True)
    for field in ("name", "role_label", "email", "phone", "note"):
        if field in values:
            setattr(item, field, (values[field] or "").strip())
    if values.get("is_reference") is not None:
        item.is_reference = values["is_reference"]
    if "timeline_uuid" in values:
        item.timeline_entry_id = _timeline_id(values["timeline_uuid"], portfolio, db_session)
    if not item.name:
        raise HTTPException(status_code=422, detail="Name is required")


def create_contact(payload: ContactWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = PortfolioContact(contact_uuid=f"ctc_{uuid4().hex}", portfolio_id=portfolio.id or 0, name="")
    _apply_contact(item, payload, portfolio, db_session)
    _created(item, portfolio, db_session)
    return contact_dto(item, db_session)


def update_contact(contact_uuid: str, payload: ContactWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(PortfolioContact, "contact_uuid", contact_uuid, portfolio, db_session)
    _apply_contact(item, payload, portfolio, db_session)
    _touch(item, db_session)
    return contact_dto(item, db_session)


def delete_contact(contact_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(PortfolioContact, "contact_uuid", contact_uuid, portfolio, db_session)
    for quote in db_session.exec(select(PortfolioQuote).where(PortfolioQuote.contact_id == item.id)).all():
        db_session.delete(quote)
    db_session.delete(item)
    db_session.commit()
    return {"success": True}


def quote_dto(item: PortfolioQuote, db_session: Session, public_only: bool = False) -> dict:
    contact = db_session.get(PortfolioContact, item.contact_id)
    dto = {
        "quote_uuid": item.quote_uuid, "body": item.body, "confirmed": item.status == QuoteStatus.CONFIRMED.value,
        "name": contact.name if contact else "", "role_label": contact.role_label if contact else "",
        "timeline_uuid": _uuid_of(TimelineEntry, "timeline_uuid", item.timeline_entry_id, db_session),
        "project_uuid": _uuid_of(ProjectItem, "project_uuid", item.project_item_id, db_session), "featured": item.featured,
    }
    if public_only:
        return dto
    return dto | {"status": item.status, "visibility": _value(item.visibility), "contact_uuid": contact.contact_uuid if contact else None}


def _apply_quote(item: PortfolioQuote, payload: QuoteWrite, portfolio: Portfolio, db_session: Session) -> None:
    values = payload.model_dump(exclude_unset=True)
    if values.get("contact_uuid"):
        item.contact_id = _owned(PortfolioContact, "contact_uuid", values["contact_uuid"], portfolio, db_session).id
    if "body" in values:
        body = (values["body"] or "").strip()
        # Changing a confirmed quote's words makes it the learner's own again.
        if item.status == QuoteStatus.CONFIRMED.value and body != item.body:
            item.status, item.confirmed_at = QuoteStatus.SELF_REPORTED.value, None
        item.body = body
    if "timeline_uuid" in values:
        item.timeline_entry_id = _timeline_id(values["timeline_uuid"], portfolio, db_session)
    if "project_uuid" in values:
        item.project_item_id = _owned(ProjectItem, "project_uuid", values["project_uuid"], portfolio, db_session).id if values["project_uuid"] else None
    for field in ("featured", "visibility"):
        if values.get(field) is not None:
            setattr(item, field, values[field])
    if not item.contact_id:
        raise HTTPException(status_code=422, detail="Say who it's from")
    if not item.body:
        raise HTTPException(status_code=422, detail="Add what they said")


def create_quote(payload: QuoteWrite, current_user: PublicUser, db_session: Session) -> dict:
    """A quote the learner has in hand. Asking someone by email is a separate flow."""
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = PortfolioQuote(quote_uuid=f"quo_{uuid4().hex}", portfolio_id=portfolio.id or 0, contact_id=0)
    _apply_quote(item, payload, portfolio, db_session)
    _created(item, portfolio, db_session)
    return quote_dto(item, db_session)


def update_quote(quote_uuid: str, payload: QuoteWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(PortfolioQuote, "quote_uuid", quote_uuid, portfolio, db_session)
    _apply_quote(item, payload, portfolio, db_session)
    _touch(item, db_session)
    return quote_dto(item, db_session)


def delete_quote(quote_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    db_session.delete(_owned(PortfolioQuote, "quote_uuid", quote_uuid, portfolio, db_session))
    db_session.commit()
    return {"success": True}


# ---------------------------------------------------------------- résumé versions

def resume_version_dto(item: ResumeVersion) -> dict:
    return {"version_uuid": item.version_uuid, "name": item.name, "layout": item.layout, "accent": item.accent, "excluded": list(item.excluded or []), "sort_order": item.sort_order}


def _apply_resume_version(item: ResumeVersion, payload: ResumeVersionWrite) -> None:
    values = payload.model_dump(exclude_unset=True, exclude={"copy_from_uuid"})
    if "name" in values:
        item.name = (values["name"] or "").strip()
    if values.get("layout") is not None:
        if values["layout"] not in RESUME_LAYOUTS:
            raise HTTPException(status_code=422, detail="Unknown layout")
        item.layout = values["layout"]
    if values.get("accent") is not None:
        if values["accent"] not in RESUME_ACCENTS:
            raise HTTPException(status_code=422, detail="Unknown accent")
        item.accent = values["accent"]
    if values.get("excluded") is not None:
        if not all(EXCLUDABLE.match(key) for key in values["excluded"]):
            raise HTTPException(status_code=422, detail="Unknown item on the résumé")
        item.excluded = sorted(set(values["excluded"]))
    if not item.name:
        raise HTTPException(status_code=422, detail="Name the version")


def create_resume_version(payload: ResumeVersionWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    count = len(db_session.exec(select(ResumeVersion.id).where(ResumeVersion.portfolio_id == portfolio.id)).all())
    item = ResumeVersion(version_uuid=f"rsv_{uuid4().hex}", portfolio_id=portfolio.id or 0, name=f"Version {count + 1}", sort_order=count)
    if payload.copy_from_uuid:
        source = _owned(ResumeVersion, "version_uuid", payload.copy_from_uuid, portfolio, db_session)
        item.layout, item.accent, item.excluded = source.layout, source.accent, list(source.excluded or [])
    _apply_resume_version(item, payload)
    item.creation_date = item.update_date = portfolio_service._now()
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return resume_version_dto(item)


def update_resume_version(version_uuid: str, payload: ResumeVersionWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(ResumeVersion, "version_uuid", version_uuid, portfolio, db_session)
    _apply_resume_version(item, payload)
    _touch(item, db_session)
    return resume_version_dto(item)


def delete_resume_version(version_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    db_session.delete(_owned(ResumeVersion, "version_uuid", version_uuid, portfolio, db_session))
    db_session.commit()
    return {"success": True}


# ---------------------------------------------------------------- documents

def document_dto(item: PortfolioDocument, db_session: Session) -> dict:
    asset = db_session.get(MediaAsset, item.media_asset_id) if item.media_asset_id else None
    return {
        "document_uuid": item.document_uuid, "kind": item.kind, "title": item.title, "source": item.source,
        "visibility": _value(item.visibility), "url": asset.url if asset else "", "filename": asset.filename if asset else None,
        "creation_date": item.creation_date,
    }


def _apply_document(item: PortfolioDocument, payload: DocumentWrite, current_user: PublicUser, db_session: Session) -> None:
    values = payload.model_dump(exclude_unset=True)
    if "title" in values:
        item.title = (values["title"] or "").strip()
    if values.get("kind") is not None:
        if values["kind"] not in DOCUMENT_KINDS:
            raise HTTPException(status_code=422, detail="Unknown document kind")
        item.kind = values["kind"]
    if values.get("visibility") is not None:
        item.visibility = values["visibility"]
    if "media_asset_uuid" in values:
        item.media_asset_id = _asset(values["media_asset_uuid"], current_user.id, db_session, {"image", "document"})
    if not item.title:
        raise HTTPException(status_code=422, detail="Title is required")
    if not item.media_asset_id:
        raise HTTPException(status_code=422, detail="Attach a file")


def create_document(payload: DocumentWrite, current_user: PublicUser, db_session: Session, source: str = "manual") -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = PortfolioDocument(document_uuid=f"doc_{uuid4().hex}", portfolio_id=portfolio.id or 0, title="", source=source)
    _apply_document(item, payload, current_user, db_session)
    item.creation_date = item.update_date = portfolio_service._now()
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    return document_dto(item, db_session)


def update_document(document_uuid: str, payload: DocumentWrite, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    item = _owned(PortfolioDocument, "document_uuid", document_uuid, portfolio, db_session)
    _apply_document(item, payload, current_user, db_session)
    _touch(item, db_session)
    return document_dto(item, db_session)


def delete_document(document_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = portfolio_service.get_or_create_portfolio(current_user, db_session)
    db_session.delete(_owned(PortfolioDocument, "document_uuid", document_uuid, portfolio, db_session))
    db_session.commit()
    return {"success": True}


# ---------------------------------------------------------------- the shell

def _rows(model, portfolio: Portfolio, db_session: Session, order):
    return list(db_session.exec(select(model).where(model.portfolio_id == portfolio.id).order_by(*order)).all())


def records_for_shell(portfolio: Portfolio, db_session: Session, public_only: bool = False) -> dict:
    """What the portfolio shell adds for these records. Visitors never see contacts, documents,
    résumé versions, private items, or quotes that are only requested."""
    user = db_session.get(User, portfolio.user_id)
    credentials = _rows(Credential, portfolio, db_session, (Credential.sort_order, Credential.id))
    quotes = _rows(PortfolioQuote, portfolio, db_session, (PortfolioQuote.id,))
    if public_only:
        credentials = [item for item in credentials if not _private(item)]
        quotes = [item for item in quotes if not _private(item) and item.body and item.status != QuoteStatus.REQUESTED.value]
        return display_for_shell(portfolio) | {
            "identity": {"shown_name": shown_name(user)} if user else None,
            "credentials": [credential_dto(item, db_session, True) for item in credentials],
            "quotes": [quote_dto(item, db_session, True) for item in quotes],
        }
    return display_for_shell(portfolio) | {
        "identity": identity_dto(user) if user else None,
        "credentials": [credential_dto(item, db_session) for item in credentials],
        "quotes": [quote_dto(item, db_session) for item in quotes],
        "contacts": [contact_dto(item, db_session) for item in _rows(PortfolioContact, portfolio, db_session, (PortfolioContact.sort_order, PortfolioContact.id))],
        "resume_versions": [resume_version_dto(item) for item in _rows(ResumeVersion, portfolio, db_session, (ResumeVersion.sort_order, ResumeVersion.id))],
        "documents": [document_dto(item, db_session) for item in _rows(PortfolioDocument, portfolio, db_session, (PortfolioDocument.id,))],
    }

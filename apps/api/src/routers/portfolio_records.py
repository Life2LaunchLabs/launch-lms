from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.portfolio_records import (
    ContactWrite,
    CredentialWrite,
    DocumentWrite,
    HighlightsUpdate,
    IdentityUpdate,
    LayoutUpdate,
    QuoteWrite,
    ResultWrite,
    ResumeVersionWrite,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import portfolio_display, portfolio_identity, portfolio_records as records, portfolio_results as results

router = APIRouter()
User = Depends(get_current_user)
Db = Depends(get_db_session)


@router.patch("/me/identity")
async def api_update_identity(payload: IdentityUpdate, current_user: PublicUser = User, db_session: Session = Db):
    return portfolio_identity.update_identity(payload, current_user, db_session)


@router.put("/me/highlights")
async def api_update_highlights(payload: HighlightsUpdate, current_user: PublicUser = User, db_session: Session = Db):
    return portfolio_display.update_highlights(payload, current_user, db_session)


@router.put("/me/layout")
async def api_update_layout(payload: LayoutUpdate, current_user: PublicUser = User, db_session: Session = Db):
    return portfolio_display.update_layout(payload, current_user, db_session)


@router.post("/me/credentials")
async def api_create_credential(payload: CredentialWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.create_credential(payload, current_user, db_session)


@router.patch("/me/credentials/{credential_uuid}")
async def api_update_credential(credential_uuid: str, payload: CredentialWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.update_credential(credential_uuid, payload, current_user, db_session)


@router.delete("/me/credentials/{credential_uuid}")
async def api_delete_credential(credential_uuid: str, current_user: PublicUser = User, db_session: Session = Db):
    return records.delete_credential(credential_uuid, current_user, db_session)


@router.post("/me/contacts")
async def api_create_contact(payload: ContactWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.create_contact(payload, current_user, db_session)


@router.patch("/me/contacts/{contact_uuid}")
async def api_update_contact(contact_uuid: str, payload: ContactWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.update_contact(contact_uuid, payload, current_user, db_session)


@router.delete("/me/contacts/{contact_uuid}")
async def api_delete_contact(contact_uuid: str, current_user: PublicUser = User, db_session: Session = Db):
    return records.delete_contact(contact_uuid, current_user, db_session)


@router.post("/me/quotes")
async def api_create_quote(payload: QuoteWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.create_quote(payload, current_user, db_session)


@router.patch("/me/quotes/{quote_uuid}")
async def api_update_quote(quote_uuid: str, payload: QuoteWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.update_quote(quote_uuid, payload, current_user, db_session)


@router.delete("/me/quotes/{quote_uuid}")
async def api_delete_quote(quote_uuid: str, current_user: PublicUser = User, db_session: Session = Db):
    return records.delete_quote(quote_uuid, current_user, db_session)


@router.post("/me/resume-versions")
async def api_create_resume_version(payload: ResumeVersionWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.create_resume_version(payload, current_user, db_session)


@router.patch("/me/resume-versions/{version_uuid}")
async def api_update_resume_version(version_uuid: str, payload: ResumeVersionWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.update_resume_version(version_uuid, payload, current_user, db_session)


@router.delete("/me/resume-versions/{version_uuid}")
async def api_delete_resume_version(version_uuid: str, current_user: PublicUser = User, db_session: Session = Db):
    return records.delete_resume_version(version_uuid, current_user, db_session)


@router.post("/me/documents")
async def api_create_document(payload: DocumentWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.create_document(payload, current_user, db_session)


@router.patch("/me/documents/{document_uuid}")
async def api_update_document(document_uuid: str, payload: DocumentWrite, current_user: PublicUser = User, db_session: Session = Db):
    return records.update_document(document_uuid, payload, current_user, db_session)


@router.delete("/me/documents/{document_uuid}")
async def api_delete_document(document_uuid: str, current_user: PublicUser = User, db_session: Session = Db):
    return records.delete_document(document_uuid, current_user, db_session)


@router.post("/me/results")
async def api_create_result(payload: ResultWrite, current_user: PublicUser = User, db_session: Session = Db):
    return results.create_result(payload, current_user, db_session)


@router.patch("/me/results/{result_uuid}")
async def api_update_result(result_uuid: str, payload: ResultWrite, current_user: PublicUser = User, db_session: Session = Db):
    return results.update_result(result_uuid, payload, current_user, db_session)


@router.delete("/me/results/{result_uuid}")
async def api_delete_result(result_uuid: str, current_user: PublicUser = User, db_session: Session = Db):
    return results.delete_result(result_uuid, current_user, db_session)

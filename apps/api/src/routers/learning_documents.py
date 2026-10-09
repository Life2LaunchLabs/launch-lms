from pathlib import Path

from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import PlainTextResponse
from src.core.events.database import get_db_session
from src.security.auth import get_current_user
from src.services.learning_documents import store
from src.services.learning_documents.models import (
    ActivityDocumentCreate,
    ActivityDocumentSave,
    activity_document_json_schema,
)

router = APIRouter()
GUIDE_PATH = Path(__file__).resolve().parents[1] / "services" / "learning_documents" / "authoring_guide.md"


@router.get("/schema")
async def api_activity_document_schema() -> dict:
    return activity_document_json_schema()


@router.get("/guide", response_class=PlainTextResponse)
async def api_activity_document_guide() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")


@router.post("/validate")
async def api_validate_activity_document(
    request: Request,
    document: dict = Body(..., embed=True),
    activity_uuid: str | None = Body(default=None, embed=True),
    badge_uuid: str | None = Body(default=None, embed=True),
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await store.validate_activity_document(
        request, document, current_user, db_session, activity_uuid=activity_uuid, badge_uuid=badge_uuid
    )


@router.post("/")
async def api_create_activity_from_document(
    request: Request,
    payload: ActivityDocumentCreate,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await store.create_activity_from_document(request, payload, current_user, db_session)


@router.get("/{activity_uuid}")
async def api_get_activity_document(
    request: Request,
    activity_uuid: str,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await store.get_activity_document(request, activity_uuid, current_user, db_session)


@router.put("/{activity_uuid}")
async def api_save_activity_document(
    request: Request,
    activity_uuid: str,
    payload: ActivityDocumentSave,
    current_user=Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> dict:
    return await store.save_activity_document(request, activity_uuid, payload, current_user, db_session)

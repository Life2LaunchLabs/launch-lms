"""POST /translate: organization and outside text in the learner's language (see services/translation)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.translation import content

router = APIRouter()


class TranslateRequest(BaseModel):
    language: str = Field(max_length=8)
    texts: list[str] = Field(default_factory=list, max_length=content.MAX_TEXTS)


@router.post("")
async def api_translate(
    payload: TranslateRequest,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    return await content.translate(db_session, current_user.id, payload.texts, payload.language.lower().split("-")[0])

"""A person's language, saved on their account: GET/PUT /users/me/language."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.routers.users import _invalidate_session_cache
from src.security.auth import get_authenticated_user
from src.services.users import language as user_language

router = APIRouter()


class LanguageChoice(BaseModel):
    # None clears the saved language, so the browser's language applies again.
    language: str | None = None


@router.get("/me/language")
async def api_get_my_language(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    return user_language.get_language(db_session, current_user)


@router.put("/me/language")
async def api_save_my_language(
    payload: LanguageChoice,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_authenticated_user),
):
    result = user_language.save_language(db_session, current_user, payload.language)
    # The session (and the saved language in it) is cached; drop it so other devices see the change.
    _invalidate_session_cache(current_user.id)
    return result

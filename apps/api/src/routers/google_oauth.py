"""Google sign-in, using the keys from Platform › Settings (or the environment). The web reaches it through /api/auth/google/*."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from fastapi import HTTPException
from pydantic import BaseModel, Field

from src.services.auth import google_oauth

router = APIRouter()


class AuthorizeRequest(BaseModel):
    redirect_uri: str = Field(min_length=1, max_length=2048)
    state: str = Field(default="", max_length=4096)
    scope: str = Field(default="openid email profile", max_length=512)


class TokenRequest(BaseModel):
    code: str = Field(min_length=1, max_length=4096)
    redirect_uri: str = Field(min_length=1, max_length=2048)


def _error(error: HTTPException) -> JSONResponse:
    # The web reads `error` from these two responses.
    return JSONResponse({"error": error.detail}, status_code=error.status_code)


@router.get("/status")
def google_status():
    """Whether Google sign-in is on, so sign-in pages can show the button."""
    return {"enabled": google_oauth.enabled()}


@router.post("/authorize")
def google_authorize(body: AuthorizeRequest):
    try:
        return {"url": google_oauth.authorize_url(body.redirect_uri, body.state, body.scope)}
    except HTTPException as error:
        return _error(error)


@router.post("/token")
async def google_token(body: TokenRequest):
    try:
        return await google_oauth.exchange_code(body.code, body.redirect_uri)
    except HTTPException as error:
        return _error(error)

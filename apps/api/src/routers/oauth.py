import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from src.core.events.database import get_db_session
from src.db.users import AnonymousUser, PublicUser
from src.security.auth import get_current_user
from src.services.oauth import server
from src.services.oauth.config import (
    OAuthError,
    authorization_server_metadata,
    connector_enabled,
    protected_resource_metadata,
)
from src.services.security.rate_limiting import check_rate_limit, get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter()
well_known_router = APIRouter()
NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


def _require_enabled() -> None:
    if not connector_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _error(exc: OAuthError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.body(), headers=NO_STORE)


def _limit(request: Request, name: str, attempts: int, window: int) -> None:
    try:
        allowed, _, retry_after = check_rate_limit(f"oauth:{name}:{get_client_ip(request)}", attempts, window)
    except Exception:  # Rate limiting is best effort when Redis is unavailable.
        logger.warning("OAuth rate limiting unavailable", exc_info=True)
        return
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": str(retry_after)})


async def _form(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        body = await request.json()
        return {key: str(value) for key, value in (body or {}).items() if value is not None}
    form = await request.form()
    return {key: str(value) for key, value in form.items()}


def _user(current_user: PublicUser | AnonymousUser) -> PublicUser:
    if not isinstance(current_user, PublicUser):
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return current_user


class AuthorizationBody(BaseModel):
    client_id: str
    redirect_uri: str
    code_challenge: str = ""
    code_challenge_method: str = "S256"
    response_type: str = "code"
    scope: str | None = None
    state: str | None = None
    resource: str | None = None


class DecisionBody(AuthorizationBody):
    approve: bool
    org_id: int | None = None


def _authorization(body: AuthorizationBody) -> server.AuthorizationRequest:
    return server.AuthorizationRequest(**body.model_dump(exclude={"approve", "org_id"}))


@well_known_router.get("/.well-known/oauth-authorization-server")
async def api_authorization_server_metadata() -> JSONResponse:
    _require_enabled()
    return JSONResponse(authorization_server_metadata())


@well_known_router.get("/.well-known/oauth-protected-resource")
@well_known_router.get("/.well-known/oauth-protected-resource/api/v1/mcp")
async def api_protected_resource_metadata() -> JSONResponse:
    _require_enabled()
    return JSONResponse(protected_resource_metadata())


@router.post("/register", status_code=201)
async def api_register_client(request: Request, db_session=Depends(get_db_session)):
    _require_enabled()
    _limit(request, "register", 20, 3600)
    try:
        metadata = await request.json()
    except ValueError:
        return _error(OAuthError("invalid_client_metadata", "Body must be JSON"))
    try:
        return JSONResponse(status_code=201, content=server.register_client(db_session, metadata or {}), headers=NO_STORE)
    except OAuthError as exc:
        return _error(exc)


@router.post("/token")
async def api_token(request: Request, db_session=Depends(get_db_session)):
    _require_enabled()
    _limit(request, "token", 60, 60)
    try:
        return JSONResponse(server.exchange_token(db_session, await _form(request), request.headers.get("authorization")), headers=NO_STORE)
    except OAuthError as exc:
        return _error(exc)


@router.post("/revoke")
async def api_revoke(request: Request, db_session=Depends(get_db_session)):
    _require_enabled()
    try:
        server.revoke_token(db_session, await _form(request), request.headers.get("authorization"))
    except OAuthError as exc:
        if exc.error == "invalid_client":
            return _error(exc)
    return Response(status_code=200, headers=NO_STORE)


@router.post("/authorize/validate")
async def api_validate_authorization(
    body: AuthorizationBody, current_user=Depends(get_current_user), db_session=Depends(get_db_session)
):
    _require_enabled()
    try:
        return server.validate_authorization(db_session, _authorization(body), _user(current_user))
    except OAuthError as exc:
        return _error(exc)


@router.post("/authorize/decision")
async def api_authorization_decision(
    body: DecisionBody, current_user=Depends(get_current_user), db_session=Depends(get_db_session)
):
    _require_enabled()
    try:
        redirect_to = server.decide_authorization(
            db_session, _authorization(body), _user(current_user), approve=body.approve, org_id=body.org_id
        )
    except OAuthError as exc:
        return _error(exc)
    return {"redirect_to": redirect_to}


@router.get("/connections")
async def api_list_connections(current_user=Depends(get_current_user), db_session=Depends(get_db_session)):
    _require_enabled()
    return server.list_grants(db_session, _user(current_user))


@router.delete("/connections/{connection_id}")
async def api_disconnect(connection_id: str, current_user=Depends(get_current_user), db_session=Depends(get_db_session)):
    _require_enabled()
    try:
        server.disconnect(db_session, _user(current_user), connection_id)
    except OAuthError as exc:
        return _error(exc)
    return {"detail": "Disconnected"}

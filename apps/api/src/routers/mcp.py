from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from src.core.events.database import get_db_session
from src.services.mcp.protocol import handle_message
from src.services.oauth.config import connector_enabled, www_authenticate
from src.services.oauth.server import resolve_access_token

router = APIRouter()


def _unauthorized(error: str | None = None, description: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"error": error or "unauthorized", "error_description": description or "Connect Launch LMS to continue"},
        headers={"WWW-Authenticate": www_authenticate(error, description)},
    )


@router.post("")
async def mcp_endpoint(request: Request, db_session=Depends(get_db_session)):
    if not connector_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    # Only OAuth access tokens are accepted here: never cookies, never API tokens.
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        return _unauthorized()
    context = resolve_access_token(db_session, authorization[7:].strip())
    if context is None:
        return _unauthorized("invalid_token", "The access token is invalid or expired")
    try:
        payload = await request.json()
    except ValueError:
        return JSONResponse(status_code=400, content={"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
    messages = payload if isinstance(payload, list) else [payload]
    responses = [response for message in messages if (response := await handle_message(request, db_session, context, message)) is not None]
    if not responses:
        return Response(status_code=202)
    return JSONResponse(responses if isinstance(payload, list) else responses[0])


@router.get("")
@router.delete("")
async def mcp_unsupported_method():
    # Stateless server: no server-initiated SSE stream and no sessions to end.
    return Response(status_code=405, headers={"Allow": "POST"})


"""Resolve isolated requests before any authentication or DB dependency runs."""

import hmac
import os
import re

from fastapi import HTTPException, Request
from sqlmodel import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from src.core.events.database import engine
from src.services.demo.access import claims
from src.services.demo.context import DemoContext, current_demo
from src.services.demo.lifecycle import active_session
from src.services.demo.namespaces import schema_signature

BOARD_SESSION = re.compile(
    r"/boards/board_demo_([0-9a-f]{32})_[0-9a-f]{32}/(?:ydoc|demo-active|demo-context)$"
)


class DemoMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        payload = claims(request)
        identifier = payload.get("demo_session")
        board = BOARD_SESSION.search(request.url.path)
        if board:
            expected = os.getenv("COLLAB_INTERNAL_KEY", "")
            if not expected or not hmac.compare_digest(
                request.headers.get("x-internal-key", ""), expected
            ):
                return JSONResponse(
                    {"detail": "Invalid collaboration credential"}, status_code=403
                )
            identifier = board.group(1)
        isolated_ids = set(re.findall(r"_demo_([0-9a-f]{32})_", request.url.path))
        if isolated_ids and (not identifier or isolated_ids != {identifier}):
            return JSONResponse(
                {"detail": "This file belongs to another demo session."},
                status_code=403,
            )
        demo_host = os.getenv("LAUNCHLMS_DEMO_HOST", "demo.life2launch.app")
        hostname = (
            request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        ).split(":")[0]
        on_demo_host = hostname == demo_host or hostname.endswith("." + demo_host)
        if (
            on_demo_host
            and not identifier
            and not request.url.path.startswith(
                ("/api/v1/demo/", "/api/v1/instance/", "/api/v1/health")
            )
        ):
            return JSONResponse(
                {"detail": "Start a demo session first."}, status_code=401
            )
        context_token = None
        try:
            if identifier and not request.url.path.startswith("/api/v1/demo/"):
                with Session(engine) as db:
                    session = active_session(db, identifier)
                    if session.schema_signature != schema_signature():
                        from src.services.demo.lifecycle import end

                        end(db, identifier)
                        raise HTTPException(
                            401, "The demo was updated. Start a fresh session."
                        )
                    request.state.demo_namespace = session.namespace
                    request.state.demo_session_id = session.id
                    request.state.demo_aliases = session.aliases
                    # Stored HTML/Yjs links can retain source owner UUIDs. Resolve
                    # those links into this copy; never fetch their live counterparts.
                    path = request.scope["path"]
                    for old, new in session.aliases.items():
                        path = path.replace(old, new)
                    request.scope["path"] = path
                    request.scope["raw_path"] = path.encode()
                    if hasattr(request, "_url"):
                        del request._url
                    context_token = current_demo.set(
                        DemoContext(session.id, session.namespace, session.visitor_id)
                    )
                path = request.url.path
                # Features with provider-side effects require an explicit demo adapter.
                blocked = (
                    path.startswith(
                        (
                            "/api/v1/payments",
                            "/api/v1/superadmin",
                            "/api/v1/analytics",
                            "/api/v1/internal",
                            "/api/v1/candidate",
                            "/api/v1/operations",
                        )
                    )
                    or "/api-tokens" in path
                    or "/sso" in path
                    or "/custom-domain" in path
                    or (
                        path.startswith("/api/v1/auth/")
                        and not path.endswith(("/refresh", "/logout"))
                    )
                )
                if blocked:
                    raise HTTPException(
                        403,
                        "This action is unavailable in the demo because it changes an external service. Badges, plans and chat remain available.",
                    )
            response = await call_next(request)
            if identifier:
                response.headers["Cache-Control"] = "no-store"
            return response
        except HTTPException as exc:
            return JSONResponse(
                {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
            )
        finally:
            if context_token is not None:
                current_demo.reset(context_token)

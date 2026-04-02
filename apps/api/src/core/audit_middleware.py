from datetime import datetime, timezone

from fastapi import Request
from sqlmodel import Session, select

from src.core.events.database import engine
from src.db.organizations import Organization
from src.security.auth import decode_jwt, extract_jwt_from_request
from src.services.audit_logs import record_audit_log, resolve_user_snapshot
from src.services.users.users import security_get_user


AUDITED_PREFIXES = (
    "/api/v1/orgs",
    "/api/v1/roles",
    "/api/v1/users",
    "/api/v1/superadmin",
    "/api/v1/audit_logs",
)


async def log_request_audit_event(request: Request, status_code: int) -> None:
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    if not request.url.path.startswith(AUDITED_PREFIXES):
        return

    token = extract_jwt_from_request(request)
    user_id = None
    username = None
    full_name = None
    if token:
        payload = decode_jwt(token)
        email = payload.get("sub") if payload else None
        if email:
            with Session(engine) as db_session:
                user = await security_get_user(request, db_session, email=email)
                if user:
                    user_id = user.id
                    username, full_name = resolve_user_snapshot(db_session, user.id)

    org_id = None
    path_params = getattr(request, "path_params", {}) or {}
    if "org_id" in path_params:
        try:
            org_id = int(path_params["org_id"])
        except (TypeError, ValueError):
            org_id = None
    if org_id is None:
        query_org = request.query_params.get("org_id")
        if query_org:
            try:
                org_id = int(query_org)
            except ValueError:
                org_id = None
    if org_id is None and "orgslug" in path_params:
        with Session(engine) as db_session:
            org = db_session.exec(select(Organization).where(Organization.slug == path_params["orgslug"])).first()
            org_id = org.id if org else None

    with Session(engine) as db_session:
        record_audit_log(
            db_session,
            action=f"{request.method} {request.url.path}",
            resource=request.url.path,
            status_code=status_code,
            org_id=org_id,
            user_id=user_id,
            username=username,
            name=full_name,
            ip_address=request.client.host if request.client else None,
            request_metadata={
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query),
                "logged_at": datetime.now(timezone.utc).isoformat(),
            },
        )

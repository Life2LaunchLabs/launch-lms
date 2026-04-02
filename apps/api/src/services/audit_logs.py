import csv
import io
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, func

from src.db.audit_logs import AuditLog
from src.db.users import User
from src.security.org_auth import is_org_admin
from src.security.superadmin import is_user_superadmin


def record_audit_log(
    db_session: Session,
    *,
    action: str,
    resource: str,
    status_code: int,
    org_id: int | None = None,
    user_id: int | None = None,
    username: str | None = None,
    name: str | None = None,
    ip_address: str | None = None,
    request_metadata: dict[str, Any] | None = None,
) -> None:
    log = AuditLog(
        org_id=org_id,
        user_id=user_id,
        username=username,
        name=name,
        action=action,
        resource=resource,
        status_code=status_code,
        ip_address=ip_address,
        request_metadata=request_metadata or {},
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db_session.add(log)
    db_session.commit()


def _require_audit_access(user_id: int, org_id: int, db_session: Session) -> None:
    if is_user_superadmin(user_id, db_session):
        return
    if not is_org_admin(user_id, org_id, db_session):
        raise HTTPException(status_code=403, detail="Audit log access requires organization admin privileges")


def query_audit_logs(
    db_session: Session,
    *,
    current_user_id: int,
    org_id: int,
    offset: int = 0,
    limit: int = 20,
    user_id: int | None = None,
    username: str | None = None,
    name: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    status_code: int | None = None,
    ip_address: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    _require_audit_access(current_user_id, org_id, db_session)

    statement = select(AuditLog).where(AuditLog.org_id == org_id)
    if user_id is not None:
        statement = statement.where(AuditLog.user_id == user_id)
    if username:
        statement = statement.where(AuditLog.username.ilike(f"%{username}%"))
    if name:
        statement = statement.where(AuditLog.name.ilike(f"%{name}%"))
    if action:
        statement = statement.where(AuditLog.action.ilike(f"%{action}%"))
    if resource:
        statement = statement.where(AuditLog.resource.ilike(f"%{resource}%"))
    if status_code is not None:
        statement = statement.where(AuditLog.status_code == status_code)
    if ip_address:
        statement = statement.where(AuditLog.ip_address.ilike(f"%{ip_address}%"))
    if start_date:
        statement = statement.where(AuditLog.created_at >= start_date)
    if end_date:
        statement = statement.where(AuditLog.created_at <= end_date)

    total = db_session.exec(select(func.count()).select_from(statement.subquery())).one()
    items = db_session.exec(
        statement.order_by(AuditLog.created_at.desc()).offset(offset).limit(min(limit, 100))
    ).all()
    return {
        "items": [
            {
                **item.model_dump(),
                "metadata": item.request_metadata or {},
            }
            for item in items
        ],
        "total": total,
        "offset": offset,
        "limit": min(limit, 100),
    }


def export_audit_logs_csv(db_session: Session, *, current_user_id: int, org_id: int, **filters: Any) -> StreamingResponse:
    result = query_audit_logs(
        db_session,
        current_user_id=current_user_id,
        org_id=org_id,
        offset=0,
        limit=10000,
        **filters,
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["created_at", "org_id", "user_id", "username", "name", "action", "resource", "status_code", "ip_address", "metadata"])
    for item in result["items"]:
        writer.writerow([
            item.get("created_at", ""),
            item.get("org_id", ""),
            item.get("user_id", ""),
            item.get("username", ""),
            item.get("name", ""),
            item.get("action", ""),
            item.get("resource", ""),
            item.get("status_code", ""),
            item.get("ip_address", ""),
            item.get("metadata", {}),
        ])
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv")


def resolve_user_snapshot(db_session: Session, user_id: int | None) -> tuple[str | None, str | None]:
    if not user_id:
        return None, None
    user = db_session.exec(select(User).where(User.id == user_id)).first()
    if not user:
        return None, None
    full_name = " ".join(part for part in [user.first_name, user.last_name] if part).strip() or None
    return user.username, full_name

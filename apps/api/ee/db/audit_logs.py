# Re-export the core AuditLog model so the table is only defined once.
# The core model (src.db.audit_logs) owns the "auditlog" table definition.
from typing import Optional, List
from sqlmodel import SQLModel
from src.db.audit_logs import AuditLog

__all__ = ["AuditLog", "AuditLogRead", "AuditLogPaginated"]


class AuditLogRead(SQLModel):
    id: int
    org_id: Optional[int] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    name: Optional[str] = None
    action: str
    resource: str
    resource_id: Optional[str] = None
    method: Optional[str] = None
    path: Optional[str] = None
    status_code: int
    ip_address: Optional[str] = None
    payload: Optional[dict] = None
    request_metadata: Optional[dict] = None
    created_at: Optional[str] = None
    avatar_url: Optional[str] = None


class AuditLogPaginated(SQLModel):
    items: List[AuditLogRead]
    total: int
    limit: int
    offset: int

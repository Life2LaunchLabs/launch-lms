from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.audit_logs import export_audit_logs_csv, query_audit_logs

router = APIRouter()


@router.get("/")
async def list_audit_logs(
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
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return query_audit_logs(
        db_session,
        current_user_id=current_user.id,
        org_id=org_id,
        offset=offset,
        limit=limit,
        user_id=user_id,
        username=username,
        name=name,
        action=action,
        resource=resource,
        status_code=status_code,
        ip_address=ip_address,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/export")
async def export_audit_logs(
    org_id: int,
    user_id: int | None = None,
    username: str | None = None,
    name: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    status_code: int | None = None,
    ip_address: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return export_audit_logs_csv(
        db_session,
        current_user_id=current_user.id,
        org_id=org_id,
        user_id=user_id,
        username=username,
        name=name,
        action=action,
        resource=resource,
        status_code=status_code,
        ip_address=ip_address,
        start_date=start_date,
        end_date=end_date,
    )

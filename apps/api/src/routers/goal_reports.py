"""Group reports for staff: a group's plans and badges, who's behind and what's left; sent as chat cards."""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.routers.goal_admin import _require_group_plans
from src.security.auth import get_current_user
from src.services.goals import reports
from src.services.goals.reports import GroupReportSend

router = APIRouter()


def _uuids(frameworks: str | None) -> list[str]:
    return [item.strip() for item in (frameworks or "").split(",") if item.strip()]


@router.get("/groups/{usergroup_id}/report")
def api_group_report(usergroup_id: int, org_id: int, frameworks: str | None = Query(default=None, description="Comma-separated framework uuids to include"),
                     db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_group_plans(org_id, db)
    return reports.group_report(db, user, org_id, usergroup_id, _uuids(frameworks))


@router.post("/groups/{usergroup_id}/report/send")
def api_group_report_send(usergroup_id: int, org_id: int, payload: GroupReportSend, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    _require_group_plans(org_id, db)
    return reports.send_report(db, user, org_id, usergroup_id, payload)

import logging

from fastapi import APIRouter, Depends, Request, status
from sqlmodel import Session

from src.core.capabilities import CORE_CAPABILITIES
from src.core.events.database import get_db_session
from src.db.organizations import OrganizationCreate
from src.db.plan_requests import PlanRequestRead, PlanRequestUpdate
from src.db.roles import Role, RoleTypeEnum
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services.email.utils import get_base_url_from_request
from src.services.orgs.usage import get_org_usage_and_limits
from src.services.superadmin import orgs as orgs_service
from src.services.superadmin import users as users_service
from src.services.superadmin.orgs import (
    OrgConfigUpdateRequest,
    OrgPackagesUpdateRequest,
    OrgPlanUpdateRequest,
    OrgSettingsUpdateRequest,
)
from src.services.superadmin.users import (
    BatchUserAction,
    GlobalUserCreate,
    GlobalUserUpdate,
    MembershipUpdate,
    ResetLinkPayload,
    SetPasswordPayload,
)

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_superadmin)])


@router.get("/status")
async def superadmin_status(current_user: PublicUser = Depends(get_current_user)):
    return {"is_superadmin": True, "capabilities": CORE_CAPABILITIES}


@router.get("/roles")
async def list_global_roles(db_session: Session = Depends(get_db_session)):
    """Global roles available for org membership assignment."""
    from sqlmodel import select

    roles = db_session.exec(
        select(Role).where(Role.role_type == RoleTypeEnum.TYPE_GLOBAL).order_by(Role.id)
    ).all()
    return [
        {
            "id": role.id,
            "role_uuid": role.role_uuid,
            "name": role.name,
            "description": role.description,
        }
        for role in roles
    ]


# ============================================================================
# Overview
# ============================================================================


@router.get("/overview")
async def platform_overview(db_session: Session = Depends(get_db_session)):
    from sqlmodel import func, select

    from src.db.courses.courses import Course
    from src.db.organizations import Organization
    from src.db.plan_requests import PlanRequest
    from src.db.users import User

    org_count = db_session.exec(select(func.count()).select_from(Organization)).one()
    user_count = db_session.exec(select(func.count()).select_from(User)).one()
    course_count = db_session.exec(select(func.count()).select_from(Course)).one()
    pending_requests = db_session.exec(
        select(func.count()).where(PlanRequest.status == "pending")
    ).one()
    recent_users = db_session.exec(
        select(User).order_by(User.id.desc()).limit(5)  # type: ignore[union-attr]
    ).all()
    recent_orgs = db_session.exec(
        select(Organization).order_by(Organization.id.desc()).limit(5)  # type: ignore[union-attr]
    ).all()
    return {
        "org_count": org_count,
        "user_count": user_count,
        "course_count": course_count,
        "pending_request_count": pending_requests,
        "recent_users": [
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "avatar_image": user.avatar_image,
                "user_uuid": user.user_uuid,
                "creation_date": user.creation_date,
            }
            for user in recent_users
        ],
        "recent_orgs": [
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "logo_image": org.logo_image,
                "org_uuid": org.org_uuid,
                "creation_date": org.creation_date,
            }
            for org in recent_orgs
        ],
    }


# ============================================================================
# Organizations
# ============================================================================


@router.get("/organizations")
async def list_organizations(
    page: int = 1,
    limit: int = 20,
    sort: str = "id",
    search: str = "",
    plan: str = "all",
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.list_organizations(
        db_session, page=page, limit=limit, sort=sort, search=search, plan=plan
    )


@router.post("/organizations", status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.create_organization(db_session, current_user, payload)


@router.get("/organizations/visits")
async def organizations_visits():
    from src.routers.analytics import _execute_tinybird_query

    sql = """
    SELECT
        org_id,
        toDate(timestamp) AS date,
        count() AS views
    FROM events
    WHERE
        event_name = 'page_view'
        AND timestamp >= now() - INTERVAL 7 DAY
    GROUP BY org_id, date
    ORDER BY org_id, date ASC
    """

    try:
        return await _execute_tinybird_query(
            query_name="superadmin_org_weekly_visits",
            sql=sql,
            org_id=0,
            days=7,
        )
    except Exception as exc:
        logger.warning("Failed to fetch org weekly visits: %s", exc)
        return {"data": [], "rows": 0, "meta": []}


@router.get("/organizations/{org_id}")
async def get_organization(org_id: int, db_session: Session = Depends(get_db_session)):
    return orgs_service.get_organization(db_session, org_id)


@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: int, db_session: Session = Depends(get_db_session)
):
    return orgs_service.delete_organization(db_session, org_id)


@router.get("/organizations/{org_id}/usage")
async def get_org_usage(
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return await get_org_usage_and_limits(None, org_id, current_user, db_session)


@router.get("/organizations/{org_id}/courses")
async def get_org_courses(
    org_id: int,
    page: int = 1,
    limit: int = 20,
    db_session: Session = Depends(get_db_session),
):
    from sqlmodel import func, select

    from src.db.courses.courses import Course

    statement = (
        select(Course).where(Course.org_id == org_id).order_by(Course.creation_date.desc())  # type: ignore[union-attr]
    )
    total = db_session.exec(select(func.count()).select_from(statement.subquery())).one()
    items = db_session.exec(statement.offset((page - 1) * limit).limit(limit)).all()
    return {
        "items": [item.model_dump() for item in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/organizations/{org_id}/users")
async def get_org_users(
    org_id: int,
    page: int = 1,
    limit: int = 20,
    search: str = "",
    db_session: Session = Depends(get_db_session),
):
    return users_service.list_global_users(
        db_session, page=page, limit=limit, search=search, org_id=org_id
    )


@router.get("/organizations/{org_id}/analytics")
async def get_org_analytics(
    org_id: int,
    days: int = 30,
    db_session: Session = Depends(get_db_session),
):
    from src.routers.analytics import _execute_tinybird_query
    from src.services.analytics.queries import CORE_QUERIES

    orgs_service._get_org_or_404(db_session, org_id)

    results = {}
    for query_name, (sql_template, default_days) in CORE_QUERIES.items():
        try:
            effective_days = days if days else default_days
            sql = sql_template.format(org_id=org_id, days=effective_days)
            results[query_name] = await _execute_tinybird_query(
                query_name=f"superadmin_{query_name}",
                sql=sql,
                org_id=org_id,
                days=effective_days,
            )
        except Exception as exc:
            logger.warning("Failed to fetch %s for org %s: %s", query_name, org_id, exc)
            results[query_name] = {"data": [], "rows": 0, "meta": []}

    return results


@router.get("/analytics/global")
async def get_global_analytics(days: int = 30):
    from src.routers.analytics import _execute_tinybird_query
    from src.services.analytics.queries import CORE_QUERIES

    results = {}
    for query_name, (sql_template, default_days) in CORE_QUERIES.items():
        try:
            effective_days = days if days else default_days
            sql = sql_template.format(org_id=0, days=effective_days)
            results[query_name] = await _execute_tinybird_query(
                query_name=f"global_{query_name}",
                sql=sql,
                org_id=0,
                days=effective_days,
            )
        except Exception as exc:
            logger.warning("Failed to fetch global %s: %s", query_name, exc)
            results[query_name] = {"data": [], "rows": 0, "meta": []}

    return results


@router.put("/organizations/{org_id}/plan")
async def update_org_plan(
    org_id: int,
    body: OrgPlanUpdateRequest,
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.update_org_plan(db_session, org_id, body)


@router.put("/organizations/{org_id}/settings")
async def update_org_settings(
    org_id: int,
    payload: OrgSettingsUpdateRequest,
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.update_org_settings(db_session, org_id, payload)


@router.put("/organizations/{org_id}/config")
async def update_org_config(
    org_id: int,
    body: OrgConfigUpdateRequest,
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.update_org_config(db_session, org_id, body)


@router.put("/organizations/{org_id}/packages")
async def update_org_packages(
    org_id: int,
    payload: OrgPackagesUpdateRequest,
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.update_org_packages(db_session, org_id, payload)


# ============================================================================
# Plan requests
# ============================================================================


@router.get("/plan-requests")
async def list_all_plan_requests(
    status: str | None = None,
    db_session: Session = Depends(get_db_session),
):
    """List all plan/package requests across all orgs, with org info attached."""
    return orgs_service.list_all_plan_requests(db_session, status)


@router.get(
    "/organizations/{org_id}/plan-requests", response_model=list[PlanRequestRead]
)
async def list_org_plan_requests(
    org_id: int, db_session: Session = Depends(get_db_session)
):
    return orgs_service.list_org_plan_requests(db_session, org_id)


@router.put("/plan-requests/{request_uuid}", response_model=PlanRequestRead)
async def update_plan_request(
    request_uuid: str,
    body: PlanRequestUpdate,
    db_session: Session = Depends(get_db_session),
):
    return orgs_service.update_plan_request(db_session, request_uuid, body)


# ============================================================================
# Users
# ============================================================================


@router.get("/users")
async def list_global_users(
    page: int = 1,
    limit: int = 20,
    sort: str = "id",
    search: str = "",
    superadmin: str = "all",
    min_orgs: int = 0,
    db_session: Session = Depends(get_db_session),
):
    return users_service.list_global_users(
        db_session,
        page=page,
        limit=limit,
        sort=sort,
        search=search,
        superadmin=superadmin,
        min_orgs=min_orgs,
    )


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_global_user(
    payload: GlobalUserCreate,
    db_session: Session = Depends(get_db_session),
):
    return users_service.create_global_user(db_session, payload)


@router.post("/users/batch")
async def batch_user_action(
    payload: BatchUserAction,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return users_service.batch_user_action(db_session, current_user, payload)


@router.get("/users/{user_id}")
async def get_global_user(user_id: int, db_session: Session = Depends(get_db_session)):
    return users_service.get_global_user(db_session, user_id)


@router.patch("/users/{user_id}")
async def update_global_user(
    user_id: int,
    payload: GlobalUserUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return users_service.update_global_user(db_session, current_user, user_id, payload)


@router.delete("/users/{user_id}")
async def delete_global_user(
    user_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return users_service.delete_global_user(db_session, current_user, user_id)


@router.get("/users/{user_id}/audit-logs")
async def get_user_audit_logs(
    user_id: int,
    offset: int = 0,
    limit: int = 20,
    db_session: Session = Depends(get_db_session),
):
    return users_service.get_user_audit_logs(
        db_session, user_id, offset=offset, limit=limit
    )


@router.post("/users/{user_id}/password-reset-link")
async def generate_password_reset_link(
    user_id: int,
    payload: ResetLinkPayload,
    request: Request,
    db_session: Session = Depends(get_db_session),
):
    base_url = get_base_url_from_request(request)
    return users_service.generate_password_reset_link(
        db_session, user_id, payload, base_url
    )


@router.post("/users/{user_id}/password")
async def set_user_password(
    user_id: int,
    payload: SetPasswordPayload,
    db_session: Session = Depends(get_db_session),
):
    return users_service.set_user_password(db_session, user_id, payload)


@router.post("/users/{user_id}/unlock")
async def unlock_user_account(
    user_id: int, db_session: Session = Depends(get_db_session)
):
    return users_service.unlock_user_account(db_session, user_id)


@router.put("/users/{user_id}/orgs/{org_id}")
async def set_user_membership(
    user_id: int,
    org_id: int,
    payload: MembershipUpdate,
    db_session: Session = Depends(get_db_session),
):
    return users_service.set_user_membership(db_session, user_id, org_id, payload)


@router.delete("/users/{user_id}/orgs/{org_id}")
async def remove_user_membership(
    user_id: int,
    org_id: int,
    db_session: Session = Depends(get_db_session),
):
    return users_service.remove_user_membership(db_session, user_id, org_id)

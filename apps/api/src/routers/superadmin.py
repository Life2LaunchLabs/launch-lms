import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, func
from sqlalchemy.orm.attributes import flag_modified

from src.core.capabilities import CORE_CAPABILITIES
from src.core.events.database import get_db_session
from src.db.custom_domains import CustomDomain
from src.db.organization_config import OrganizationConfig, OrganizationConfigV2Base
from src.db.organizations import Organization, OrganizationCreate
from src.db.plan_requests import PlanRequest, PlanRequestRead, PlanRequestUpdate
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.db.courses.courses import Course
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services.orgs.usage import get_org_usage_and_limits

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_superadmin)])


class SuperadminUserUpdate(BaseModel):
    is_superadmin: bool


class OrgConfigUpdateRequest(BaseModel):
    config: dict


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def _org_plan(org_config: OrganizationConfig | None) -> str:
    if not org_config:
        return "free"
    config = org_config.config or {}
    if str(config.get("config_version", "1.0")).startswith("2"):
        return config.get("plan", "free")
    return config.get("cloud", {}).get("plan", "free")


def _admin_users_for_org(org_id: int, db_session: Session) -> list[dict]:
    rows = db_session.exec(
        select(User, Role)
        .join(UserOrganization, UserOrganization.user_id == User.id)
        .join(Role, Role.id == UserOrganization.role_id)
        .where(UserOrganization.org_id == org_id)
    ).all()
    admins = []
    for user, role in rows:
        rights = role.rights or {}
        dashboard = rights.get("dashboard", {}) if isinstance(rights, dict) else {}
        is_admin = role.id in (1, 2) or dashboard.get("action_access", False)
        if is_admin:
            admins.append({
                "username": user.username,
                "email": user.email,
                "avatar_image": user.avatar_image,
                "user_uuid": user.user_uuid,
            })
    return admins


def _serialize_global_user(user: User, orgs: list[dict]) -> dict:
    return {
        "id": user.id,
        "user_uuid": user.user_uuid,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "avatar_image": user.avatar_image,
        "is_superadmin": user.is_superadmin,
        "org_count": len(orgs),
        "orgs": orgs,
        "creation_date": user.creation_date,
        "update_date": user.update_date,
    }


def _sort_org_items(items: list[dict], sort: str) -> list[dict]:
    sort_map: dict[str, tuple] = {
        "id": (lambda item: item["id"], False),
        "newest": (lambda item: _parse_datetime(item.get("creation_date")), True),
        "oldest": (lambda item: _parse_datetime(item.get("creation_date")), False),
        "users_desc": (lambda item: (item["user_count"], item["id"]), True),
        "users_asc": (lambda item: (item["user_count"], item["id"]), False),
        "courses_desc": (lambda item: (item["course_count"], item["id"]), True),
        "most_admins": (lambda item: (len(item["admin_users"]), item["id"]), True),
        "recently_updated": (lambda item: _parse_datetime(item.get("update_date")), True),
    }
    key_func, reverse = sort_map.get(sort, sort_map["id"])
    return sorted(items, key=key_func, reverse=reverse)


def _sort_user_items(items: list[dict], sort: str) -> list[dict]:
    sort_map: dict[str, tuple] = {
        "id": (lambda item: item["id"], False),
        "newest": (lambda item: _parse_datetime(item.get("creation_date")), True),
        "oldest": (lambda item: _parse_datetime(item.get("creation_date")), False),
        "orgs_desc": (lambda item: (item["org_count"], item["id"]), True),
        "orgs_asc": (lambda item: (item["org_count"], item["id"]), False),
        "username": (lambda item: (item["username"] or "").lower(), False),
        "recently_updated": (lambda item: _parse_datetime(item.get("update_date")), True),
    }
    key_func, reverse = sort_map.get(sort, sort_map["id"])
    return sorted(items, key=key_func, reverse=reverse)


@router.get("/status")
async def superadmin_status(current_user: PublicUser = Depends(get_current_user)):
    return {"is_superadmin": True, "capabilities": CORE_CAPABILITIES}


@router.get("/organizations")
async def list_organizations(
    page: int = 1,
    limit: int = 20,
    sort: str = "id",
    search: str = "",
    plan: str = "all",
    db_session: Session = Depends(get_db_session),
):
    statement = select(Organization).order_by(getattr(Organization, sort, Organization.id))
    orgs = db_session.exec(statement).all()
    org_configs = {
        cfg.org_id: cfg
        for cfg in db_session.exec(select(OrganizationConfig)).all()
    }
    items = []
    for org in orgs:
        org_plan = _org_plan(org_configs.get(org.id))
        if plan != "all" and org_plan != plan:
            continue
        if search and search.lower() not in f"{org.name} {org.slug} {org.email}".lower():
            continue
        user_count = db_session.exec(select(func.count()).where(UserOrganization.org_id == org.id)).one()
        course_count = db_session.exec(select(func.count()).where(Course.org_id == org.id)).one()
        pending_request_count = db_session.exec(
            select(func.count()).where(PlanRequest.org_id == org.id, PlanRequest.status == "pending")
        ).one()
        domains = db_session.exec(select(CustomDomain).where(CustomDomain.org_id == org.id)).all()
        items.append({
            **org.model_dump(),
            "user_count": user_count,
            "course_count": course_count,
            "pending_request_count": pending_request_count,
            "plan": org_plan,
            "custom_domains": [domain.domain for domain in domains],
            "admin_users": _admin_users_for_org(org.id, db_session),
        })
    items = _sort_org_items(items, sort)
    total = len(items)
    start = max(page - 1, 0) * limit
    return {"items": items[start:start + limit], "total": total, "page": page, "limit": limit}


@router.post("/organizations", status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    existing = db_session.exec(select(Organization).where(Organization.slug == payload.slug)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Organization already exists")

    now = str(datetime.now())
    organization = Organization.model_validate(payload)
    organization.org_uuid = f"org_{uuid4()}"
    organization.creation_date = now
    organization.update_date = now

    db_session.add(organization)
    db_session.commit()
    db_session.refresh(organization)

    membership = UserOrganization(
        user_id=int(current_user.id),
        org_id=int(organization.id or 0),
        role_id=1,
        creation_date=now,
        update_date=now,
    )
    db_session.add(membership)

    org_config = OrganizationConfigV2Base(config_version="2.0", plan="free")
    db_session.add(
        OrganizationConfig(
            org_id=int(organization.id or 0),
            config=org_config.model_dump(),
            creation_date=now,
            update_date=now,
        )
    )
    db_session.commit()

    from src.routers.users import _invalidate_session_cache
    _invalidate_session_cache(int(current_user.id))

    return await get_organization(int(organization.id or 0), db_session)


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
    users = db_session.exec(select(User).order_by(getattr(User, sort, User.id))).all()
    items = []
    memberships = db_session.exec(select(UserOrganization, Organization, Role).join(Organization, Organization.id == UserOrganization.org_id).join(Role, Role.id == UserOrganization.role_id)).all()
    by_user: dict[int, list[dict]] = {}
    for membership, org, role in memberships:
        by_user.setdefault(membership.user_id, []).append({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "role_name": role.name,
        })
    for user in users:
        orgs = by_user.get(user.id, [])
        if search and search.lower() not in f"{user.username} {user.email} {user.first_name} {user.last_name}".lower():
            continue
        if superadmin == "yes" and not user.is_superadmin:
            continue
        if superadmin == "no" and user.is_superadmin:
            continue
        if len(orgs) < min_orgs:
            continue
        items.append({
            "id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "avatar_image": user.avatar_image,
            "is_superadmin": user.is_superadmin,
            "org_count": len(orgs),
            "orgs": orgs,
            "creation_date": user.creation_date,
            "update_date": user.update_date,
        })
    items = _sort_user_items(items, sort)
    total = len(items)
    start = max(page - 1, 0) * limit
    return {"items": items[start:start + limit], "total": total, "page": page, "limit": limit}


@router.patch("/users/{user_id}")
async def update_global_user(
    user_id: int,
    payload: SuperadminUserUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    user = db_session.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.id == user.id and payload.is_superadmin is False:
        raise HTTPException(
            status_code=400,
            detail="You cannot remove your own superadmin access from the admin dashboard",
        )

    user.is_superadmin = payload.is_superadmin
    user.update_date = str(datetime.now())
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    memberships = db_session.exec(
        select(UserOrganization, Organization, Role)
        .join(Organization, Organization.id == UserOrganization.org_id)
        .join(Role, Role.id == UserOrganization.role_id)
        .where(UserOrganization.user_id == user.id)
    ).all()
    orgs = [{
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "role_name": role.name,
    } for user_org, org, role in memberships]

    from src.routers.users import _invalidate_session_cache
    _invalidate_session_cache(int(user.id))

    return _serialize_global_user(user, orgs)


@router.get("/organizations/{org_id}")
async def get_organization(org_id: int, db_session: Session = Depends(get_db_session)):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org_config = db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    user_count = db_session.exec(select(func.count()).where(UserOrganization.org_id == org.id)).one()
    course_count = db_session.exec(select(func.count()).where(Course.org_id == org.id)).one()
    pending_request_count = db_session.exec(
        select(func.count()).where(PlanRequest.org_id == org.id, PlanRequest.status == "pending")
    ).one()
    domains = db_session.exec(select(CustomDomain).where(CustomDomain.org_id == org.id)).all()
    return {
        **org.model_dump(),
        "config": org_config.config if org_config else {},
        "plan": _org_plan(org_config),
        "user_count": user_count,
        "course_count": course_count,
        "pending_request_count": pending_request_count,
        "custom_domains": [domain.domain for domain in domains],
        "admin_users": _admin_users_for_org(org.id, db_session),
    }


@router.get("/organizations/{org_id}/usage")
async def get_org_usage(org_id: int, current_user: PublicUser = Depends(get_current_user), db_session: Session = Depends(get_db_session)):
    return await get_org_usage_and_limits(None, org_id, current_user, db_session)


@router.get("/organizations/{org_id}/courses")
async def get_org_courses(org_id: int, page: int = 1, limit: int = 20, db_session: Session = Depends(get_db_session)):
    statement = select(Course).where(Course.org_id == org_id).order_by(Course.creation_date.desc())
    total = db_session.exec(select(func.count()).select_from(statement.subquery())).one()
    items = db_session.exec(statement.offset((page - 1) * limit).limit(limit)).all()
    return {"items": [item.model_dump() for item in items], "total": total, "page": page, "limit": limit}


@router.get("/organizations/{org_id}/users")
async def get_org_users(org_id: int, page: int = 1, limit: int = 20, search: str = "", db_session: Session = Depends(get_db_session)):
    rows = db_session.exec(
        select(User, UserOrganization, Role)
        .join(UserOrganization, UserOrganization.user_id == User.id)
        .join(Role, Role.id == UserOrganization.role_id)
        .where(UserOrganization.org_id == org_id)
        .order_by(UserOrganization.creation_date.desc())
    ).all()
    items = []
    for user, user_org, role in rows:
        if search and search.lower() not in f"{user.username} {user.email} {user.first_name} {user.last_name}".lower():
            continue
        items.append({
            "id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "avatar_image": user.avatar_image,
            "role_name": role.name,
            "creation_date": user_org.creation_date,
        })
    total = len(items)
    start = max(page - 1, 0) * limit
    return {"items": items[start:start + limit], "total": total, "page": page, "limit": limit}


@router.get("/organizations/{org_id}/analytics")
async def get_org_analytics(
    org_id: int,
    days: int = 30,
    db_session: Session = Depends(get_db_session),
):
    from src.routers.analytics import _execute_tinybird_query
    from src.services.analytics.queries import CORE_QUERIES

    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

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
async def update_org_plan(org_id: int, payload: dict, db_session: Session = Depends(get_db_session)):
    org_config = db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    if not org_config:
        raise HTTPException(status_code=404, detail="Organization config not found")
    config = org_config.config or {}
    if str(config.get("config_version", "1.0")).startswith("2"):
        config["plan"] = payload.get("plan", config.get("plan", "free"))
    else:
        config.setdefault("cloud", {})
        config["cloud"]["plan"] = payload.get("plan", config["cloud"].get("plan", "free"))
    org_config.config = config
    db_session.add(org_config)
    db_session.commit()
    return {"success": True}


@router.put("/organizations/{org_id}/settings")
async def update_org_settings(org_id: int, payload: dict, db_session: Session = Depends(get_db_session)):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    for field in ("name", "slug", "email", "description"):
        if field in payload:
            setattr(org, field, payload[field])
    org.update_date = datetime.now(timezone.utc).isoformat()
    db_session.add(org)
    db_session.commit()
    return {"success": True}


@router.put("/organizations/{org_id}/config")
async def update_org_config(
    org_id: int,
    body: OrgConfigUpdateRequest,
    db_session: Session = Depends(get_db_session),
):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()
    if not org_config:
        raise HTTPException(status_code=404, detail="Organization config not found")

    org_config.config = body.config
    org_config.update_date = datetime.now().isoformat()
    flag_modified(org_config, "config")
    db_session.add(org_config)
    db_session.commit()

    return {"success": True}


# ============================================================================
# Plan request management (superadmin)
# ============================================================================

@router.get("/plan-requests", response_model=list[PlanRequestRead])
async def list_all_plan_requests(
    status: str | None = None,
    db_session: Session = Depends(get_db_session),
):
    """List all plan/package requests across all orgs, optionally filtered by status."""
    query = select(PlanRequest)
    if status:
        query = query.where(PlanRequest.status == status)
    query = query.order_by(PlanRequest.creation_date.desc())
    return db_session.exec(query).all()


@router.get("/organizations/{org_id}/plan-requests", response_model=list[PlanRequestRead])
async def list_org_plan_requests(org_id: int, db_session: Session = Depends(get_db_session)):
    """List all plan/package requests for a specific organization."""
    return db_session.exec(
        select(PlanRequest)
        .where(PlanRequest.org_id == org_id)
        .order_by(PlanRequest.creation_date.desc())
    ).all()


@router.put("/plan-requests/{request_uuid}", response_model=PlanRequestRead)
async def update_plan_request(
    request_uuid: str,
    body: PlanRequestUpdate,
    db_session: Session = Depends(get_db_session),
):
    """Approve or deny a plan/package request."""
    req = db_session.exec(
        select(PlanRequest).where(PlanRequest.request_uuid == request_uuid)
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Plan request not found")

    req.status = body.status
    if body.message is not None:
        req.message = body.message
    req.update_date = datetime.now(timezone.utc).isoformat()
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


@router.put("/organizations/{org_id}/packages")
async def update_org_packages(
    org_id: int,
    payload: dict,
    db_session: Session = Depends(get_db_session),
):
    """Set the active packages for an organization (superadmin only)."""
    org_config = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()
    if not org_config:
        raise HTTPException(status_code=404, detail="Organization config not found")

    config = org_config.config or {}
    packages = payload.get("packages", [])
    if str(config.get("config_version", "1.0")).startswith("2"):
        config["packages"] = packages
    else:
        config["packages"] = packages
    org_config.config = config
    db_session.add(org_config)
    db_session.commit()
    return {"success": True}

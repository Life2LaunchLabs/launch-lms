"""Platform-level (superadmin) organization management.

All functions assume the caller has already been authorized via
`require_superadmin`.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session, func, select

from src.db.courses.courses import Course
from src.db.custom_domains import CustomDomain
from src.db.organization_config import OrganizationConfig, OrganizationConfigV2Base
from src.db.organizations import Organization, OrganizationCreate
from src.db.plan_requests import PlanRequest, PlanRequestUpdate
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS

logger = logging.getLogger(__name__)


# ============================================================================
# DTOs
# ============================================================================


class OrgConfigUpdateRequest(BaseModel):
    config: dict


class OrgPlanUpdateRequest(BaseModel):
    plan: str


class OrgSettingsUpdateRequest(BaseModel):
    name: str | None = None
    slug: str | None = None
    email: str | None = None
    description: str | None = None


class OrgPackagesUpdateRequest(BaseModel):
    packages: list[str] = []


# ============================================================================
# Config helpers
# ============================================================================


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


def _get_org_config_rows(org_id: int, db_session: Session) -> list[OrganizationConfig]:
    return db_session.exec(
        select(OrganizationConfig)
        .where(OrganizationConfig.org_id == org_id)
        .order_by(OrganizationConfig.id)
    ).all()


def _get_single_org_config(org_id: int, db_session: Session) -> OrganizationConfig:
    rows = _get_org_config_rows(org_id, db_session)
    if not rows:
        raise HTTPException(status_code=404, detail="Organization config not found")
    if len(rows) > 1:
        row_ids = [row.id for row in rows]
        logger.error(
            "Duplicate organization_config rows found for org_id=%s: ids=%s",
            org_id,
            row_ids,
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "Duplicate organization configs found for this organization. "
                f"org_id={org_id}, config_ids={row_ids}"
            ),
        )
    return rows[0]


def _verify_persisted_org_plan(
    org_config: OrganizationConfig,
    expected_plan: str,
    db_session: Session,
) -> None:
    db_session.refresh(org_config)
    persisted_plan = _org_plan(org_config)
    if persisted_plan != expected_plan:
        logger.error(
            "Organization plan write verification failed for org_id=%s: expected=%s actual=%s config_id=%s",
            org_config.org_id,
            expected_plan,
            persisted_plan,
            org_config.id,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "Organization plan update could not be verified after commit. "
                f"expected={expected_plan}, actual={persisted_plan}"
            ),
        )


def _get_org_or_404(db_session: Session, org_id: int) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_owner_org(db_session: Session) -> Organization | None:
    return db_session.exec(
        select(Organization).order_by(Organization.id).limit(1)
    ).first()


# ============================================================================
# Listing & detail
# ============================================================================


def _is_admin_role(role: Role) -> bool:
    if role.id in ADMIN_OR_MAINTAINER_ROLE_IDS:
        return True
    rights = role.rights or {}
    dashboard = rights.get("dashboard", {}) if isinstance(rights, dict) else {}
    return bool(dashboard.get("action_access", False))


def _admin_users_by_org(db_session: Session) -> dict[int, list[dict]]:
    rows = db_session.exec(
        select(User, Role, UserOrganization.org_id)
        .join(UserOrganization, UserOrganization.user_id == User.id)
        .join(Role, Role.id == UserOrganization.role_id)
    ).all()
    admins: dict[int, list[dict]] = {}
    for user, role, org_id in rows:
        if _is_admin_role(role):
            admins.setdefault(org_id, []).append(
                {
                    "username": user.username,
                    "email": user.email,
                    "avatar_image": user.avatar_image,
                    "user_uuid": user.user_uuid,
                }
            )
    return admins


def _admin_users_for_org(org_id: int, db_session: Session) -> list[dict]:
    rows = db_session.exec(
        select(User, Role)
        .join(UserOrganization, UserOrganization.user_id == User.id)
        .join(Role, Role.id == UserOrganization.role_id)
        .where(UserOrganization.org_id == org_id)
    ).all()
    return [
        {
            "username": user.username,
            "email": user.email,
            "avatar_image": user.avatar_image,
            "user_uuid": user.user_uuid,
        }
        for user, role in rows
        if _is_admin_role(role)
    ]


def _counts_by_org(db_session: Session, count_column, filters=()) -> dict[int, int]:
    statement = select(count_column, func.count()).group_by(count_column)
    for condition in filters:
        statement = statement.where(condition)
    return {org_id: count for org_id, count in db_session.exec(statement).all()}


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


def list_organizations(
    db_session: Session,
    *,
    page: int = 1,
    limit: int = 20,
    sort: str = "id",
    search: str = "",
    plan: str = "all",
) -> dict:
    orgs = db_session.exec(select(Organization)).all()

    org_configs = {
        cfg.org_id: cfg for cfg in db_session.exec(select(OrganizationConfig)).all()
    }
    user_counts = _counts_by_org(db_session, UserOrganization.org_id)
    course_counts = _counts_by_org(db_session, Course.org_id)
    pending_counts = _counts_by_org(
        db_session, PlanRequest.org_id, filters=(PlanRequest.status == "pending",)
    )
    domains_by_org: dict[int, list[str]] = {}
    for domain in db_session.exec(select(CustomDomain)).all():
        domains_by_org.setdefault(domain.org_id, []).append(domain.domain)
    admins_by_org = _admin_users_by_org(db_session)

    items = []
    for org in orgs:
        org_plan = _org_plan(org_configs.get(org.id))
        if plan != "all" and org_plan != plan:
            continue
        if search and search.lower() not in f"{org.name} {org.slug} {org.email}".lower():
            continue
        items.append(
            {
                **org.model_dump(),
                "user_count": user_counts.get(org.id, 0),
                "course_count": course_counts.get(org.id, 0),
                "pending_request_count": pending_counts.get(org.id, 0),
                "plan": org_plan,
                "custom_domains": domains_by_org.get(org.id, []),
                "admin_users": admins_by_org.get(org.id, []),
            }
        )

    items = _sort_org_items(items, sort)
    total = len(items)
    start = max(page - 1, 0) * limit
    return {
        "items": items[start : start + limit],
        "total": total,
        "page": page,
        "limit": limit,
    }


def get_organization(db_session: Session, org_id: int) -> dict:
    org = _get_org_or_404(db_session, org_id)
    org_config_rows = _get_org_config_rows(org_id, db_session)
    org_config = org_config_rows[0] if len(org_config_rows) == 1 else None
    user_count = db_session.exec(
        select(func.count()).where(UserOrganization.org_id == org.id)
    ).one()
    course_count = db_session.exec(
        select(func.count()).where(Course.org_id == org.id)
    ).one()
    pending_request_count = db_session.exec(
        select(func.count()).where(
            PlanRequest.org_id == org.id, PlanRequest.status == "pending"
        )
    ).one()
    domains = db_session.exec(
        select(CustomDomain).where(CustomDomain.org_id == org.id)
    ).all()
    owner_org = _get_owner_org(db_session)
    return {
        **org.model_dump(),
        "config": org_config.config if org_config else {},
        "plan": _org_plan(org_config),
        "user_count": user_count,
        "course_count": course_count,
        "pending_request_count": pending_request_count,
        "custom_domains": [domain.domain for domain in domains],
        "admin_users": _admin_users_for_org(org.id, db_session),
        "is_owner_org": bool(owner_org and owner_org.id == org.id),
        "config_row_count": len(org_config_rows),
        "config_row_ids": [cfg.id for cfg in org_config_rows],
    }


# ============================================================================
# Create / update / delete
# ============================================================================


def create_organization(
    db_session: Session, current_user: PublicUser, payload: OrganizationCreate
) -> dict:
    existing = db_session.exec(
        select(Organization).where(Organization.slug == payload.slug)
    ).first()
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

    return get_organization(db_session, int(organization.id or 0))


def update_org_settings(
    db_session: Session, org_id: int, payload: OrgSettingsUpdateRequest
) -> dict:
    org = _get_org_or_404(db_session, org_id)
    for field in ("name", "slug", "email", "description"):
        value = getattr(payload, field)
        if value is not None:
            setattr(org, field, value)
    org.update_date = datetime.now(timezone.utc).isoformat()
    db_session.add(org)
    db_session.commit()
    return {"success": True}


def update_org_plan(
    db_session: Session, org_id: int, payload: OrgPlanUpdateRequest
) -> dict:
    org_config = _get_single_org_config(org_id, db_session)
    config = dict(org_config.config or {})
    if str(config.get("config_version", "1.0")).startswith("2"):
        config["plan"] = payload.plan
    else:
        config.setdefault("cloud", {})
        config["cloud"]["plan"] = payload.plan
    org_config.config = config
    org_config.update_date = datetime.now(timezone.utc).isoformat()
    flag_modified(org_config, "config")
    db_session.add(org_config)
    db_session.commit()
    _verify_persisted_org_plan(org_config, payload.plan, db_session)
    return {"success": True}


def update_org_config(
    db_session: Session, org_id: int, payload: OrgConfigUpdateRequest
) -> dict:
    _get_org_or_404(db_session, org_id)
    org_config = _get_single_org_config(org_id, db_session)
    org_config.config = payload.config
    org_config.update_date = datetime.now().isoformat()
    flag_modified(org_config, "config")
    db_session.add(org_config)
    db_session.commit()
    return {"success": True}


def update_org_packages(
    db_session: Session, org_id: int, payload: OrgPackagesUpdateRequest
) -> dict:
    org_config = _get_single_org_config(org_id, db_session)
    config = dict(org_config.config or {})
    config["packages"] = payload.packages
    org_config.config = config
    org_config.update_date = datetime.now(timezone.utc).isoformat()
    flag_modified(org_config, "config")
    db_session.add(org_config)
    db_session.commit()
    return {"success": True}


def delete_organization(db_session: Session, org_id: int) -> dict:
    org = _get_org_or_404(db_session, org_id)

    owner_org = _get_owner_org(db_session)
    if owner_org and owner_org.id == org.id:
        raise HTTPException(
            status_code=400, detail="The owner organization cannot be deleted"
        )

    org_name = org.name
    logger.warning(
        "AUDIT: Superadmin organization deletion - org_id=%s, org_uuid=%s, org_name=%s",
        org_id,
        org.org_uuid,
        org_name,
    )

    from src.routers.users import _invalidate_session_cache

    affected_users = db_session.exec(
        select(UserOrganization.user_id).where(UserOrganization.org_id == org_id)
    ).all()
    for user_id in affected_users:
        _invalidate_session_cache(user_id)

    # Related data is removed via CASCADE constraints
    db_session.delete(org)
    db_session.commit()

    return {"detail": "Organization deleted", "org_id": org_id, "org_name": org_name}


# ============================================================================
# Plan requests
# ============================================================================


def list_all_plan_requests(
    db_session: Session, status: str | None = None
) -> list[dict]:
    query = select(PlanRequest, Organization).join(
        Organization, Organization.id == PlanRequest.org_id
    )
    if status:
        query = query.where(PlanRequest.status == status)
    query = query.order_by(PlanRequest.creation_date.desc())
    return [
        {
            **req.model_dump(),
            "org_name": org.name,
            "org_slug": org.slug,
            "org_uuid": org.org_uuid,
            "org_logo_image": org.logo_image,
        }
        for req, org in db_session.exec(query).all()
    ]


def list_org_plan_requests(db_session: Session, org_id: int) -> list[PlanRequest]:
    return db_session.exec(
        select(PlanRequest)
        .where(PlanRequest.org_id == org_id)
        .order_by(PlanRequest.creation_date.desc())
    ).all()


def update_plan_request(
    db_session: Session, request_uuid: str, body: PlanRequestUpdate
) -> PlanRequest:
    """Approve or deny a plan/package request. Approval applies the change immediately."""
    req = db_session.exec(
        select(PlanRequest).where(PlanRequest.request_uuid == request_uuid)
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Plan request not found")

    org_config = None
    if body.status == "approved":
        org_config = _get_single_org_config(req.org_id, db_session)
        config = dict(org_config.config or {})
        if req.request_type == "plan_upgrade":
            if str(config.get("config_version", "1.0")).startswith("2"):
                config["plan"] = req.requested_value
            else:
                config.setdefault("cloud", {})
                config["cloud"]["plan"] = req.requested_value
        elif req.request_type == "package_add":
            packages = list(config.get("packages") or [])
            if req.requested_value not in packages:
                packages.append(req.requested_value)
            config["packages"] = packages
        org_config.config = config
        org_config.update_date = datetime.now(timezone.utc).isoformat()
        flag_modified(org_config, "config")
        db_session.add(org_config)

    req.status = body.status
    if body.message is not None:
        req.message = body.message
    req.update_date = datetime.now(timezone.utc).isoformat()
    db_session.add(req)
    db_session.commit()
    if body.status == "approved" and req.request_type == "plan_upgrade" and org_config:
        _verify_persisted_org_plan(org_config, req.requested_value, db_session)
    db_session.refresh(req)
    return req

"""Platform-level (superadmin) user management.

All functions assume the caller has already been authorized via
`require_superadmin` — they perform no RBAC checks of their own, only
integrity guards (self-demotion, last admin of an org, owner org, ...).
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

import redis
from fastapi import HTTPException
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, func, or_, select

from config.config import get_launchlms_config
from src.db.audit_logs import AuditLog
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.security.security import security_hash_password
from src.services.security.password_validation import validate_password_complexity
from src.services.users.password_reset import generate_secure_reset_code

logger = logging.getLogger(__name__)

DEFAULT_MEMBER_ROLE_ID = 4  # role_global_user


# ============================================================================
# DTOs
# ============================================================================


class GlobalUserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    first_name: str = ""
    last_name: str = ""
    org_id: Optional[int] = None
    role_id: Optional[int] = None


class GlobalUserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    bio: Optional[str] = None
    email_verified: Optional[bool] = None
    is_superadmin: Optional[bool] = None


class MembershipUpdate(BaseModel):
    role_id: int


class SetPasswordPayload(BaseModel):
    new_password: str


class ResetLinkPayload(BaseModel):
    org_id: Optional[int] = None


class BatchUserAction(BaseModel):
    user_ids: list[int]
    action: Literal["add_to_org", "remove_from_org", "verify_email", "delete"]
    org_id: Optional[int] = None
    role_id: Optional[int] = None


# ============================================================================
# Helpers
# ============================================================================


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _invalidate_session_cache(user_id: int) -> None:
    from src.routers.users import _invalidate_session_cache as invalidate

    invalidate(user_id)


def _get_user_or_404(db_session: Session, user_id: int) -> User:
    user = db_session.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _is_locked(user: User) -> bool:
    if not user.locked_until:
        return False
    try:
        locked_until = datetime.fromisoformat(user.locked_until)
    except ValueError:
        return False
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until > datetime.now(timezone.utc)


def _memberships_for_users(
    db_session: Session, user_ids: list[int]
) -> dict[int, list[dict]]:
    if not user_ids:
        return {}
    rows = db_session.exec(
        select(UserOrganization, Organization, Role)
        .join(Organization, Organization.id == UserOrganization.org_id)
        .join(Role, Role.id == UserOrganization.role_id)
        .where(UserOrganization.user_id.in_(user_ids))  # type: ignore[union-attr]
    ).all()
    by_user: dict[int, list[dict]] = {}
    for membership, org, role in rows:
        by_user.setdefault(membership.user_id, []).append(
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "logo_image": org.logo_image,
                "org_uuid": org.org_uuid,
                "role_id": role.id,
                "role_name": role.name,
                "role_uuid": role.role_uuid,
                "since": membership.creation_date,
            }
        )
    return by_user


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
        "email_verified": user.email_verified,
        "is_locked": _is_locked(user),
        "last_login_at": user.last_login_at,
        "org_count": len(orgs),
        "orgs": orgs,
        "creation_date": user.creation_date,
        "update_date": user.update_date,
    }


def _serialize_global_user_detail(user: User, orgs: list[dict]) -> dict:
    return {
        **_serialize_global_user(user, orgs),
        "bio": user.bio,
        "signup_method": user.signup_method,
        "email_verified_at": user.email_verified_at,
        "failed_login_attempts": user.failed_login_attempts,
        "locked_until": user.locked_until,
        "last_login_ip": user.last_login_ip,
    }


def _get_owner_org(db_session: Session) -> Organization | None:
    return db_session.exec(
        select(Organization).order_by(Organization.id).limit(1)
    ).first()


def _get_redis():
    conn_string = get_launchlms_config().redis_config.redis_connection_string
    if not conn_string:
        raise HTTPException(status_code=500, detail="Redis connection string not found")
    return redis.Redis.from_url(conn_string)


# ============================================================================
# Listing & detail
# ============================================================================


def list_global_users(
    db_session: Session,
    *,
    page: int = 1,
    limit: int = 20,
    sort: str = "id",
    search: str = "",
    superadmin: str = "all",
    min_orgs: int = 0,
    org_id: int | None = None,
) -> dict:
    counts = (
        select(
            UserOrganization.user_id.label("user_id"),  # type: ignore[union-attr]
            func.count(UserOrganization.id).label("org_count"),  # type: ignore[arg-type]
        )
        .group_by(UserOrganization.user_id)  # type: ignore[arg-type]
        .subquery()
    )
    org_count = func.coalesce(counts.c.org_count, 0)

    statement = select(User, org_count.label("org_count")).outerjoin(
        counts, counts.c.user_id == User.id
    )

    if search:
        pattern = f"%{search}%"
        statement = statement.where(
            or_(
                User.username.ilike(pattern),  # type: ignore[union-attr]
                User.email.ilike(pattern),  # type: ignore[union-attr]
                User.first_name.ilike(pattern),  # type: ignore[union-attr]
                User.last_name.ilike(pattern),  # type: ignore[union-attr]
            )
        )
    if superadmin == "yes":
        statement = statement.where(User.is_superadmin.is_(True))  # type: ignore[union-attr]
    elif superadmin == "no":
        statement = statement.where(User.is_superadmin.is_(False))  # type: ignore[union-attr]
    if min_orgs > 0:
        statement = statement.where(org_count >= min_orgs)
    if org_id is not None:
        statement = statement.where(
            User.id.in_(  # type: ignore[union-attr]
                select(UserOrganization.user_id).where(UserOrganization.org_id == org_id)
            )
        )

    sort_map = {
        "id": (User.id.asc(),),  # type: ignore[union-attr]
        "newest": (User.creation_date.desc(), User.id.desc()),  # type: ignore[union-attr]
        "oldest": (User.creation_date.asc(), User.id.asc()),  # type: ignore[union-attr]
        "orgs_desc": (org_count.desc(), User.id.desc()),  # type: ignore[union-attr]
        "orgs_asc": (org_count.asc(), User.id.asc()),  # type: ignore[union-attr]
        "username": (func.lower(User.username).asc(),),
        "recently_updated": (User.update_date.desc(), User.id.desc()),  # type: ignore[union-attr]
    }
    order_by = sort_map.get(sort, sort_map["id"])

    total = db_session.exec(
        select(func.count()).select_from(statement.subquery())
    ).one()
    page = max(page, 1)
    rows = db_session.exec(
        statement.order_by(*order_by).offset((page - 1) * limit).limit(limit)
    ).all()

    users = [row[0] for row in rows]
    memberships = _memberships_for_users(
        db_session, [u.id for u in users if u.id is not None]
    )
    items = [_serialize_global_user(u, memberships.get(u.id, [])) for u in users]
    return {"items": items, "total": total, "page": page, "limit": limit}


def get_global_user(db_session: Session, user_id: int) -> dict:
    user = _get_user_or_404(db_session, user_id)
    memberships = _memberships_for_users(db_session, [user_id])
    return _serialize_global_user_detail(user, memberships.get(user_id, []))


def get_user_audit_logs(
    db_session: Session, user_id: int, *, offset: int = 0, limit: int = 20
) -> dict:
    _get_user_or_404(db_session, user_id)
    statement = select(AuditLog).where(AuditLog.user_id == user_id)
    total = db_session.exec(
        select(func.count()).select_from(statement.subquery())
    ).one()
    items = db_session.exec(
        statement.order_by(AuditLog.created_at.desc())  # type: ignore[union-attr]
        .offset(offset)
        .limit(min(limit, 100))
    ).all()
    return {
        "items": [item.model_dump() for item in items],
        "total": total,
        "offset": offset,
        "limit": min(limit, 100),
    }


# ============================================================================
# Create / update / delete
# ============================================================================


def create_global_user(db_session: Session, payload: GlobalUserCreate) -> dict:
    validation_result = validate_password_complexity(payload.password)
    if not validation_result.is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "WEAK_PASSWORD",
                "message": "Password does not meet security requirements",
                "errors": validation_result.errors,
                "requirements": validation_result.requirements,
            },
        )

    if db_session.exec(select(User).where(User.username == payload.username)).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    if db_session.exec(select(User).where(User.email == payload.email)).first():
        raise HTTPException(status_code=409, detail="Email already exists")

    org: Organization | None = None
    role_id = payload.role_id or DEFAULT_MEMBER_ROLE_ID
    if payload.org_id is not None:
        org = db_session.exec(
            select(Organization).where(Organization.id == payload.org_id)
        ).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        _validate_role_for_org(db_session, role_id, payload.org_id)

    now = _now_iso()
    user = User(
        username=payload.username,
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        user_uuid=f"user_{uuid.uuid4()}",
        password=security_hash_password(payload.password),
        email_verified=True,
        email_verified_at=now,
        signup_method="admin",
        creation_date=now,
        update_date=now,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    if org is not None:
        db_session.add(
            UserOrganization(
                user_id=int(user.id or 0),
                org_id=int(org.id or 0),
                role_id=role_id,
                creation_date=now,
                update_date=now,
            )
        )
        db_session.commit()

    return get_global_user(db_session, int(user.id or 0))


def update_global_user(
    db_session: Session,
    current_user: PublicUser,
    user_id: int,
    payload: GlobalUserUpdate,
) -> dict:
    user = _get_user_or_404(db_session, user_id)

    if (
        payload.is_superadmin is False
        and current_user.id == user.id
    ):
        raise HTTPException(
            status_code=400,
            detail="You cannot remove your own superadmin access from the admin dashboard",
        )

    if payload.username is not None and payload.username != user.username:
        existing = db_session.exec(
            select(User).where(User.username == payload.username)
        ).first()
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = payload.username

    if payload.email is not None and payload.email != user.email:
        existing = db_session.exec(
            select(User).where(User.email == payload.email)
        ).first()
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Email already exists")
        user.email = payload.email
        # An admin-changed email has not been verified by its owner
        user.email_verified = False
        user.email_verified_at = None

    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name
    if payload.bio is not None:
        user.bio = payload.bio
    if payload.email_verified is not None:
        user.email_verified = payload.email_verified
        user.email_verified_at = _now_iso() if payload.email_verified else None
    if payload.is_superadmin is not None:
        user.is_superadmin = payload.is_superadmin

    user.update_date = _now_iso()
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    _invalidate_session_cache(int(user.id or 0))
    return get_global_user(db_session, user_id)


def delete_global_user(
    db_session: Session, current_user: PublicUser, user_id: int
) -> dict:
    user = _get_user_or_404(db_session, user_id)
    if current_user.id == user.id:
        raise HTTPException(
            status_code=400, detail="You cannot delete your own account"
        )

    memberships = db_session.exec(
        select(UserOrganization).where(UserOrganization.user_id == user_id)
    ).all()
    for membership in memberships:
        db_session.delete(membership)
    db_session.flush()

    db_session.delete(user)
    db_session.commit()

    _invalidate_session_cache(user_id)
    return {"detail": "User deleted successfully"}


# ============================================================================
# Credentials & account state
# ============================================================================


def set_user_password(
    db_session: Session, user_id: int, payload: SetPasswordPayload
) -> dict:
    user = _get_user_or_404(db_session, user_id)

    validation_result = validate_password_complexity(payload.new_password)
    if not validation_result.is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "WEAK_PASSWORD",
                "message": "Password does not meet security requirements",
                "errors": validation_result.errors,
                "requirements": validation_result.requirements,
            },
        )

    user.password = security_hash_password(payload.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.update_date = _now_iso()
    db_session.add(user)
    db_session.commit()

    logger.info("Superadmin set a new password for user %s", user.user_uuid)
    return {"detail": "Password updated"}


def unlock_user_account(db_session: Session, user_id: int) -> dict:
    user = _get_user_or_404(db_session, user_id)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.update_date = _now_iso()
    db_session.add(user)
    db_session.commit()
    return {"detail": "Account unlocked"}


def generate_password_reset_link(
    db_session: Session,
    user_id: int,
    payload: ResetLinkPayload,
    base_url: str,
) -> dict:
    """Create a one-time password reset code and return a shareable URL.

    The code is scoped to an organization because the public reset page
    resolves an org from its host. Defaults to the owner org, which is what
    the platform's main domain resolves to.
    """
    user = _get_user_or_404(db_session, user_id)

    if payload.org_id is not None:
        org = db_session.exec(
            select(Organization).where(Organization.id == payload.org_id)
        ).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
    else:
        org = _get_owner_org(db_session)
        if not org:
            raise HTTPException(status_code=400, detail="No organization exists")

    r = _get_redis()

    reset_code = generate_secure_reset_code(length=8)
    reset_email_invite_uuid = f"reset_email_invite_code_{uuid.uuid4()}"
    ttl = 60 * 60  # 1 hour, same as the self-service flow
    expires_at = int(datetime.now().timestamp()) + ttl

    reset_code_object = {
        "reset_code": reset_code,
        "reset_email_invite_uuid": reset_email_invite_uuid,
        "reset_code_expires": expires_at,
        "reset_code_type": "password_reset",
        "created_at": datetime.now().isoformat(),
        "created_by": user.user_uuid,
        "org_uuid": org.org_uuid,
        "generated_by": "superadmin",
    }
    r.set(
        f"{reset_email_invite_uuid}:user:{user.user_uuid}:org:{org.org_uuid}:code:{reset_code}",
        json.dumps(reset_code_object),
        ex=ttl,
    )

    reset_url = (
        f"{base_url.rstrip('/')}/auth/reset"
        f"?email={user.email}&resetCode={reset_code}"
    )
    logger.info("Superadmin generated a password reset link for user %s", user.user_uuid)
    return {
        "reset_url": reset_url,
        "reset_code": reset_code,
        "email": user.email,
        "org_id": org.id,
        "expires_at": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(),
    }


# ============================================================================
# Org memberships
# ============================================================================


def _validate_role_for_org(db_session: Session, role_id: int, org_id: int) -> Role:
    role = db_session.exec(select(Role).where(Role.id == role_id)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.org_id is not None and role.org_id != org_id:
        raise HTTPException(
            status_code=400, detail="Role belongs to a different organization"
        )
    return role


def _ensure_not_last_admin(
    db_session: Session, user_id: int, org_id: int, new_role_id: int | None
) -> None:
    """Block demoting/removing the only admin of an org."""
    if new_role_id == ADMIN_ROLE_ID:
        return
    admins = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.org_id == org_id,
            UserOrganization.role_id == ADMIN_ROLE_ID,
        )
    ).all()
    if len(admins) == 1 and int(admins[0].user_id) == int(user_id):
        raise HTTPException(
            status_code=400, detail="Organization must have at least one admin"
        )


def set_user_membership(
    db_session: Session, user_id: int, org_id: int, payload: MembershipUpdate
) -> dict:
    _get_user_or_404(db_session, user_id)
    org = db_session.exec(
        select(Organization).where(Organization.id == org_id)
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    role = _validate_role_for_org(db_session, payload.role_id, org_id)

    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id, UserOrganization.org_id == org_id
        )
    ).first()

    now = _now_iso()
    if membership:
        _ensure_not_last_admin(db_session, user_id, org_id, payload.role_id)
        membership.role_id = payload.role_id
        membership.update_date = now
    else:
        membership = UserOrganization(
            user_id=user_id,
            org_id=org_id,
            role_id=payload.role_id,
            creation_date=now,
            update_date=now,
        )
    db_session.add(membership)
    db_session.commit()

    _invalidate_session_cache(user_id)
    return {
        "detail": "Membership updated",
        "org_id": org_id,
        "role_id": role.id,
        "role_name": role.name,
    }


def remove_user_membership(db_session: Session, user_id: int, org_id: int) -> dict:
    _get_user_or_404(db_session, user_id)
    owner_org = _get_owner_org(db_session)
    if owner_org and owner_org.id == org_id:
        raise HTTPException(
            status_code=400,
            detail="Users cannot be removed from the owner organization",
        )

    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id, UserOrganization.org_id == org_id
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    _ensure_not_last_admin(db_session, user_id, org_id, None)

    db_session.delete(membership)
    db_session.commit()

    _invalidate_session_cache(user_id)
    return {"detail": "User removed from organization"}


# ============================================================================
# Batch actions
# ============================================================================


def batch_user_action(
    db_session: Session, current_user: PublicUser, payload: BatchUserAction
) -> dict:
    if payload.action in ("add_to_org", "remove_from_org") and payload.org_id is None:
        raise HTTPException(status_code=400, detail="org_id is required for this action")

    results = []
    for user_id in payload.user_ids:
        try:
            if payload.action == "add_to_org":
                set_user_membership(
                    db_session,
                    user_id,
                    int(payload.org_id or 0),
                    MembershipUpdate(role_id=payload.role_id or DEFAULT_MEMBER_ROLE_ID),
                )
            elif payload.action == "remove_from_org":
                remove_user_membership(db_session, user_id, int(payload.org_id or 0))
            elif payload.action == "verify_email":
                update_global_user(
                    db_session,
                    current_user,
                    user_id,
                    GlobalUserUpdate(email_verified=True),
                )
            elif payload.action == "delete":
                delete_global_user(db_session, current_user, user_id)
            results.append({"user_id": user_id, "success": True, "error": None})
        except HTTPException as exc:
            db_session.rollback()
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            results.append({"user_id": user_id, "success": False, "error": detail})

    succeeded = sum(1 for result in results if result["success"])
    return {
        "results": results,
        "succeeded": succeeded,
        "failed": len(results) - succeeded,
    }

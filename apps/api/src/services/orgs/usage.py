from fastapi import Request
from sqlmodel import Session
from src.db.users import PublicUser
from src.security.access.access import count_usage, org_access
from src.security.rbac.rbac import authorization_verify_if_user_is_anon

COUNTED = ("learners", "staff_seats")


async def get_org_usage_and_limits(
    request: Request | None,
    org_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    """The org's tier and, for each counted limit, usage against it (limit 0 = unlimited)."""
    await authorization_verify_if_user_is_anon(current_user.id)
    access = org_access(org_id, db_session)
    limits = {}
    for name in COUNTED:
        usage = count_usage(name, org_id, db_session)
        limit = access.limit(name)
        limits[name] = {
            "usage": usage,
            "limit": limit or "unlimited",
            "remaining": max(0, limit - usage) if limit else "unlimited",
            "limit_reached": bool(limit) and usage >= limit,
        }
    return {"org_id": org_id, "tier": access.effective_tier, "limits": limits}

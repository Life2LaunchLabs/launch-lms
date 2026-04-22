import logging
from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select
from src.core.events.database import get_db_session
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID

logger = logging.getLogger(__name__)


def is_user_superadmin(user_id: int, db_session: Session) -> bool:
    """Check if a user is a superadmin by querying the database directly."""
    statement = select(User).where(User.id == user_id)
    user = db_session.exec(statement).first()
    if user and user.is_superadmin:
        return True
    return False


def is_user_owner_org_admin(user_id: int, db_session: Session) -> bool:
    """Allow default-org admins to access platform tools until superadmin is fully rolled out."""
    owner_org = db_session.exec(
        select(Organization).order_by(Organization.id).limit(1)
    ).first()
    if not owner_org or owner_org.id is None:
        return False

    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id,
            UserOrganization.org_id == owner_org.id,
            UserOrganization.role_id == ADMIN_ROLE_ID,
        )
    ).first()
    return membership is not None


async def _get_current_user_lazy(request: Request, db_session: Session = Depends(get_db_session)):
    """Lazy wrapper to avoid circular import (rbac -> superadmin -> auth -> users -> rbac)."""
    from src.security.auth import get_current_user
    return await get_current_user(request, db_session)


async def require_superadmin(
    current_user: PublicUser = Depends(_get_current_user_lazy),
    db_session: Session = Depends(get_db_session),
) -> PublicUser:
    """FastAPI dependency for platform tools.

    For now this allows either:
    - true superadmins
    - admins of the owner/default organization
    """
    from src.db.users import AnonymousUser

    if isinstance(current_user, AnonymousUser):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if not (
        is_user_superadmin(current_user.id, db_session)
        or is_user_owner_org_admin(current_user.id, db_session)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )

    return current_user

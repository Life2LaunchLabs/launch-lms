"""Platform › Settings › API keys: platform-wide keys (Pexels for now), superadmins only."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.platform_secrets import PlatformSecretUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.superadmin import require_superadmin
from src.services import platform_secrets

router = APIRouter(dependencies=[Depends(require_superadmin)])


@router.get("")
async def list_platform_keys(db_session: Session = Depends(get_db_session)):
    """Which keys are set and where from, never the keys."""
    return platform_secrets.describe(db_session)


@router.put("/{name}")
async def save_platform_key(
    name: str,
    payload: PlatformSecretUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """Save (or, with an empty value, remove) a platform-wide API key."""
    return platform_secrets.save(db_session, name, payload.value, current_user.id)

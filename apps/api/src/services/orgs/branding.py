from datetime import datetime

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.organization_config import DarkLogoConfig, OrganizationConfig
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.services.orgs.orgs import _deep_copy_config, rbac_check


async def update_org_dark_logo_config(
    request: Request,
    dark_logo: DarkLogoConfig,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    """Use one logo in both themes, or keep a separate logo for dark mode."""
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    await rbac_check(request, org.org_uuid, current_user, "update", db_session)

    org_config = db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org.id)).first()
    if org_config is None:
        raise HTTPException(status_code=404, detail="Organization config not found")

    updated_config = _deep_copy_config(org_config)
    general = updated_config.setdefault("customization", {}).setdefault("general", {})
    general["separate_dark_logo"] = dark_logo.separate_dark_logo
    general["dark_logo_image"] = dark_logo.dark_logo_image

    org_config.config = updated_config
    org_config.update_date = str(datetime.now())
    db_session.add(org_config)
    db_session.commit()

    return {"detail": "Dark logo configuration updated"}

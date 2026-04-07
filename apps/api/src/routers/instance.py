from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from src.db.organizations import Organization
from src.core.events.database import get_db_session
from src.core.deployment_mode import get_deployment_mode
from src.core.capabilities import CORE_CAPABILITIES
from config.config import get_launchlms_config

router = APIRouter()


def _strip_port(domain: str) -> str:
    """Strip port from a domain string (e.g. 'localhost:3000' -> 'localhost')."""
    return domain.split(":")[0] if ":" in domain else domain


@router.get("/info")
async def get_instance_info(db_session: Session = Depends(get_db_session)):
    """Public endpoint returning instance configuration."""
    # Get default org slug (first org by ID)
    default_org_slug = "default"
    try:
        statement = select(Organization).order_by(Organization.id).limit(1)
        first_org = db_session.exec(statement).first()
        if first_org:
            default_org_slug = first_org.slug
    except Exception:
        pass

    config = get_launchlms_config()
    frontend_domain = config.hosting_config.frontend_domain
    top_domain = _strip_port(frontend_domain)

    return {
        "mode": get_deployment_mode(),
        "multi_org_enabled": CORE_CAPABILITIES["multi_org"],
        "capabilities": CORE_CAPABILITIES,
        "default_org_slug": default_org_slug,
        "frontend_domain": frontend_domain,
        "top_domain": top_domain,
    }

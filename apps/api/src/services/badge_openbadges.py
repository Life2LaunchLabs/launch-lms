from typing import Any

from fastapi import Request

from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.services.email.utils import get_base_url_from_request


OPEN_BADGES_CONTEXT = "https://w3id.org/openbadges/v2"


def get_public_base_url(request: Request) -> str:
    return get_base_url_from_request(request).rstrip("/")


def get_public_api_base_url(request: Request) -> str:
    return f"{get_public_base_url(request)}/api/v1"


def get_org_badge_issuer_config(
    org: Organization, org_config: OrganizationConfig | None
) -> dict[str, str]:
    config = org_config.config if org_config and org_config.config else {}
    customization = config.get("customization", {}) if isinstance(config, dict) else {}
    issuer = customization.get("badge_issuer", {}) if isinstance(customization, dict) else {}
    return {
        "name": issuer.get("name") or org.name or "",
        "url": issuer.get("url") or "",
        "email": issuer.get("email") or org.email or "",
        "description": issuer.get("description") or org.description or org.about or "",
        "image_url": issuer.get("image_url") or "",
    }


def build_issuer_payload(
    request: Request, org: Organization, org_config: OrganizationConfig | None
) -> dict[str, Any]:
    base_url = get_public_base_url(request)
    issuer = get_org_badge_issuer_config(org, org_config)
    return {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "Issuer",
        "id": f"{get_public_api_base_url(request)}/badge-awards/issuer/{org.org_uuid}",
        "name": issuer["name"] or org.name,
        "url": issuer["url"] or f"{base_url}/orgs/{org.slug}",
        "email": issuer["email"] or org.email,
        "description": issuer["description"] or org.description or "",
        "image": issuer["image_url"] or (
            f"{base_url}/content/orgs/{org.org_uuid}/logos/{org.logo_image}"
            if org.logo_image
            else f"{base_url}/logo-icon.svg"
        ),
    }

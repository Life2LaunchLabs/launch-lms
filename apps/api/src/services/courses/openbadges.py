import hashlib
from typing import Any

from fastapi import Request

from src.db.organizations import Organization
from src.db.courses.courses import Course
from src.db.courses.certifications import Certifications, CertificateUser
from src.db.organization_config import OrganizationConfig
from src.db.users import User
from src.services.email.utils import get_base_url_from_request


OPEN_BADGES_CONTEXT = "https://w3id.org/openbadges/v2"
DEFAULT_BADGE_CRITERIA_TEXT = "Complete all required activities in this course."


def get_public_base_url(request: Request) -> str:
    return get_base_url_from_request(request).rstrip("/")


def get_public_api_base_url(request: Request) -> str:
    return f"{get_public_base_url(request)}/api/v1"


def get_org_badge_issuer_config(org: Organization, org_config: OrganizationConfig | None) -> dict[str, str]:
    config = org_config.config if org_config and org_config.config else {}
    customization = config.get("customization", {}) if isinstance(config, dict) else {}
    issuer_config = customization.get("badge_issuer", {}) if isinstance(customization, dict) else {}

    return {
        "name": issuer_config.get("name") or org.name or "",
        "url": issuer_config.get("url") or "",
        "email": issuer_config.get("email") or org.email or "",
        "description": issuer_config.get("description") or org.description or org.about or "",
        "image_url": issuer_config.get("image_url") or "",
    }


def build_issuer_payload(
    request: Request,
    org: Organization,
    org_config: OrganizationConfig | None,
) -> dict[str, Any]:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    issuer_config = get_org_badge_issuer_config(org, org_config)
    issuer_url = issuer_config["url"] or f"{base_url}/orgs/{org.slug}"
    image_url = issuer_config["image_url"] or (
        f"{base_url}/api/v1/content/orgs/{org.org_uuid}/logos/{org.logo_image}"
        if org.logo_image else f"{base_url}/logo-icon.svg"
    )

    return {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "Issuer",
        "id": f"{api_base}/certifications/issuer/org/{org.org_uuid}",
        "name": issuer_config["name"] or org.name,
        "url": issuer_url,
        "email": issuer_config["email"] or org.email,
        "description": issuer_config["description"] or org.description or "",
        "image": image_url,
    }


def build_badge_class_payload(
    request: Request,
    org: Organization,
    course: Course,
    certification: Certifications,
    org_config: OrganizationConfig | None,
) -> dict[str, Any]:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    issuer = build_issuer_payload(request, org, org_config)
    config = certification.config or {}
    criteria_url = config.get("badge_criteria_url") or f"{base_url}/orgs/{org.slug}/course/{course.course_uuid.replace('course_', '')}"
    criteria_narrative = config.get("badge_criteria_text") or DEFAULT_BADGE_CRITERIA_TEXT
    image_url = config.get("badge_image_url") or issuer.get("image") or f"{base_url}/logo-icon.svg"

    badge_class: dict[str, Any] = {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "BadgeClass",
        "id": f"{api_base}/certifications/badge-class/course/{course.course_uuid}",
        "issuer": issuer["id"],
        "name": config.get("badge_name") or config.get("certification_name") or course.name,
        "description": config.get("badge_description") or config.get("certification_description") or course.description or "",
        "image": image_url,
        "criteria": {
            "narrative": criteria_narrative,
            "id": criteria_url,
        },
    }

    support_url = config.get("badge_support_url")
    if support_url:
        badge_class["extensions:supportUrl"] = support_url

    return badge_class


def build_assertion_payload(
    request: Request,
    org: Organization,
    course: Course,
    certification: Certifications,
    certificate_user: CertificateUser,
    user: User,
    org_config: OrganizationConfig | None,
) -> dict[str, Any]:
    api_base = get_public_api_base_url(request)
    badge_class = build_badge_class_payload(request, org, course, certification, org_config)
    recipient_email = (user.email or "").strip().lower()
    salt = f"launchlms-{certificate_user.user_certification_uuid[-12:]}"
    identity_hash = hashlib.sha256(f"{recipient_email}{salt}".encode("utf-8")).hexdigest()
    support_url = (certification.config or {}).get("badge_support_url")

    assertion: dict[str, Any] = {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "Assertion",
        "id": f"{api_base}/certifications/assertion/{certificate_user.user_certification_uuid}",
        "badge": badge_class["id"],
        "verification": {
            "type": "HostedBadge",
        },
        "issuedOn": certificate_user.created_at,
        "recipient": {
            "type": "email",
            "hashed": True,
            "salt": salt,
            "identity": f"sha256${identity_hash}",
        },
    }

    if support_url:
        assertion["evidence"] = [{
            "id": support_url,
            "narrative": "Badge support and issuer contact page",
        }]

    return assertion

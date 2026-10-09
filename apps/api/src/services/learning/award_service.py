"""Awards and Open Badges payloads."""

import hashlib
from copy import deepcopy
from datetime import datetime
from uuid import uuid4
from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from src.db.learning import (
    LearningAwardCreate,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser, User
from src.services.badge_openbadges import (
    OPEN_BADGES_CONTEXT,
    build_issuer_payload,
    get_org_badge_issuer_config,
    get_public_api_base_url,
    get_public_base_url,
)
from src.services.learning import access_rules, enrollment, lookups


async def confer_award(
    request: Request,
    data: LearningAwardCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    badge = enrollment._get_badge(db_session, data.badge_uuid)
    version = lookups._get_badge_version(db_session, badge, require_published=True)
    major_version = int((version.semantic_version or "1.0.0").split(".")[0])
    issuing_org_id = (
        data.issuing_org_id if data.issuing_org_id != badge.org_id else None
    )
    if issuing_org_id is not None:
        admin = access_rules._require_org_admin(db_session, current_user, issuing_org_id)
        if not enrollment._get_approved_issuer_authorization(
            db_session, badge.id or 0, issuing_org_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organization is not authorized to issue this badge",
            )
    else:
        admin = access_rules._require_org_admin(db_session, current_user, badge.org_id)
    if not badge.direct_conferral_enabled:
        raise HTTPException(
            status_code=422, detail="Direct conferral is disabled for this badge"
        )
    user = db_session.exec(select(User).where(User.id == data.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db_session.exec(
        select(LearningBadgeAward).where(
            LearningBadgeAward.badge_id == badge.id,
            LearningBadgeAward.user_id == user.id,
            LearningBadgeAward.major_version == major_version,
        )
    ).first()
    if existing:
        return build_award_response(request, db_session, existing)
    now = datetime.utcnow()
    award = LearningBadgeAward(
        award_uuid=f"award_{uuid4()}",
        badge_id=badge.id or 0,
        badge_version_id=version.id,
        major_version=major_version,
        org_id=badge.org_id,
        issuing_org_id=issuing_org_id,
        user_id=user.id or 0,
        source=LearningAwardSource.DIRECT_CONFERRAL,
        conferred_by_user_id=admin.id,
        issued_at=now,
        evidence=data.evidence,
        creation_date=str(now),
        update_date=str(now),
    )
    db_session.add(award)
    db_session.commit()
    db_session.refresh(award)
    return build_award_response(request, db_session, award)


def build_learning_badge_class_payload(
    request: Request,
    org: Organization,
    badge: LearningBadge,
    org_config: OrganizationConfig | None,
) -> dict:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    issuer = build_issuer_payload(request, org, org_config)
    criteria_url = (badge.badge_metadata or {}).get(
        "criteria_url"
    ) or f"{base_url}/orgs/{org.slug}/badges/{badge.badge_uuid.replace('badge_', '')}"
    image_url = (
        (badge.badge_metadata or {}).get("badge_image_url")
        or badge.thumbnail_image
        or issuer.get("image")
        or f"{base_url}/logo-icon.svg"
    )
    return {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "BadgeClass",
        "id": f"{api_base}/badge-awards/badge-class/{badge.badge_uuid}",
        "issuer": issuer["id"],
        "name": (badge.badge_metadata or {}).get("badge_name") or badge.name,
        "description": (badge.badge_metadata or {}).get("badge_description")
        or badge.description
        or "",
        "image": image_url,
        "criteria": {
            "id": criteria_url,
            "narrative": badge.criteria
            or "Meet the criteria defined for this achievement.",
        },
    }


def build_learning_assertion_payload(
    request: Request,
    org: Organization,
    badge: LearningBadge,
    award: LearningBadgeAward,
    user: User,
    org_config: OrganizationConfig | None,
) -> dict:
    api_base = get_public_api_base_url(request)
    badge_class = build_learning_badge_class_payload(request, org, badge, org_config)
    recipient_email = (user.email or "").strip().lower()
    salt = f"launchlms-{award.award_uuid[-12:]}"
    identity_hash = hashlib.sha256(
        f"{recipient_email}{salt}".encode()
    ).hexdigest()
    payload = {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "Assertion",
        "id": f"{api_base}/badge-awards/assertion/{award.award_uuid}",
        "badge": badge_class["id"],
        "verification": {"type": "HostedBadge"},
        "issuedOn": award.issued_at.isoformat()
        if hasattr(award.issued_at, "isoformat")
        else str(award.issued_at),
        "recipient": {
            "type": "email",
            "hashed": True,
            "salt": salt,
            "identity": f"sha256${identity_hash}",
        },
    }
    if award.evidence:
        payload["evidence"] = [award.evidence]
    return payload


# ---------------------------------------------------------------------------
# Open Badges 3.0 (Verifiable Credentials data model)
#
# The issuing org is the authoritative `issuer` of the AchievementCredential;
# the org that designed the badge is the `creator` of the Achievement.
# ---------------------------------------------------------------------------

OPEN_BADGES_V3_CONTEXTS = [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
]


def build_ob3_profile(
    request: Request, org: Organization, org_config: OrganizationConfig | None
) -> dict:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    issuer_config = get_org_badge_issuer_config(org, org_config)
    image_url = issuer_config["image_url"] or (
        f"{base_url}/content/orgs/{org.org_uuid}/logos/{org.logo_image}"
        if org.logo_image
        else f"{base_url}/logo-icon.svg"
    )
    profile: dict = {
        "id": f"{api_base}/badge-awards/issuer/{org.org_uuid}",
        "type": ["Profile"],
        "name": issuer_config["name"] or org.name,
        "url": issuer_config["url"] or f"{base_url}/orgs/{org.slug}",
        "image": {"id": image_url, "type": "Image"},
    }
    if issuer_config["email"] or org.email:
        profile["email"] = issuer_config["email"] or org.email
    if issuer_config["description"]:
        profile["description"] = issuer_config["description"]
    return profile


def build_ob3_achievement(
    request: Request,
    creator_org: Organization,
    badge: LearningBadge,
    creator_org_config: OrganizationConfig | None,
) -> dict:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    creator_profile = build_ob3_profile(request, creator_org, creator_org_config)
    criteria_url = (
        (badge.badge_metadata or {}).get("criteria_url")
        or f"{base_url}/orgs/{creator_org.slug}/badges/{badge.badge_uuid.replace('badge_', '')}"
    )
    image_url = (
        (badge.badge_metadata or {}).get("badge_image_url")
        or badge.thumbnail_image
        or f"{base_url}/logo-icon.svg"
    )
    achievement = {
        "id": f"{api_base}/badge-awards/achievement/{badge.badge_uuid}",
        "type": ["Achievement"],
        "creator": creator_profile,
        "name": (badge.badge_metadata or {}).get("badge_name") or badge.name,
        "description": (badge.badge_metadata or {}).get("badge_description")
        or badge.description
        or "",
        "criteria": {
            "id": criteria_url,
            "narrative": badge.criteria
            or "Meet the criteria defined for this achievement.",
        },
        "image": {"id": image_url, "type": "Image"},
    }
    achievement_type = (badge.badge_metadata or {}).get("achievement_type")
    if achievement_type:
        achievement["achievementType"] = achievement_type
    achievement_version = (badge.badge_metadata or {}).get("achievement_version")
    if achievement_version:
        achievement["version"] = achievement_version
    return achievement


def build_ob3_credential(
    request: Request,
    issuing_org: Organization,
    issuing_org_config: OrganizationConfig | None,
    creator_org: Organization,
    creator_org_config: OrganizationConfig | None,
    badge: LearningBadge,
    award: LearningBadgeAward,
    user: User,
) -> dict:
    api_base = get_public_api_base_url(request)
    achievement = build_ob3_achievement(request, creator_org, badge, creator_org_config)
    recipient_email = (user.email or "").strip().lower()
    salt = f"launchlms-{award.award_uuid[-12:]}"
    identity_hash = hashlib.sha256(
        f"{recipient_email}{salt}".encode()
    ).hexdigest()
    issued_at = (
        award.issued_at.isoformat()
        if hasattr(award.issued_at, "isoformat")
        else str(award.issued_at)
    )
    if not issued_at.endswith("Z") and "+" not in issued_at:
        issued_at = f"{issued_at}Z"
    credential: dict = {
        "@context": OPEN_BADGES_V3_CONTEXTS,
        "id": f"{api_base}/badge-awards/credential/{award.award_uuid}",
        "type": ["VerifiableCredential", "OpenBadgeCredential"],
        "issuer": build_ob3_profile(request, issuing_org, issuing_org_config),
        "validFrom": issued_at,
        "name": achievement["name"],
        "credentialSubject": {
            "type": ["AchievementSubject"],
            "identifier": [
                {
                    "type": "IdentityObject",
                    "hashed": True,
                    "identityHash": f"sha256${identity_hash}",
                    "identityType": "emailAddress",
                    "salt": salt,
                }
            ],
            "achievement": achievement,
        },
    }
    if award.evidence:
        evidence = {
            "type": ["Evidence"],
            **{k: v for k, v in award.evidence.items() if isinstance(k, str)},
        }
        credential["evidence"] = [evidence]
    return credential


def build_award_response(
    request: Request, db_session: Session, award: LearningBadgeAward
) -> dict:
    badge = db_session.exec(
        select(LearningBadge).where(LearningBadge.id == award.badge_id)
    ).first()
    user = db_session.exec(select(User).where(User.id == award.user_id)).first()
    if not badge or not user:
        raise HTTPException(status_code=404, detail="Badge award data not found")
    version = lookups._version_for_content(db_session, award.badge_version_id)
    if version:
        definition = deepcopy(version.definition or {})
        definition["badge_metadata"] = {
            **(definition.get("badge_metadata") or {}),
            "achievement_version": version.semantic_version,
        }
        badge = badge.model_copy(update=definition)
    org = access_rules._get_org(db_session, badge.org_id)
    org_config = access_rules._get_org_config(db_session, badge.org_id)
    if award.issuing_org_id is not None and award.issuing_org_id != badge.org_id:
        issuing_org = access_rules._get_org(db_session, award.issuing_org_id)
        issuing_org_config = access_rules._get_org_config(db_session, award.issuing_org_id)
    else:
        issuing_org = org
        issuing_org_config = org_config
    issuer = build_issuer_payload(request, issuing_org, issuing_org_config)
    badge_class = build_learning_badge_class_payload(request, org, badge, org_config)
    assertion = build_learning_assertion_payload(
        request, org, badge, award, user, org_config
    )
    credential = build_ob3_credential(
        request, issuing_org, issuing_org_config, org, org_config, badge, award, user
    )
    return {
        "award": award.model_dump(),
        "badge": lookups._versioned_badge_read(db_session, badge, version).model_dump(),
        "badge_assertion": assertion,
        "badge_class": badge_class,
        "issuer": issuer,
        "open_badges": {
            "assertion": assertion,
            "badge_class": badge_class,
            "issuer": issuer,
            "credential": credential,
        },
        "user": {
            "id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        },
        "org": {
            "id": org.id,
            "org_uuid": org.org_uuid,
            "slug": org.slug,
            "name": org.name,
            "logo_image": org.logo_image,
        },
        "issuing_org": {
            "id": issuing_org.id,
            "org_uuid": issuing_org.org_uuid,
            "slug": issuing_org.slug,
            "name": issuing_org.name,
            "logo_image": issuing_org.logo_image,
        },
    }


async def get_award(request: Request, award_uuid: str, db_session: Session) -> dict:
    award = db_session.exec(
        select(LearningBadgeAward).where(
            LearningBadgeAward.award_uuid == access_rules._clean_uuid(award_uuid, "award_")
        )
    ).first()
    if not award:
        raise HTTPException(status_code=404, detail="Badge award not found")
    return build_award_response(request, db_session, award)


async def list_user_awards(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    org_id: int | None = None,
) -> list[dict]:
    user = access_rules._require_user(current_user)
    statement = select(LearningBadgeAward).where(LearningBadgeAward.user_id == user.id)
    if org_id is not None:
        statement = statement.where(LearningBadgeAward.org_id == org_id)
    awards = db_session.exec(statement).all()
    return [build_award_response(request, db_session, award) for award in awards]

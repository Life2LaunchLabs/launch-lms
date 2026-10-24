"""Open Badges 3.0: a badge award as an OpenBadgeCredential.

The organization that ran the plan with the learner (or awarded the badge) is
the credential's ``issuer``; the organization that owns the plan is the
achievement's ``creator``. Both are the organization's own details. Ids are
stable URLs on the API host, and pages people read are on the web host.
"""

from __future__ import annotations

import hashlib

from sqlmodel import Session

from src.db.badges import AwardSource, BadgeAward
from src.db.organizations import Organization
from src.db.users import User
from src.services.oauth.config import frontend_url, issuer

CONTEXTS = [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
]


def api_url(path: str) -> str:
    return f"{issuer()}/api/v1/{path.lstrip('/')}"


def org_page(org: Organization) -> str:
    return f"{frontend_url()}/orgs/{org.slug}"


def plan_page(org_slug: str, template_uuid: str) -> str:
    """The plan's public page: what earning its badge takes."""
    return f"{frontend_url()}/orgs/{org_slug}/discover/plans/{template_uuid}"


def _image(url: str) -> str:
    return url if url.startswith("http") else f"{frontend_url()}{url}"


def profile(org: Organization) -> dict:
    """The organization as an Open Badges Profile (issuer or creator)."""
    result: dict = {"id": api_url(f"badge-awards/issuer/{org.org_uuid}"), "type": ["Profile"], "name": org.name, "url": org_page(org)}
    if org.logo_image:
        result["image"] = {"id": f"{frontend_url()}/content/orgs/{org.org_uuid}/logos/{org.logo_image}", "type": "Image"}
    if org.email:
        result["email"] = org.email
    if org.description:
        result["description"] = org.description
    return result


def achievement(db: Session, earned: dict) -> dict:
    """An award's achievement (``BadgeAward.achievement``) as an Open Badges Achievement."""
    creator = db.get(Organization, (earned.get("creator") or {}).get("id")) if earned.get("creator") else None
    slug = (earned.get("creator") or {}).get("slug") or ""
    result: dict = {
        "id": api_url(f"badge-awards/achievement/{earned['template_uuid']}"),
        "type": ["Achievement"],
        "achievementType": earned.get("kind") or "Badge",
        "name": earned["name"],
        "description": earned.get("description") or earned["name"],
        "criteria": {"id": plan_page(slug, earned["template_uuid"]), "narrative": earned.get("criteria_narrative") or ""},
    }
    criteria_url = result["criteria"]["id"]
    if earned.get("image_url"):
        result["image"] = {"id": _image(earned["image_url"]), "type": "Image"}
    if creator:
        result["creator"] = profile(creator)
    if earned.get("version"):
        result["version"] = earned["version"]
    if earned.get("skills"):
        result["tag"] = list(earned["skills"])
    if earned.get("alignment"):
        result["alignment"] = [
            {"type": ["Alignment"], "targetName": item["name"], "targetUrl": f"{criteria_url}#{item['node_uuid']}",
             **({"targetCode": item["code"]} if item.get("code") else {}),
             **({"targetDescription": item["description"]} if item.get("description") else {}),
             **({"targetFramework": item["framework"]} if item.get("framework") else {})}
            for item in earned["alignment"]
        ]
    for key, field in (("human_code", "humanCode"), ("field_of_study", "fieldOfStudy"), ("specialization", "specialization"),
                       ("credits_available", "creditsAvailable"), ("in_language", "inLanguage")):
        if earned.get(key) not in (None, ""):
            result[field] = earned[key]
    return result


def _identity(award: BadgeAward, user: User) -> dict:
    salt = award.award_uuid[-12:]
    digest = hashlib.sha256(f"{(user.email or '').strip().lower()}{salt}".encode()).hexdigest()
    return {"type": "IdentityObject", "hashed": True, "identityHash": f"sha256${digest}", "identityType": "emailAddress", "salt": salt}


def _evidence(award: BadgeAward, issuing: Organization | None) -> list[dict]:
    if getattr(award.source, "value", award.source) == AwardSource.DIRECT_AWARD.value:
        item: dict = {"type": ["Evidence"], "name": "Awarded for equivalent work", "genre": "Staff sign-off",
                      "description": award.statement or "", "audience": issuing.name if issuing else ""}
        if award.evidence_url:
            item["id"] = award.evidence_url
        return [item]
    return [{"type": ["Evidence"], "name": "Finished the plan", "genre": "Plan completion", "description": award.achievement.get("criteria_narrative") or ""}]


def credential(db: Session, award: BadgeAward) -> dict:
    """The award as an OpenBadgeCredential."""
    user = db.get(User, award.user_id)
    issuing = db.get(Organization, award.issuing_org_id) if award.issuing_org_id else None
    issuing = issuing or (db.get(Organization, award.creator_org_id) if award.creator_org_id else None)
    result: dict = {
        "@context": CONTEXTS,
        "id": api_url(f"badge-awards/{award.award_uuid}/credential"),
        "type": ["VerifiableCredential", "OpenBadgeCredential"],
        "name": award.achievement.get("name") or "",
        "issuer": profile(issuing) if issuing else {"id": api_url("badge-awards/issuer/unknown"), "type": ["Profile"], "name": ""},
        "validFrom": f"{award.issued_at.replace(microsecond=0).isoformat()}Z",
        "credentialSubject": {
            "type": ["AchievementSubject"],
            "identifier": [_identity(award, user)] if user else [],
            "achievement": achievement(db, award.achievement),
        },
        "evidence": _evidence(award, issuing),
    }
    return result

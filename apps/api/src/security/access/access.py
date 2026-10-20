"""
Org access: one answer to "may this organization use X, and how much?".

Order: tier, then partner program, then a superadmin grant. Legacy features
are off whatever the config says. The owner organization (the install's
first org) has every tier feature, partner program and request feature.
"""

from dataclasses import dataclass, field
from datetime import datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import or_
from sqlmodel import Session, func, select
from src.core.events.database import get_db_session
from src.db.organization_config import OrganizationConfig
from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.organizations import Organization
from src.db.roles import Role, RoleTypeEnum
from src.db.user_organizations import UserOrganization
from src.security.access.catalog import (
    FEATURES,
    LIMIT_LABELS,
    LIMITS,
    PARTNER_PROGRAMS,
    TIERS,
    Tier,
    tier_index,
)


@dataclass
class OrgAccess:
    tier: Tier
    partners: set[str] = field(default_factory=set)
    grants: dict = field(default_factory=dict)
    owner: bool = False

    def has(self, feature: str) -> bool:
        spec = FEATURES.get(feature)
        if spec is None or spec.off:
            return False
        if self.owner:
            return True
        if spec.tier and tier_index(self.tier) >= tier_index(spec.tier):
            return True
        if spec.partner and spec.partner in self.partners:
            return True
        return bool((self.grants.get(feature) or {}).get("enabled"))

    def limit(self, name: str) -> int:
        """The limit for a counted feature; 0 means unlimited."""
        if self.owner:
            return 0
        base = LIMITS[name][self.tier]
        if base == 0:
            return 0
        return base + int((self.grants.get(name) or {}).get("extra", 0))

    def unlock(self, feature: str) -> dict | None:
        """What the org could request to turn a feature on, or None when nothing can."""
        spec = FEATURES.get(feature)
        if spec is None or spec.off or self.has(feature):
            return None
        if spec.tier:
            return {"type": "tier_upgrade", "value": spec.tier}
        if spec.partner:
            return {"type": "partner_application", "value": spec.partner}
        return {"type": "feature_request", "value": feature}

    def to_dict(self) -> dict:
        return {
            "tier": self.tier,
            "owner": self.owner,
            "partners": sorted(self.partners),
            "features": {
                key: {"enabled": self.has(key), "unlock": self.unlock(key)}
                for key, spec in FEATURES.items()
                if not spec.off
            },
            "limits": {name: self.limit(name) for name in LIMITS},
        }


def config_tier(config: dict | None) -> Tier:
    tier = (config or {}).get("tier")
    return tier if tier in TIERS else "free"


def owner_org_id(db_session: Session) -> int | None:
    return db_session.exec(select(Organization.id).order_by(Organization.id).limit(1)).first()  # type: ignore[arg-type]


def access_from_config(config: dict | None, owner: bool = False) -> OrgAccess:
    config = config or {}
    partners = {key for key in config.get("partners") or [] if key in PARTNER_PROGRAMS}
    return OrgAccess(tier=config_tier(config), partners=partners, grants=config.get("grants") or {}, owner=owner)


def org_access(org_id: int, db_session: Session) -> OrgAccess:
    row = db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    return access_from_config(row.config if row else None, owner=owner_org_id(db_session) == org_id)


def orgs_with_feature(org_ids: set[int], feature: str, db_session: Session) -> set[int]:
    """The orgs among `org_ids` that have a feature, read in one query."""
    if not org_ids:
        return set()
    owner = owner_org_id(db_session)
    rows = db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id.in_(org_ids))).all()  # type: ignore[union-attr]
    configs = {row.org_id: row.config for row in rows}
    return {org_id for org_id in org_ids if access_from_config(configs.get(org_id), owner=org_id == owner).has(feature)}


def unavailable(feature: str, access: OrgAccess | None = None) -> HTTPException:
    spec = FEATURES[feature]
    if spec.off:
        return HTTPException(status_code=403, detail=f"{spec.label} isn't available")
    unlock = access.unlock(feature) if access else None
    if unlock and unlock["type"] == "tier_upgrade":
        detail = f"{spec.label} needs the {unlock['value'].capitalize()} tier"
    elif unlock and unlock["type"] == "partner_application":
        detail = f"{spec.label} needs approval as a {PARTNER_PROGRAMS[unlock['value']].label.lower()}"
    else:
        detail = f"{spec.label} isn't enabled for this organization"
    return HTTPException(status_code=403, detail=detail)


def ensure_feature(org_id: int, feature: str, db_session: Session) -> OrgAccess:
    access = org_access(org_id, db_session)
    if not access.has(feature):
        raise unavailable(feature, access)
    return access


# ============================================================================
# Counted limits
# ============================================================================

def is_staff_role(role: Role | None) -> bool:
    """Staff are members whose role opens the admin dashboard."""
    rights = role.rights if role else None
    return isinstance(rights, dict) and bool((rights.get("dashboard") or {}).get("action_access"))


def _staff_role_ids(org_id: int, db_session: Session) -> list[int]:
    roles = db_session.exec(select(Role).where(or_(Role.org_id == org_id, Role.role_type == RoleTypeEnum.TYPE_GLOBAL))).all()
    return [role.id for role in roles if role.id is not None and is_staff_role(role)]


def count_usage(name: str, org_id: int, db_session: Session) -> int:
    """Members plus pending, unexpired invitations; learners also count reserved join-link spots."""
    now = datetime.utcnow()
    staff_ids = _staff_role_ids(org_id, db_session)
    staff = name == "staff_seats"

    def role_filter(column):
        if staff:
            return column.in_(staff_ids) if staff_ids else False
        return column.not_in(staff_ids) if staff_ids else True

    members = db_session.exec(select(func.count()).where(UserOrganization.org_id == org_id, role_filter(UserOrganization.role_id))).one()
    invitations = db_session.exec(select(func.count()).where(
        OrganizationInvitation.org_id == org_id,
        OrganizationInvitation.status == "pending",
        OrganizationInvitation.expires_at > now,
        role_filter(OrganizationInvitation.role_id),
    )).one()
    total = members + invitations
    if not staff:
        links = db_session.exec(select(OrganizationJoinLink).where(
            OrganizationJoinLink.org_id == org_id,
            OrganizationJoinLink.status == "active",
            OrganizationJoinLink.expires_at > now,
            role_filter(OrganizationJoinLink.role_id),
        )).all()
        total += sum(max(0, link.max_redemptions - link.redemption_count) for link in links)
    return total


def capacity_left(name: str, org_id: int, db_session: Session) -> int | None:
    """How many more fit, or None when unlimited."""
    limit = org_access(org_id, db_session).limit(name)
    if limit == 0:
        return None
    return max(0, limit - count_usage(name, org_id, db_session))


def require_capacity(name: str, org_id: int, db_session: Session, adding: int = 1) -> None:
    left = capacity_left(name, org_id, db_session)
    if left is not None and adding > left:
        limit = org_access(org_id, db_session).limit(name)
        raise HTTPException(
            status_code=403,
            detail=f"This organization has reached its limit of {limit} {LIMIT_LABELS[name]}",
        )


def require_role_capacity(role: Role | None, org_id: int, db_session: Session, adding: int = 1) -> None:
    require_capacity("staff_seats" if is_staff_role(role) else "learners", org_id, db_session, adding)


# ============================================================================
# Route dependency
# ============================================================================

def _int(value) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def org_id_from_request(request: Request, db_session: Session) -> int | None:
    """The org a request acts on: an `org_id` path or query parameter, or the org owning the addressed group or resource."""
    org_id = _int(request.path_params.get("org_id")) or _int(request.query_params.get("org_id"))
    if org_id is not None:
        return org_id
    usergroup_id = _int(request.path_params.get("usergroup_id"))
    if usergroup_id is not None:
        from src.db.usergroups import UserGroup
        return db_session.exec(select(UserGroup.org_id).where(UserGroup.id == usergroup_id)).first()
    from src.db.resources import Resource, ResourceChannel, ResourceTag
    resource_uuid = request.path_params.get("resource_uuid")
    if resource_uuid:
        return db_session.exec(select(Resource.org_id).where(Resource.resource_uuid == resource_uuid)).first()
    channel_uuid = request.path_params.get("channel_uuid")
    if channel_uuid:
        return db_session.exec(select(ResourceChannel.org_id).where(ResourceChannel.channel_uuid == channel_uuid)).first()
    tag_uuid = request.path_params.get("tag_uuid")
    if tag_uuid:
        return db_session.exec(select(ResourceTag.org_id).where(ResourceTag.tag_uuid == tag_uuid)).first()
    return None


def require_feature(feature: str):
    """Route dependency: 403 unless the request's org has the feature. Legacy features are refused outright."""
    spec = FEATURES[feature]

    async def dependency(request: Request, db_session: Session = Depends(get_db_session)) -> None:
        if spec.off:
            raise unavailable(feature)
        org_id = org_id_from_request(request, db_session)
        if org_id is None:
            raise HTTPException(status_code=400, detail="Organization ID is required")
        ensure_feature(org_id, feature, db_session)

    return dependency

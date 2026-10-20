"""orgs: plans and packages become tiers, partner programs and grants (config 3.0)

Every organization config is rewritten to the 3.0 document:

- plan -> tier (master and enterprise -> enterprise, full -> full, anything else -> free;
  the owner organization, the lowest id, -> enterprise)
- the badge publishing package or override -> the badge_publisher partner program;
  orgs on Full or above that already authored resources -> resource_partner
- other packages and overrides -> grants for what they turned on (groups, API tokens,
  advanced reports, payments, SSO, audit logs) and extra seats
- orgs already above the new learner or staff limits get the difference as a grant
- admin_toggles.members.signup_mode (or the v1 features.members.signup_mode) -> signup_mode
- customization and messaging are kept

Plan requests are renamed to the new kinds and queued badge issuer requests move on
to the creator, since issuing needs no package any more. Each org's change is logged.

Revision ID: b3ee9e60e07c
Revises: e8f3b66b5434
"""
import json
import logging
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3ee9e60e07c'
down_revision: Union[str, None] = 'e8f3b66b5434'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

# Frozen copy of the limits this migration grants against (the catalog may change later).
LIMITS = {
    "learners": {"free": 25, "full": 200, "enterprise": 0},
    "staff_seats": {"free": 2, "full": 12, "enterprise": 0},
}
TIERS = ("free", "full", "enterprise")
TIER_FROM_PLAN = {"master": "enterprise", "enterprise": "enterprise", "full": "full"}
# What each old package turned on, as new grants.
PACKAGE_GRANTS = {
    "analytics": ["advanced_reports"],
    "advanced_user_management": ["groups", "api_tokens"],
}
# Old feature names that carry over as grants when an override enabled them.
OVERRIDE_GRANTS = {
    "usergroups": "groups",
    "roles": "groups",
    "analytics": "advanced_reports",
    "api": "api_tokens",
    "payments": "payments",
    "sso": "sso",
    "audit_logs": "audit_logs",
}
# Features each new tier includes, so grants only record what the tier doesn't.
TIER_FEATURES = {
    "free": set(),
    "full": {"groups", "bulk_invites"},
    "enterprise": {"groups", "bulk_invites", "advanced_reports", "sso", "audit_logs", "api_tokens"},
}


def _v2(config: dict) -> bool:
    return str(config.get("config_version", "1.0")).startswith("2")


def convert(config: dict | None, *, owner: bool = False, has_resources: bool = False) -> dict:
    """The 3.0 document for one org's old (v1 or v2) config."""
    config = dict(config or {})
    if str(config.get("config_version", "")).startswith("3"):
        return config
    v2 = _v2(config)
    plan = config.get("plan") if v2 else (config.get("cloud") or {}).get("plan")
    tier = "enterprise" if owner else TIER_FROM_PLAN.get(str(plan or "free"), "free")

    packages = set(config.get("packages") or []) if v2 else set()
    overrides = (config.get("overrides") or {}) if v2 else {}

    partners: set[str] = set()
    if "badge_creation" in packages or (overrides.get("marketplace_publishing") or {}).get("enabled"):
        partners.add("badge_publisher")
    if has_resources and (tier != "free" or (overrides.get("resources") or {}).get("enabled")):
        partners.add("resource_partner")

    features: set[str] = set()
    for package in packages:
        features.update(PACKAGE_GRANTS.get(package, []))
    for old, new in OVERRIDE_GRANTS.items():
        if (overrides.get(old) or {}).get("enabled"):
            features.add(new)
    grants: dict = {feature: {"enabled": True} for feature in sorted(features - TIER_FEATURES[tier])}
    for old, new in (("members", "learners"), ("admin_seats", "staff_seats")):
        extra = int((overrides.get(old) or {}).get("extra_limit") or 0)
        if extra > 0 and LIMITS[new][tier]:
            grants[new] = {"extra": extra}

    if v2:
        signup_mode = ((config.get("admin_toggles") or {}).get("members") or {}).get("signup_mode")
    else:
        signup_mode = ((config.get("features") or {}).get("members") or {}).get("signup_mode")

    customization = dict(config.get("customization") or {}) if v2 else {}
    if not v2:
        general = config.get("general") or {}
        customization["general"] = {key: general[key] for key in ("color", "footer_text", "favicon_image") if key in general}
        if general.get("auth_branding"):
            customization["auth_branding"] = general["auth_branding"]
        if config.get("seo"):
            customization["seo"] = config["seo"]
        if config.get("landing"):
            customization["landing"] = config["landing"]

    document = {
        "config_version": "3.0",
        "active": bool(config.get("active", True)) if v2 else bool((config.get("general") or {}).get("enabled", True)),
        "tier": tier,
        "partners": sorted(partners),
        "grants": grants,
        "signup_mode": signup_mode if signup_mode in ("open", "inviteOnly") else "open",
        "customization": customization,
    }
    if v2 and config.get("messaging"):
        document["messaging"] = config["messaging"]
    return document


def grant_overage(document: dict, usage: dict[str, int]) -> dict:
    """Add an extra-seat grant for any limit the org already exceeds."""
    tier = document["tier"]
    grants = dict(document.get("grants") or {})
    for name, used in usage.items():
        base = LIMITS[name][tier]
        if not base:
            continue
        allowed = base + int((grants.get(name) or {}).get("extra", 0))
        if used > allowed:
            grants[name] = {"extra": used - base}
    return {**document, "grants": grants}


def _staff_role_ids(conn) -> dict[int | None, set[int]]:
    """Staff role ids per org (None for global roles): roles whose rights open the dashboard."""
    staff: dict[int | None, set[int]] = {}
    for role_id, org_id, rights in conn.execute(sa.text("SELECT id, org_id, rights FROM role")):
        if isinstance(rights, str):
            try:
                rights = json.loads(rights)
            except ValueError:
                rights = {}
        if isinstance(rights, dict) and (rights.get("dashboard") or {}).get("action_access"):
            staff.setdefault(org_id, set()).add(role_id)
    return staff


def _usage(conn, org_id: int, staff_ids: set[int]) -> dict[str, int]:
    rows = list(conn.execute(sa.text("SELECT role_id FROM userorganization WHERE org_id = :org"), {"org": org_id}))
    rows += list(conn.execute(
        sa.text("SELECT role_id FROM organizationinvitation WHERE org_id = :org AND status = 'pending' AND expires_at > :now"),
        {"org": org_id, "now": datetime.utcnow()},
    ))
    staff = sum(1 for (role_id,) in rows if role_id in staff_ids)
    return {"learners": len(rows) - staff, "staff_seats": staff}


def upgrade() -> None:
    conn = op.get_bind()
    owner_id = conn.execute(sa.text("SELECT MIN(id) FROM organization")).scalar()
    with_resources = {org_id for (org_id,) in conn.execute(sa.text("SELECT DISTINCT org_id FROM resource"))}
    staff = _staff_role_ids(conn)
    global_staff = staff.get(None, set())

    for row_id, org_id, raw in list(conn.execute(sa.text("SELECT id, org_id, config FROM organizationconfig"))):
        config = json.loads(raw) if isinstance(raw, str) else (raw or {})
        before = (config.get("plan") if _v2(config) else (config.get("cloud") or {}).get("plan"), sorted(config.get("packages") or []))
        document = convert(config, owner=org_id == owner_id, has_resources=org_id in with_resources)
        document = grant_overage(document, _usage(conn, org_id, global_staff | staff.get(org_id, set())))
        conn.execute(
            sa.text("UPDATE organizationconfig SET config = :config WHERE id = :id").bindparams(sa.bindparam("config", type_=sa.JSON)),
            {"config": document, "id": row_id},
        )
        logger.info(
            "org %s: plan %s packages %s -> tier %s partners %s grants %s",
            org_id, before[0], before[1], document["tier"], document["partners"], document["grants"],
        )

    conn.execute(sa.text("UPDATE plan_request SET request_type = 'tier_upgrade' WHERE request_type = 'plan_upgrade'"))
    conn.execute(sa.text(
        "UPDATE plan_request SET request_type = 'partner_application', requested_value = 'badge_publisher' "
        "WHERE request_type = 'package_add' AND requested_value = 'badge_creation'"
    ))
    # Every other package request asks for something that is now in a tier or switched off.
    conn.execute(sa.text(
        "UPDATE plan_request SET status = 'denied', message = 'Packages were retired; request a tier upgrade instead.' "
        "WHERE request_type = 'package_add' AND status = 'pending'"
    ))
    conn.execute(sa.text("UPDATE badgeissuerauthorization SET status = 'requested' WHERE status IN ('queued', 'package_denied')"))


def downgrade() -> None:
    # The old plan and package documents are not kept; restore from a backup to go back.
    raise NotImplementedError("Org access tiers can't be converted back to plans and packages")

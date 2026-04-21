"""
Plan-based feature restriction utilities.

Single source of truth for plan hierarchy, feature configs, and limits.
Org config only stores the plan name and org feature settings
are derived from these definitions at runtime.

Plans: free → full → enterprise → master
"""

from typing import Literal


# Plan type definition
PlanLevel = Literal["free", "full", "enterprise", "master"]

# Plan hierarchy (lower index = lower tier)
PLAN_HIERARCHY: list[str] = ["free", "full", "enterprise", "master"]

# Feature to minimum required plan mapping.
# Features only gated by packages (analytics, certifications, ai,
# usergroups/roles/api_tokens) are available to "full" via package add-on.
FEATURE_PLAN_REQUIREMENTS: dict[str, PlanLevel] = {
    # Enabled via packages on full+; listed here so badges render correctly
    "ai": "full",
    "analytics": "full",
    "certifications": "full",
    "usergroups": "full",
    "roles": "full",
    "api_tokens": "full",
    # Included base features for full+
    "communities": "full",
    "resources": "full",
    "payments": "full",
    "podcasts": "full",
    "collaboration": "full",
    # Enterprise-only
    "boards": "enterprise",
    "playgrounds": "enterprise",
    "custom_domains": "enterprise",
    "seo": "enterprise",
    "versioning": "enterprise",
    "analytics_advanced": "enterprise",
    "audit_logs": "enterprise",
    "scorm": "enterprise",
    "sso": "enterprise",
}

# ============================================================================
# Comprehensive plan feature configs (single source of truth)
# ============================================================================
# Each plan defines: features (enabled + limits), cloud flags.
# limit=0 means unlimited for that feature.
# collections_limit: max number of collections an org can create (0 = unlimited)

PLAN_FEATURE_CONFIGS: dict[str, dict] = {
    "free": {
        "features": {
            "ai": {"enabled": False, "limit": 0, "model": "gemini-2.0-flash"},
            "analytics": {"enabled": False, "limit": 0},
            "api": {"enabled": False, "limit": 0},
            "assignments": {"enabled": True, "limit": 0},
            "collaboration": {"enabled": False, "limit": 0},
            "courses": {"enabled": True, "limit": 5},
            "members": {"admin_limit": 1, "enabled": True, "limit": 30},
            "payments": {"enabled": False},
            "storage": {"enabled": True, "limit": 5},
            "usergroups": {"enabled": False, "limit": 0},
            "podcasts": {"enabled": False, "limit": 0},
            "boards": {"enabled": False, "limit": 0},
            "collections": {"enabled": True, "collections_limit": 1},
            "communities": {"enabled": False},
            "resources": {"enabled": False, "limit": 0},
            "playgrounds": {"enabled": False, "limit": 0},
            "roles": {"enabled": False},
            "certifications": {"enabled": False},
            "scorm": {"enabled": False},
            "sso": {"enabled": False},
            "versioning": {"enabled": False},
            "audit_logs": {"enabled": False},
        },
        "cloud": {"plan": "free", "custom_domain": False},
    },
    "full": {
        "features": {
            # Packages required for these; disabled by default, enabled per-org by package
            "ai": {"enabled": False, "limit": 2000, "model": "gemini-2.0-flash"},
            "analytics": {"enabled": False, "limit": 0},
            "api": {"enabled": False, "limit": 0},
            "assignments": {"enabled": True, "limit": 0},
            "collaboration": {"enabled": True, "limit": 0},
            "courses": {"enabled": True, "limit": 20},
            "members": {"admin_limit": 3, "enabled": True, "limit": 200},
            "payments": {"enabled": True},
            "storage": {"enabled": True, "limit": 20},
            "usergroups": {"enabled": False, "limit": 0},
            "podcasts": {"enabled": True, "limit": 0},
            "boards": {"enabled": False, "limit": 0},
            "collections": {"enabled": True, "collections_limit": 5},
            "communities": {"enabled": True, "limit": 1},
            "resources": {"enabled": True, "limit": 1},
            "playgrounds": {"enabled": False, "limit": 0},
            "roles": {"enabled": False},
            "certifications": {"enabled": False},
            "scorm": {"enabled": False},
            "sso": {"enabled": False},
            "versioning": {"enabled": False},
            "audit_logs": {"enabled": False},
        },
        "cloud": {"plan": "full", "custom_domain": False},
    },
    "enterprise": {
        "features": {
            "ai": {"enabled": True, "limit": 10000, "model": "gemini-2.0-flash"},
            "analytics": {"enabled": True, "limit": 0},
            "api": {"enabled": True, "limit": 0},
            "assignments": {"enabled": True, "limit": 0},
            "collaboration": {"enabled": True, "limit": 0},
            "courses": {"enabled": True, "limit": 0},
            "members": {"admin_limit": 20, "enabled": True, "limit": 0},
            "payments": {"enabled": True},
            "storage": {"enabled": True, "limit": 100},
            "usergroups": {"enabled": True, "limit": 0},
            "podcasts": {"enabled": True, "limit": 0},
            "boards": {"enabled": True, "limit": 0},
            "collections": {"enabled": True, "collections_limit": 0},
            "communities": {"enabled": True, "limit": 0},
            "resources": {"enabled": True, "limit": 0},
            "playgrounds": {"enabled": True, "limit": 0},
            "roles": {"enabled": True},
            "certifications": {"enabled": True},
            "scorm": {"enabled": True},
            "sso": {"enabled": True},
            "versioning": {"enabled": True},
            "audit_logs": {"enabled": True},
        },
        "cloud": {"plan": "enterprise", "custom_domain": True},
    },
    "master": {
        "features": {
            "ai": {"enabled": True, "limit": 0, "model": "gemini-2.0-flash"},
            "analytics": {"enabled": True, "limit": 0},
            "api": {"enabled": True, "limit": 0},
            "assignments": {"enabled": True, "limit": 0},
            "collaboration": {"enabled": True, "limit": 0},
            "courses": {"enabled": True, "limit": 0},
            "members": {"admin_limit": 0, "enabled": True, "limit": 0},
            "payments": {"enabled": True},
            "storage": {"enabled": True, "limit": 0},
            "usergroups": {"enabled": True, "limit": 0},
            "podcasts": {"enabled": True, "limit": 0},
            "boards": {"enabled": True, "limit": 0},
            "collections": {"enabled": True, "collections_limit": 0},
            "communities": {"enabled": True, "limit": 0},
            "resources": {"enabled": True, "limit": 0},
            "playgrounds": {"enabled": True, "limit": 0},
            "roles": {"enabled": True},
            "certifications": {"enabled": True},
            "scorm": {"enabled": True},
            "sso": {"enabled": True},
            "versioning": {"enabled": True},
            "audit_logs": {"enabled": True},
        },
        "cloud": {"plan": "master", "custom_domain": True},
    },
}

# Plan-based resource limits (for plan-based features checked against DB counts)
# 0 = unlimited
PLAN_LIMITS: dict[str, dict[str, int]] = {
    plan: {
        "courses": cfg["features"]["courses"]["limit"],
        "members": cfg["features"]["members"]["limit"],
        "admin_seats": cfg["features"]["members"]["admin_limit"],
        "collections": cfg["features"]["collections"]["collections_limit"],
    }
    for plan, cfg in PLAN_FEATURE_CONFIGS.items()
}

# AI credit allocation per plan
# 0 = no access, -1 = unlimited
AI_CREDIT_LIMITS: dict[str, int] = {
    "free": 0,
    "full": 2000,
    "enterprise": 10000,
    "master": -1,
}


# ============================================================================
# Lookup helpers
# ============================================================================

def get_plan_feature_config(plan: str, feature: str) -> dict:
    """
    Get the full feature config for a plan.

    Returns:
        Dict with at least {enabled, limit} keys. Returns disabled/0 for unknown features.
    """
    cfg = PLAN_FEATURE_CONFIGS.get(plan, PLAN_FEATURE_CONFIGS["free"])
    return cfg["features"].get(feature, {"enabled": False, "limit": 0})


def is_feature_enabled_for_plan(plan: str, feature: str) -> bool:
    """Check if a feature is enabled for a given plan."""
    return get_plan_feature_config(plan, feature).get("enabled", False)


def get_feature_limit_for_plan(plan: str, feature: str) -> int:
    """
    Get the limit for a specific feature from the plan config.

    Returns:
        The limit (0 = unlimited).
    """
    return get_plan_feature_config(plan, feature).get("limit", 0)


def get_plan_config(plan: str) -> dict:
    """Get the full plan config. Returns free config for unknown plans."""
    return PLAN_FEATURE_CONFIGS.get(plan, PLAN_FEATURE_CONFIGS["free"])


def get_ai_credit_limit(plan: str) -> int:
    """
    Get the AI credit limit for a specific plan.

    Returns:
        The AI credit limit (0 = no access, -1 = unlimited)
    """
    return AI_CREDIT_LIMITS.get(plan, 0)


def get_plan_limit(plan: str, feature: str) -> int:
    """
    Get the limit for a plan-based feature (courses, members, admin_seats, collections).

    Returns:
        The limit for the feature (0 means unlimited)
    """
    plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    return plan_limits.get(feature, 0)


def plan_meets_requirement(current_plan: str, required_plan: str) -> bool:
    """
    Check if the current plan meets or exceeds the required plan level.
    """
    try:
        current_index = PLAN_HIERARCHY.index(current_plan)
    except ValueError:
        current_index = 0
    try:
        required_index = PLAN_HIERARCHY.index(required_plan)
    except ValueError:
        required_index = 0
    return current_index >= required_index


def get_required_plan_for_feature(feature_key: str) -> PlanLevel | None:
    """
    Get the required plan level for a specific feature.
    """
    return FEATURE_PLAN_REQUIREMENTS.get(feature_key)

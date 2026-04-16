"""
Central feature resolution logic (v2 config).

5-layer resolution: plan config → overrides → packages → admin toggles.
"""

from src.security.features_utils.plans import FEATURE_PLAN_REQUIREMENTS, get_plan_feature_config


# Features that are always on (no admin toggle — cannot be disabled)
ALWAYS_ON_FEATURES = {"courses", "storage", "usergroups", "assignments"}

# Always-on features that have plan-based limits (not unlimited)
# These are always enabled but their limit comes from the plan config
ALWAYS_ON_WITH_LIMITS = {"courses"}

# All known features
ALL_FEATURES = [
    "ai", "analytics", "api", "assignments", "audit_logs", "boards", "collaboration",
    "collections", "communities", "courses", "certifications",
    "members", "payments", "playgrounds", "podcasts", "resources", "roles", "scorm",
    "sso", "storage", "usergroups", "versioning",
]


def _get_plan_from_config(config: dict) -> str:
    """Extract plan from config, supporting both v1 and v2 formats."""
    version = config.get("config_version", "1.0")
    if version.startswith("2"):
        return config.get("plan", "free")
    # v1: plan is under cloud.plan
    return config.get("cloud", {}).get("plan", "free")


def _get_admin_toggle(config: dict, feature: str) -> dict:
    """Get admin toggle for a feature, supporting both v1 and v2 formats."""
    version = config.get("config_version", "1.0")
    if version.startswith("2"):
        return config.get("admin_toggles", {}).get(feature, {})
    # v1: read from features section; map enabled=False → disabled=True
    v1_feature = config.get("features", {}).get(feature, {})
    toggle = {}
    if "enabled" in v1_feature:
        toggle["disabled"] = not v1_feature["enabled"]
    if "copilot_enabled" in v1_feature:
        toggle["copilot_enabled"] = v1_feature["copilot_enabled"]
    if "signup_mode" in v1_feature:
        toggle["signup_mode"] = v1_feature["signup_mode"]
    return toggle


def _get_overrides(config: dict, feature: str) -> dict:
    """Get overrides for a feature from v2 config."""
    version = config.get("config_version", "1.0")
    if not version.startswith("2"):
        return {}
    return config.get("overrides", {}).get(feature, {})


def _get_packages(config: dict) -> list[str]:
    """Get the list of active package IDs from the org config."""
    version = config.get("config_version", "1.0")
    if version.startswith("2"):
        return config.get("packages", [])
    return []


def _is_feature_enabled_by_package(feature: str, config: dict, plan: str) -> bool:
    """
    Check if a feature is enabled via a package add-on.
    Packages are only active if the org's plan meets the package's min_plan.
    """
    from src.security.features_utils.packs import AVAILABLE_PACKAGES, get_features_enabled_by_packages
    from src.security.features_utils.plans import plan_meets_requirement

    packages = _get_packages(config)
    if not packages:
        return False

    # Only apply packages if org meets minimum plan requirement for each package
    active_packages = [
        pkg_id for pkg_id in packages
        if pkg_id in AVAILABLE_PACKAGES
        and plan_meets_requirement(plan, AVAILABLE_PACKAGES[pkg_id]["min_plan"])
    ]

    package_enabled_features = get_features_enabled_by_packages(active_packages)
    return feature in package_enabled_features


def resolve_feature(feature: str, config: dict, org_id: int = 0) -> dict:
    """
    Resolve a single feature's enabled/limit state through all 5 layers.

    Returns:
        {"enabled": bool, "limit": int, "required_plan": str|None}  (limit=0 means unlimited)
    """
    required_plan = FEATURE_PLAN_REQUIREMENTS.get(feature)

    # Always-on features without limits: enabled in all modes, unlimited, no admin toggle
    if feature in ALWAYS_ON_FEATURES and feature not in ALWAYS_ON_WITH_LIMITS:
        return {"enabled": True, "limit": 0, "required_plan": required_plan}

    # Always-on features WITH plan limits: enabled in all orgs, but limit comes from plan
    if feature in ALWAYS_ON_WITH_LIMITS:
        plan = _get_plan_from_config(config)
        plan_config = get_plan_feature_config(plan, feature)
        plan_limit = plan_config.get("limit", 0)
        overrides = _get_overrides(config, feature)
        extra_limit = overrides.get("extra_limit", 0)
        if plan_limit == 0:
            effective_limit = 0
        else:
            effective_limit = plan_limit + extra_limit
        return {"enabled": True, "limit": effective_limit, "required_plan": required_plan}

    admin_toggle = _get_admin_toggle(config, feature)
    admin_disabled = admin_toggle.get("disabled", False)
    plan = _get_plan_from_config(config)

    plan_config = get_plan_feature_config(plan, feature)
    plan_enabled = plan_config.get("enabled", False)
    plan_limit = plan_config.get("limit", 0)

    overrides = _get_overrides(config, feature)
    force_enabled = overrides.get("force_enabled", False)
    extra_limit = overrides.get("extra_limit", 0)

    # Package layer: packages can enable features not included in the base plan
    package_enabled = _is_feature_enabled_by_package(feature, config, plan)

    base_enabled = plan_enabled or force_enabled or package_enabled

    if plan_limit == 0:
        effective_limit = 0
    else:
        effective_limit = plan_limit + extra_limit

    effective_enabled = base_enabled and not admin_disabled

    return {"enabled": effective_enabled, "limit": effective_limit, "required_plan": required_plan}


def resolve_all_features(config: dict, org_id: int = 0) -> dict:
    """Resolve all features for an organization config."""
    return {
        feature: resolve_feature(feature, config, org_id)
        for feature in ALL_FEATURES
    }

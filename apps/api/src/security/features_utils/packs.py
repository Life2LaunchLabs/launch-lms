"""
Package add-on system for Launch LMS.

Packages are boolean feature bundles available to full+ orgs.
They are stored as a list of package IDs in the org config under the 'packages' key.

Available packages:
  - analytics:                 Enables analytics dashboard and reporting
  - credentials:               Enables OpenBadge certifications
  - ai:                        Enables AI features (copilot, magic blocks, course planning)
  - advanced_user_management:  Enables user groups, custom roles, and API tokens
"""

# Features each package enables when added to an org
PACKAGE_FEATURE_MAP: dict[str, list[str]] = {
    "analytics": ["analytics"],
    "credentials": ["certifications"],
    "ai": ["ai"],
    "advanced_user_management": ["usergroups", "roles", "api_tokens"],
}

# Package metadata (label, description, min plan required to purchase)
AVAILABLE_PACKAGES: dict[str, dict] = {
    "analytics": {
        "label": "Analytics",
        "description": "Detailed course analytics, learner progress reports, and engagement dashboards.",
        "features": PACKAGE_FEATURE_MAP["analytics"],
        "min_plan": "full",
    },
    "credentials": {
        "label": "Credentials",
        "description": "Issue OpenBadge-compliant digital certificates to course completers.",
        "features": PACKAGE_FEATURE_MAP["credentials"],
        "min_plan": "full",
    },
    "ai": {
        "label": "AI Features",
        "description": "AI copilot, magic content blocks, and automated course planning.",
        "features": PACKAGE_FEATURE_MAP["ai"],
        "min_plan": "full",
    },
    "advanced_user_management": {
        "label": "Advanced User Management",
        "description": "Custom roles, user groups, bulk access control, and API token management.",
        "features": PACKAGE_FEATURE_MAP["advanced_user_management"],
        "min_plan": "full",
    },
}


def get_features_enabled_by_packages(packages: list[str]) -> set[str]:
    """Return the set of features enabled by the given list of package IDs."""
    enabled: set[str] = set()
    for pkg_id in packages:
        enabled.update(PACKAGE_FEATURE_MAP.get(pkg_id, []))
    return enabled


def is_valid_package(package_id: str) -> bool:
    """Check if a package ID is valid."""
    return package_id in AVAILABLE_PACKAGES


# ---------------------------------------------------------------------------
# Legacy quantity-based packs (Stripe billing, Redis credits/seats)
# Kept for backward compatibility with the existing packs billing system.
# ---------------------------------------------------------------------------
AVAILABLE_PACKS: dict[str, dict] = {
    "ai_500":    {"type": "ai_credits",   "quantity": 500,  "label": "500 AI Credits"},
    "seats_200": {"type": "member_seats", "quantity": 200,  "label": "200 Member Seats"},
}

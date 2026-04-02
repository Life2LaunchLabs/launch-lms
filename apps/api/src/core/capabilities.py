"""
Core product capability definitions.

LearnHouse no longer ships separate OSS/EE product editions. Instead, the core
application exposes a fixed set of capabilities for self-hosted installs and a
separate SaaS mode for hosted plan enforcement.
"""

from typing import Literal

DeploymentMode = Literal["core", "saas"]

CORE_CAPABILITIES: dict[str, bool] = {
    "multi_org": True,
    "superadmin": True,
    "audit_logs": True,
    "payments": False,
    "sso": False,
    "scorm": False,
    "advanced_analytics": False,
}

DISABLED_CORE_FEATURES: frozenset[str] = frozenset(
    feature for feature, enabled in CORE_CAPABILITIES.items() if not enabled
)


"""Instance-wide capability definitions."""

import os


def _enabled(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}

CORE_CAPABILITIES: dict[str, bool] = {
    "multi_org": True,
    "superadmin": True,
    "audit_logs": True,
    "payments": False,
    "sso": True,
    "scorm": True,
    "advanced_analytics": True,
    "news": _enabled("NEXT_PUBLIC_LAUNCHLMS_ENABLE_LEGACY_NEWS"),
}

"""Instance-wide capability definitions."""

CORE_CAPABILITIES: dict[str, bool] = {
    "multi_org": True,
    "superadmin": True,
    "audit_logs": True,
    "payments": False,
    "sso": True,
    "scorm": True,
    "advanced_analytics": True,
}

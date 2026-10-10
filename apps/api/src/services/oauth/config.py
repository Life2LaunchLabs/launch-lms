"""Identity of the Launch LMS authorization server and the MCP resource it protects."""

from __future__ import annotations

import hashlib
import os
import secrets

from config.config import get_launchlms_config

SCOPES = {
    "activities:read": "See your organization's badges and activities, and preview them",
    "activities:write": "Edit activities in draft badge versions",
    "plans:read": "See your organization's plan templates and requirement frameworks",
    "plans:write": "Create and edit plan templates and requirement frameworks",
}
DEFAULT_SCOPE = " ".join(SCOPES)
CODE_TTL_SECONDS = 600
ACCESS_TTL_SECONDS = 3600
REFRESH_TTL_SECONDS = 30 * 24 * 3600
ACCESS_PREFIX = "lmca_"
REFRESH_PREFIX = "lmcr_"
CODE_PREFIX = "lmcc_"
CLIENT_PREFIX = "lmc_"
MCP_PATH = "/api/v1/mcp"


class OAuthError(Exception):
    """An RFC 6749 error response."""

    def __init__(self, error: str, description: str, status_code: int = 400):
        super().__init__(description)
        self.error, self.description, self.status_code = error, description, status_code

    def body(self) -> dict:
        return {"error": self.error, "error_description": self.description}


def connector_enabled() -> bool:
    return os.environ.get("LAUNCHLMS_MCP_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}


def _scheme() -> str:
    return "https" if get_launchlms_config().hosting_config.ssl else "http"


def issuer() -> str:
    return f"{_scheme()}://{get_launchlms_config().hosting_config.domain}".rstrip("/")


def frontend_url() -> str:
    return f"{_scheme()}://{get_launchlms_config().hosting_config.frontend_domain}".rstrip("/")


def mcp_resource() -> str:
    return f"{issuer()}{MCP_PATH}"


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_secret(prefix: str) -> str:
    return f"{prefix}{secrets.token_urlsafe(32)}"


def normalize_scope(requested: str | None) -> str:
    scopes = [scope for scope in (requested or "").split() if scope]
    if not scopes:
        return DEFAULT_SCOPE
    unknown = [scope for scope in scopes if scope not in SCOPES]
    if unknown:
        raise OAuthError("invalid_scope", f"Unsupported scope: {' '.join(unknown)}")
    return " ".join(scope for scope in SCOPES if scope in scopes)


def check_resource(resource: str | None) -> str:
    expected = mcp_resource()
    if not resource:
        return expected
    if resource.rstrip("/") != expected:
        raise OAuthError("invalid_target", "This authorization server only issues tokens for the Launch LMS MCP server")
    return expected


def authorization_server_metadata() -> dict:
    base = issuer()
    return {
        "issuer": base,
        "authorization_endpoint": f"{frontend_url()}/auth/oauth/authorize",
        "token_endpoint": f"{base}/api/v1/oauth/token",
        "registration_endpoint": f"{base}/api/v1/oauth/register",
        "revocation_endpoint": f"{base}/api/v1/oauth/revoke",
        "response_types_supported": ["code"],
        "response_modes_supported": ["query"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "revocation_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "scopes_supported": list(SCOPES),
        "authorization_response_iss_parameter_supported": True,
        "service_documentation": f"{frontend_url()}/",
    }


def protected_resource_metadata() -> dict:
    return {
        "resource": mcp_resource(),
        "authorization_servers": [issuer()],
        "scopes_supported": list(SCOPES),
        "bearer_methods_supported": ["header"],
        "resource_name": "Launch LMS",
    }


def www_authenticate(error: str | None = None, description: str | None = None) -> str:
    value = f'Bearer resource_metadata="{issuer()}/.well-known/oauth-protected-resource{MCP_PATH}"'
    if error:
        value += f', error="{error}"'
    if description:
        value += f', error_description="{description}"'
    return value

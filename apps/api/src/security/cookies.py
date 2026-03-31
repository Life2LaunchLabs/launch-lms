from fastapi import Request

from config.config import get_learnhouse_config
from src.core.deployment_mode import get_deployment_mode
from src.services.dev.dev import isDevModeEnabled


def get_cookie_domain_for_request(request: Request) -> str | None:
    """
    Determine the appropriate cookie domain based on the request origin.

    - For custom domains: Returns None (cookie is host-specific)
    - For configured domain/subdomains: Returns the configured cookie domain
    - For localhost: Returns None
    """
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")
    host = request.headers.get("host", "")

    config_domain = get_learnhouse_config().hosting_config.domain
    config_cookie_domain = get_learnhouse_config().hosting_config.cookie_config.domain

    check_value = origin or referer or host
    if not check_value:
        return config_cookie_domain

    check_value = check_value.replace("https://", "").replace("http://", "")
    check_value = check_value.split("/")[0].split(":")[0]

    if "localhost" in check_value or "127.0.0.1" in check_value:
        return None

    is_subdomain = check_value.endswith(f".{config_domain}") or check_value == config_domain
    return config_cookie_domain if is_subdomain else None


def is_request_secure(request: Request | None) -> bool:
    """
    Determine if the request is over HTTPS.
    Only trusts X-Forwarded-Proto when the direct connection is from a local proxy.
    """
    if not request:
        return not isDevModeEnabled() and get_deployment_mode() != "oss"

    direct_ip = request.client.host if request.client else None
    trust_proxy = False
    if direct_ip:
        import ipaddress
        try:
            addr = ipaddress.ip_address(direct_ip)
            trust_proxy = addr.is_loopback or addr.is_private
        except ValueError:
            pass

    if trust_proxy:
        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        if forwarded_proto.lower() == "https":
            return True
        if forwarded_proto.lower() == "http":
            return False

    if request.url.scheme == "https":
        return True

    return not isDevModeEnabled()

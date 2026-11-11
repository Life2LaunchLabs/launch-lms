"""The switch and the reserved address space for test personas."""

import os

from config.config import get_launchlms_config
from fastapi import HTTPException

# A domain we own with no mail server (no MX), so even a leaked message reaches nobody.
DEFAULT_EMAIL_DOMAIN = "test.life2launch.app"


def enabled() -> bool:
    return bool(get_launchlms_config().general_config.user_tests_enabled)


def require_enabled() -> None:
    if not enabled():
        raise HTTPException(404, "User tests are not turned on for this site.")


def email_domain() -> str:
    domain = os.environ.get("LAUNCHLMS_USER_TESTS_EMAIL_DOMAIN", "").strip().lower()
    return domain or DEFAULT_EMAIL_DOMAIN


def is_test_address(address: str | None) -> bool:
    """True for any address on the reserved test domain or one of its subdomains."""
    if not address or "@" not in address:
        return False
    host = address.rsplit("@", 1)[1].strip().lower().rstrip(".")
    domain = email_domain()
    return host == domain or host.endswith("." + domain)

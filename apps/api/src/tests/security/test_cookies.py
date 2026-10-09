"""Cookie isolation contracts for hosted environment boundaries."""

from types import SimpleNamespace
from unittest.mock import patch

from src.security.cookies import get_cookie_domain_for_request


def _config(scope: str):
    cookie = SimpleNamespace(domain=".example.test", scope=scope)
    hosting = SimpleNamespace(domain="example.test", cookie_config=cookie)
    return SimpleNamespace(hosting_config=hosting)


def _request(host: str):
    return SimpleNamespace(headers={"host": host})


def test_host_only_scope_never_emits_parent_domain():
    with patch("src.security.cookies.get_launchlms_config", return_value=_config("host-only")):
        assert get_cookie_domain_for_request(_request("tenant.preview.example.test")) is None


def test_shared_domain_scope_preserves_self_hosted_behavior():
    with patch("src.security.cookies.get_launchlms_config", return_value=_config("shared-domain")):
        assert get_cookie_domain_for_request(_request("tenant.example.test")) == ".example.test"

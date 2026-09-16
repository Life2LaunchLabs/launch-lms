"""Negative-path contracts for host-only organization session transfers."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException, Response

from src.routers.auth_handoff import HandoffRequest, RedemptionRequest, issue_handoff, redeem_handoff
from src.security.auth import JWT_REFRESH_COOKIE_NAME, create_refresh_token, decode_jwt
from src.services.auth import handoff


class OneUseRedis:
    def __init__(self):
        self.values = {}

    def set(self, key, value, ex, nx):
        assert ex == handoff.TICKET_TTL_SECONDS and nx
        if key in self.values:
            return False
        self.values[key] = value
        return True

    def getdel(self, key):
        return self.values.pop(key, None)


@pytest.fixture
def handoff_store():
    store = OneUseRedis()
    config = SimpleNamespace(
        hosting_config=SimpleNamespace(
            frontend_domain="unstable.life2launch.app",
            cookie_config=SimpleNamespace(scope="host-only"),
        ),
    )
    with patch.object(handoff, "_redis", return_value=store), patch.object(
        handoff, "get_launchlms_config", return_value=config
    ):
        yield store


def test_ticket_redeems_once_only_on_exact_host_and_state(handoff_store):
    state = "s" * 43
    ticket = handoff.issue_ticket("learner@example.test", "school.unstable.life2launch.app", state, "/portfolio")
    assert handoff.redeem_ticket(ticket, "school.unstable.life2launch.app", state, "/portfolio") == "learner@example.test"
    assert handoff.redeem_ticket(ticket, "school.unstable.life2launch.app", state, "/portfolio") is None


@pytest.mark.parametrize("host", [
    "school.life2launch.app", "ops.life2launch.dev", "evilunsteady.life2launch.app",
    "nested.school.unstable.life2launch.app", "school.unstable.life2launch.app.evil.test",
    "school.unstable.life2launch.app:9999", "school.unstable.life2launch.app:bad",
    "school.unstable.life2launch.app@evil.test",
])
def test_rejects_out_of_installation_and_nested_hosts(handoff_store, host):
    with pytest.raises(ValueError):
        handoff.issue_ticket("learner@example.test", host, "s" * 43, "/")


def test_wrong_state_or_return_path_consumes_ticket(handoff_store):
    ticket = handoff.issue_ticket("learner@example.test", "school.unstable.life2launch.app", "s" * 43, "/home")
    assert handoff.redeem_ticket(ticket, "school.unstable.life2launch.app", "t" * 43, "/home") is None
    assert handoff.redeem_ticket(ticket, "school.unstable.life2launch.app", "s" * 43, "/home") is None
    another = handoff.issue_ticket("learner@example.test", "school.unstable.life2launch.app", "s" * 43, "/home")
    assert handoff.redeem_ticket(another, "school.unstable.life2launch.app", "s" * 43, "/other") is None


@pytest.mark.parametrize("path", ["//evil.test", "/\\evil.test", "https://evil.test", "/good\nSet-Cookie: bad"])
def test_rejects_unsafe_return_path(handoff_store, path):
    with pytest.raises(ValueError):
        handoff.issue_ticket("learner@example.test", "school.unstable.life2launch.app", "s" * 43, path)


def test_shared_domain_mode_does_not_issue_handoff_tickets(handoff_store):
    config = SimpleNamespace(hosting_config=SimpleNamespace(
        frontend_domain="unstable.life2launch.app",
        cookie_config=SimpleNamespace(scope="shared-domain"),
    ))
    with patch.object(handoff, "get_launchlms_config", return_value=config):
        with pytest.raises(ValueError, match="not enabled"):
            handoff.issue_ticket("learner@example.test", "school.unstable.life2launch.app", "s" * 43, "/")


def test_issue_and_redeem_handlers_require_refresh_cookie_and_return_fresh_tokens(handoff_store):
    db = SimpleNamespace(exec=lambda _query: SimpleNamespace(first=lambda: object()))
    body = HandoffRequest(target_host="school.unstable.life2launch.app", state="s" * 43, return_path="/portfolio")
    refresh = create_refresh_token({"sub": "learner@example.test"})
    with pytest.raises(HTTPException) as unauthenticated:
        issue_handoff(SimpleNamespace(cookies={}), body, Response(), db)
    assert unauthenticated.value.status_code == 401

    issued = issue_handoff(SimpleNamespace(cookies={JWT_REFRESH_COOKIE_NAME: refresh}), body, Response(), db)
    redeemed = redeem_handoff(RedemptionRequest(**body.model_dump(), ticket=issued["ticket"]), Response(), db)
    assert decode_jwt(redeemed["access_token"])["sub"] == "learner@example.test"
    with pytest.raises(HTTPException) as replay:
        redeem_handoff(RedemptionRequest(**body.model_dump(), ticket=issued["ticket"]), Response(), db)
    assert replay.value.status_code == 401

"""A Canvas session's cookies are SameSite=None, so every changing request from one must pass the Origin check (DEV-172).

Lax cookies used to keep other sites' forms from using a session for free; partitioned Canvas cookies don't.
These tests walk every state-changing API route and show a Canvas session's request from another site is
refused, except Canvas's own login and launch posts, which sign no one in from cookies.
"""

import re
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from src.security.csrf import CANVAS_LAUNCH_PATHS, STATE_CHANGING_METHODS, CanvasSessionCSRFMiddleware

FOREIGN = "https://ridge.instructure.com"
OURS = "https://ridge.life2launch.app"


def _config():
    config = MagicMock()
    config.hosting_config.allowed_origins = []
    config.hosting_config.allowed_regexp = r"^https://([a-z0-9-]+\.)?life2launch\.app$"
    config.general_config.development_mode = False
    return config


@pytest.fixture
def middleware():
    with patch("src.security.csrf.get_launchlms_config", return_value=_config()):
        yield CanvasSessionCSRFMiddleware(MagicMock())


def _request(method: str, path: str, cookie: str = "launchlms_canvas=1; access_token_cookie=x", origin: str | None = FOREIGN):
    headers = [(b"cookie", cookie.encode())]
    if origin:
        headers.append((b"origin", origin.encode()))
    return Request({"type": "http", "method": method, "path": path, "headers": headers, "query_string": b""})


def _state_changing_routes():
    from src.router import v1_router

    for route in v1_router.routes:
        for method in sorted(getattr(route, "methods", None) or []):
            if method in STATE_CHANGING_METHODS:
                yield method, "/api/v1" + re.sub(r"\{[^}]+\}", "1", route.path)


ROUTES = list(_state_changing_routes())


def test_there_are_routes_to_cover():
    assert len(ROUTES) > 100


@pytest.mark.parametrize("method,path", ROUTES)
def test_every_changing_request_from_a_canvas_session_on_another_site_is_refused(middleware, method, path):
    expected = path not in CANVAS_LAUNCH_PATHS
    assert middleware.rejects(_request(method, path)) is expected
    assert middleware.rejects(_request(method, path, origin="null")) is expected
    # Our own pages pass, and ordinary Lax sessions keep today's behaviour.
    assert middleware.rejects(_request(method, path, origin=OURS)) is False
    assert middleware.rejects(_request(method, path, cookie="access_token_cookie=x")) is False


def test_reads_and_server_side_calls_pass(middleware):
    assert middleware.rejects(_request("GET", "/api/v1/users/session")) is False
    assert middleware.rejects(_request("POST", "/api/v1/goals/x", origin=None)) is False


def test_the_middleware_answers_403_before_the_route_runs():
    reached = []
    app = FastAPI()

    @app.post("/api/v1/thing")
    def thing():
        reached.append(True)
        return {"ok": True}

    with patch("src.security.csrf.get_launchlms_config", return_value=_config()):
        app.add_middleware(CanvasSessionCSRFMiddleware)
        client = TestClient(app)
        refused = client.post("/api/v1/thing", headers={"origin": FOREIGN, "cookie": "launchlms_canvas=1"})
        allowed = client.post("/api/v1/thing", headers={"origin": OURS, "cookie": "launchlms_canvas=1"})
    assert refused.status_code == 403 and allowed.status_code == 200 and reached == [True]


def test_the_api_installs_it():
    source = (Path(__file__).resolve().parents[3] / "app.py").read_text()
    assert "app.add_middleware(CanvasSessionCSRFMiddleware)" in source

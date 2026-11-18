"""DEV-27: with production settings the user-test API answers 404 on every route, before sign-in is checked."""

import re

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient


@pytest.mark.parametrize("value", ["", "false", "0"])
def test_every_user_test_route_is_404_when_off(monkeypatch, value):
    monkeypatch.setenv("LAUNCHLMS_USER_TESTS_ENABLED", value)
    from src.router import v1_router

    app = FastAPI()
    app.include_router(v1_router)
    routes = [route for route in app.routes if isinstance(route, APIRoute) and route.path.startswith("/api/v1/user_tests")]
    assert len(routes) > 10
    with TestClient(app) as client:
        for route in routes:
            path = re.sub(r"\{[^}]+\}", "x", route.path)
            for method in route.methods:
                response = client.request(method, path)
                assert response.status_code == 404, f"{method} {route.path} answered {response.status_code}"

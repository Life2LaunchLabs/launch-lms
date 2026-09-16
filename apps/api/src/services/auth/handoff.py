"""One-use, host-bound login handoff for host-only organization cookies."""

from __future__ import annotations

import json
import re
import secrets
from urllib.parse import urlsplit

import redis
from config.config import get_launchlms_config

TICKET_TTL_SECONDS = 60
STATE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
LABEL_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def managed_host(host: str) -> str:
    """Accept only the configured frontend host or one direct organization label."""
    hosting = get_launchlms_config().hosting_config
    if hosting.cookie_config.scope != "host-only":
        raise ValueError("Host-only session handoff is not enabled")
    if not re.fullmatch(r"[A-Za-z0-9.:-]{1,253}", host):
        raise ValueError("Invalid managed host")
    configured = hosting.frontend_domain.lower().rstrip(".")
    parsed = urlsplit(f"//{host.lower()}")
    base = urlsplit(f"//{configured}")
    try:
        valid_port = parsed.port == base.port
    except ValueError as error:
        raise ValueError("Invalid managed host") from error
    if not parsed.hostname or not valid_port or not base.hostname:
        raise ValueError("Host is outside this installation")
    hostname = parsed.hostname.rstrip(".")
    root = base.hostname.rstrip(".")
    if hostname != root:
        if not hostname.endswith(f".{root}") or not LABEL_PATTERN.fullmatch(hostname[: -(len(root) + 1)]):
            raise ValueError("Host is outside this installation")
    return f"{hostname}:{parsed.port}" if parsed.port else hostname


def safe_return_path(path: str) -> str:
    if (not path.startswith("/") or path.startswith("//") or len(path) > 2048 or
            "\\" in path or any(ord(character) < 32 or ord(character) == 127 for character in path)):
        raise ValueError("Invalid return path")
    return path


def valid_state(state: str) -> str:
    if not STATE_PATTERN.fullmatch(state):
        raise ValueError("Invalid handoff state")
    return state


def _redis() -> redis.Redis:
    url = get_launchlms_config().redis_config.redis_connection_string
    if not url:
        raise RuntimeError("Redis is required for session handoff")
    return redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)


def issue_ticket(email: str, target_host: str, state: str, return_path: str) -> str:
    target = managed_host(target_host)
    valid_state(state)
    safe_return_path(return_path)
    ticket = secrets.token_urlsafe(32)
    value = json.dumps({"email": email, "target": target, "state": state, "return": return_path})
    if not _redis().set(f"auth:handoff:{ticket}", value, ex=TICKET_TTL_SECONDS, nx=True):
        raise RuntimeError("Could not issue unique handoff ticket")
    return ticket


def redeem_ticket(ticket: str, target_host: str, state: str, return_path: str) -> str | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{40,64}", ticket):
        return None
    try:
        target = managed_host(target_host)
        valid_state(state)
        safe_return_path(return_path)
    except ValueError:
        return None
    raw = _redis().getdel(f"auth:handoff:{ticket}")
    if not raw:
        return None
    payload = json.loads(raw)
    if (payload.get("target") != target or
            not secrets.compare_digest(payload.get("state", ""), state) or
            payload.get("return") != return_path):
        return None
    return payload.get("email")

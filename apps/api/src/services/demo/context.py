"""Explicit request context for non-database effects and cache boundaries."""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class DemoContext:
    session_id: str
    namespace: str
    visitor_id: str


current_demo: ContextVar[DemoContext | None] = ContextVar("current_demo", default=None)


def cache_key(key: str) -> str:
    context = current_demo.get()
    return f"demo:{context.session_id}:{key}" if context else key


def isolated_uuid(prefix: str) -> str:
    from uuid import uuid4

    context = current_demo.get()
    return (
        f"{prefix}_demo_{context.session_id}_{uuid4().hex}"
        if context
        else f"{prefix}_{uuid4()}"
    )


def isolated_redis(client):
    return NamespacedRedis(client) if current_demo.get() else client


class NamespacedRedis:
    def __init__(self, client):
        self.client = client

    def __getattr__(self, name):
        method = getattr(self.client, name)
        if name in {
            "get",
            "set",
            "setex",
            "incr",
            "incrby",
            "decr",
            "decrby",
            "expire",
            "ttl",
            "exists",
            "hget",
            "hset",
            "hgetall",
        }:
            return lambda key, *args, **kwargs: method(cache_key(key), *args, **kwargs)
        if name == "delete":
            return lambda *keys: method(*(cache_key(key) for key in keys))
        return method

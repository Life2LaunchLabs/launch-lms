"""Notice when the API stops answering, and record why.

The API runs on one process, with one event loop and one thread pool for sync routes. When either
stops moving (a blocking call on the loop, every pool thread stuck), the site's health check still
answers through the web server while every /api/v1 call times out, and nothing explains it. This
watchdog runs on its own thread, outside both. When the loop has not ticked, or the thread pool has
been full, for STALL_SECONDS, it writes down every thread's stack, the database pool and Postgres'
own view of its connections, to the log and to Redis, where a platform admin can read them back
(GET /api/v1/superadmin/diagnostics/stalls) once the API answers again.
"""

import json
import logging
import sys
import threading
import time
import traceback
from collections import deque
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

STALL_SECONDS = 10
REPEAT_SECONDS = 60  # a stall that goes on is written down again, to see it move
MAX_PER_STALL = 5
KEEP = 20
REDIS_KEY = "launchlms:diagnostics:stalls"
MAX_STACK_LINES = 60

_recent: deque[dict] = deque(maxlen=KEEP)
_started = False


def _stacks() -> dict[str, list[str]]:
    names = {thread.ident: thread.name for thread in threading.enumerate()}
    stacks = {}
    for ident, frame in sys._current_frames().items():
        if ident == threading.get_ident():
            continue
        lines = [line.rstrip() for line in traceback.format_stack(frame)]
        stacks[f"{names.get(ident, '?')} ({ident})"] = lines[-MAX_STACK_LINES:]
    return stacks


def _postgres(engine) -> list[dict] | str:
    """Postgres' connections, on a connection of its own: the pool may be the thing that is stuck."""
    if engine is None or engine.dialect.name != "postgresql":
        return "not postgres"
    try:
        from sqlalchemy import create_engine, text
        from sqlalchemy.pool import NullPool

        probe = create_engine(engine.url, poolclass=NullPool, connect_args={"connect_timeout": 5, "options": "-c statement_timeout=5000"})
        try:
            with probe.connect() as connection:
                rows = connection.execute(text(
                    "SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by, "
                    "EXTRACT(EPOCH FROM now() - xact_start)::int AS transaction_seconds, "
                    "EXTRACT(EPOCH FROM now() - query_start)::int AS query_seconds, left(query, 300) AS query "
                    "FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() "
                    "ORDER BY xact_start NULLS LAST LIMIT 60"
                )).mappings().all()
                return [{key: (list(value) if isinstance(value, (list, tuple)) else value) for key, value in row.items()} for row in rows]
        finally:
            probe.dispose()
    except Exception as error:  # the record is still worth keeping without it
        return f"could not read pg_stat_activity: {error}"


def _redis():
    try:
        import redis
        from config.config import get_launchlms_config

        url = get_launchlms_config().redis_config.redis_connection_string
        return redis.Redis.from_url(url, socket_timeout=2, socket_connect_timeout=2) if url else None
    except Exception:
        return None


def _keep(record: dict) -> None:
    _recent.appendleft(record)
    logger.error("API stall: %s", json.dumps(record, default=str)[:20000])
    client = _redis()
    if client is not None:
        try:
            client.lpush(REDIS_KEY, json.dumps(record, default=str))
            client.ltrim(REDIS_KEY, 0, KEEP - 1)
        except Exception:
            logger.warning("Could not save the API stall record to Redis")


def recent() -> list[dict]:
    """This process's records, then the ones kept in Redis (from before a restart too), newest first."""
    records = list(_recent)
    seen = {record.get("id") for record in records}
    client = _redis()
    if client is not None:
        try:
            for raw in client.lrange(REDIS_KEY, 0, KEEP - 1):
                record = json.loads(raw)
                if record.get("id") not in seen:
                    records.append(record)
        except Exception:
            pass
    return sorted(records, key=lambda record: record.get("at", ""), reverse=True)[:KEEP]


class _Watch:
    def __init__(self, loop, limiter, engine):
        self.loop, self.limiter, self.engine = loop, limiter, engine
        self.last_tick = time.monotonic()
        self.full_since: float | None = None
        self.stall_started: float | None = None
        self.written = 0
        self.last_written = 0.0

    def _tick(self) -> None:
        self.last_tick = time.monotonic()

    def _pool_full(self, now: float) -> float:
        try:
            full = self.limiter.borrowed_tokens >= self.limiter.total_tokens
        except Exception:
            full = False
        if not full:
            self.full_since = None
            return 0.0
        self.full_since = self.full_since or now
        return now - self.full_since

    def run(self) -> None:
        while True:
            time.sleep(1)
            try:
                self.loop.call_soon_threadsafe(self._tick)
            except RuntimeError:
                return  # the loop is closed: the app is shutting down
            now = time.monotonic()
            loop_lag, pool_full = now - self.last_tick, self._pool_full(now)
            if loop_lag < STALL_SECONDS and pool_full < STALL_SECONDS:
                if self.stall_started is not None:
                    logger.error("API stall over after %ss", int(now - self.stall_started))
                self.stall_started, self.written = None, 0
                continue
            if self.stall_started is None:
                self.stall_started = now
            if self.written >= MAX_PER_STALL or (self.written and now - self.last_written < REPEAT_SECONDS):
                continue
            self.written, self.last_written = self.written + 1, now
            self._write(now, loop_lag, pool_full)

    def _write(self, now: float, loop_lag: float, pool_full: float) -> None:
        try:
            pool = self.engine.pool.status() if self.engine is not None else None
        except Exception:
            pool = None
        try:
            threads = f"{self.limiter.borrowed_tokens}/{self.limiter.total_tokens}"
        except Exception:
            threads = None
        at = datetime.now(timezone.utc).isoformat()
        _keep({
            "id": f"{at}-{self.written}", "at": at, "stalled_seconds": int(now - (self.stall_started or now)),
            "loop_lag_seconds": round(loop_lag, 1), "thread_pool_full_seconds": round(pool_full, 1),
            "thread_pool": threads, "db_pool": pool, "postgres": _postgres(self.engine), "stacks": _stacks(),
        })


async def start(engine=None) -> None:
    """Start watching from inside the running loop (app startup); safe to call more than once."""
    global _started
    if _started:
        return
    import asyncio

    import anyio.to_thread

    watch = _Watch(asyncio.get_running_loop(), anyio.to_thread.current_default_thread_limiter(), engine)
    threading.Thread(target=watch.run, name="stall-watchdog", daemon=True).start()
    _started = True

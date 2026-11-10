import asyncio
import time

import pytest
from sqlalchemy import create_engine, text

from src.core.events.database import LoopAwarePool, PoolBusy


def _engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path}/pool.db", poolclass=LoopAwarePool, pool_size=1, max_overflow=0, pool_timeout=30)


def test_the_event_loop_gives_up_quickly_when_every_connection_is_taken(tmp_path, monkeypatch):
    monkeypatch.setattr(LoopAwarePool, "LOOP_WAIT_SECONDS", 0.3)
    engine = _engine(tmp_path)
    held = engine.connect()  # the only connection, held by "another request"

    async def query_on_the_loop():
        with engine.connect() as connection:
            connection.execute(text("select 1"))

    started = time.monotonic()
    with pytest.raises(PoolBusy):
        asyncio.run(query_on_the_loop())
    assert time.monotonic() - started < 5  # not the 30 s pool timeout
    held.close()
    asyncio.run(query_on_the_loop())  # a free connection is taken straight away


def test_worker_threads_still_wait_for_a_connection(tmp_path):
    engine = _engine(tmp_path)
    with engine.connect() as connection:
        assert connection.execute(text("select 1")).scalar() == 1

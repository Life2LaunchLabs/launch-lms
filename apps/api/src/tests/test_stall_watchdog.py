import threading
import time

from src.core import stall_watchdog


class FrozenLoop:
    """A loop that never runs what it is handed, like one stuck in a blocking call."""

    def call_soon_threadsafe(self, callback):
        pass


class Limiter:
    borrowed_tokens, total_tokens = 3, 40


def test_a_frozen_loop_is_written_down_with_every_threads_stack(monkeypatch):
    monkeypatch.setattr(stall_watchdog, "STALL_SECONDS", 1.5)
    monkeypatch.setattr(stall_watchdog, "_redis", lambda: None)
    stall_watchdog._recent.clear()
    watch = stall_watchdog._Watch(FrozenLoop(), Limiter(), None)
    threading.Thread(target=watch.run, daemon=True).start()
    deadline = time.monotonic() + 8
    while not stall_watchdog._recent and time.monotonic() < deadline:
        time.sleep(0.2)
    [record] = stall_watchdog.recent()
    assert record["loop_lag_seconds"] >= 1.5 and record["thread_pool"] == "3/40" and record["postgres"] == "not postgres"
    assert any("test_a_frozen_loop" in "".join(lines) for lines in record["stacks"].values())


def test_a_full_thread_pool_counts_as_a_stall():
    class Full:
        borrowed_tokens, total_tokens = 40, 40

    watch = stall_watchdog._Watch(FrozenLoop(), Full(), None)
    assert watch._pool_full(100.0) == 0.0 and watch._pool_full(112.0) == 12.0
    watch.limiter = Limiter()
    assert watch._pool_full(113.0) == 0.0 and watch.full_since is None

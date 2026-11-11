"""Every email notification the app sends: the streams people can switch off, and the kinds of happening on each.

A stream is what a person sees in Settings ("Work to review") and what batching works on: events for
one person on one stream wait ``settle`` after the first so a burst goes out as one email, and the
stream never emails the same person more than once per ``window``. A kind is one sort of happening
on a stream, with how to say it and where it links (services/notifications/kinds.py).

To add a notification: add its kind to ``KINDS`` (on an existing stream, or a new one in
``STREAMS``), give it a renderer in kinds.py, and call ``outbox.notify`` where it happens.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class Stream:
    key: str
    label: str
    description: str
    # Who it's for, so Settings can show staff streams only to staff.
    audience: str  # "staff" or "everyone"
    settle: timedelta
    window: timedelta
    default_on: bool = True


STREAMS: dict[str, Stream] = {stream.key: stream for stream in (
    Stream(
        key="review_requests", label="Work to review",
        description="When someone hands in work you review. At most one email an hour, listing everything waiting.",
        audience="staff", settle=timedelta(minutes=2), window=timedelta(hours=1),
    ),
    Stream(
        key="review_results", label="Reviews of your work",
        description="When your work is approved or sent back with changes to make.",
        audience="everyone", settle=timedelta(minutes=2), window=timedelta(minutes=15),
    ),
    Stream(
        key="new_plans", label="New plans",
        description="When an organization gives you a plan to start.",
        audience="everyone", settle=timedelta(minutes=1), window=timedelta(minutes=10),
    ),
)}

# kind -> stream
KINDS: dict[str, str] = {
    "step_submitted": "review_requests",
    "step_approved": "review_results",
    "step_sent_back": "review_results",
    "plan_assigned": "new_plans",
}


def stream_of(kind: str) -> Stream:
    return STREAMS[KINDS[kind]]

"""How much a Coach model may write, and what to do with a reply that hit that limit."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

MAX_ASSISTANT_CHARS = 24_000  # Safety bound, not a budget: holds the largest output budget (4,000 + reasoning headroom).
# Reasoning and thinking tokens count against the provider's output limit, so a reasoning model given only
# the answer budget can spend most of it thinking and stop mid-sentence (FEED-67). They get this on top.
REASONING_HEADROOM_TOKENS = 2_000


def output_budget(answer_tokens: int, reasons: bool) -> int:
    """The provider's output limit: the configured answer budget, plus room to think when the model reasons."""
    return int(answer_tokens) + (REASONING_HEADROOM_TOKENS if reasons else 0)


def bound_advisor_text(text: str, limit: int = MAX_ASSISTANT_CHARS) -> str:
    """Keep persisted replies safe to replay without exposing transport limits."""
    normalized = text.strip()
    if len(normalized) <= limit:
        return normalized
    window = normalized[: limit - 1]
    breaks = [window.rfind(marker) for marker in ("\n\n", ". ", "? ", "! ")]
    boundary = max(breaks)
    if boundary >= limit // 2:
        window = window[:boundary + (0 if normalized[boundary] == "\n" else 1)]
    return window.rstrip() + "…"


def end_at_last_complete_sentence(text: str) -> str:
    """Drop the unfinished tail of a reply the provider cut off at its output limit."""
    normalized = text.strip()
    if not normalized or normalized[-1] in ".?!":
        return normalized
    breaks = [normalized.rfind(marker) + len(marker) - 1 for marker in (". ", "? ", "! ", ".\n", "?\n", "!\n")]
    breaks.append(normalized.rfind("\n"))
    boundary = max(breaks)
    if boundary <= 0:
        return normalized + "…"
    return normalized[: boundary + 1].rstrip()


def finish_reply(text: str, *, cut: bool, provider: str, model: str) -> str:
    """A reply the provider stopped at its output limit ends on its last whole sentence, not mid-word."""
    if not cut:
        return text
    logger.warning("Coach advisor reply hit the output limit provider=%s model=%s", provider, model)
    return end_at_last_complete_sentence(text)

"""Trusted handling for the learner-selected Hub turn intent."""

from typing import Literal


HubTurnIntent = Literal["chat", "search", "work"]
HubAdviceIntent = Literal["chat", "work"]
HubSearchIntent = Literal["search"]

_MESSAGE_KINDS: dict[HubTurnIntent, str] = {
    "chat": "intent_chat",
    "search": "intent_search",
    "work": "intent_work",
}


def message_kind_for_intent(intent: HubTurnIntent) -> str:
    """Encode explicit choices without relabeling legacy default-kind messages."""
    return _MESSAGE_KINDS[intent]


def intent_for_message_kind(kind: str) -> HubTurnIntent | None:
    return next((intent for intent, message_kind in _MESSAGE_KINDS.items() if message_kind == kind), None)


def trusted_turn_intent_context(intent: HubAdviceIntent) -> str:
    if intent != "work":
        return ""
    return (
        "\n\n<hub_turn_intent>\nThe server verified that the learner selected Work for this turn. "
        "Treat their message as a request to begin or continue focused work using only current authorized context. "
        "If no editing run is active and an available focused action fits, call suggest_navigation so the interface "
        "can offer the existing learner-controlled focused-session next step. Do not claim a session started, use "
        "editing tools without an active granted scope, or change learner data; only explicit action resolution can "
        "grant that scope. If no focused workflow is available, explain the supported next step plainly."
        "\n</hub_turn_intent>"
    )

"""The models Coach runs on: a provider for each moment, on the tier, key and abilities the policy sets."""

from __future__ import annotations

from sqlmodel import Session

from src.services.coach.policy import CoachModel, runtime as coach_runtime
from src.services.hub_advisor import (
    MEMORY_EXTRACTOR_INSTRUCTIONS,
    AdvisorProvider,
    AdvisorUnavailable,
    AnthropicMessagesProvider,
    OpenAIResponsesProvider,
    _ui_test_provider,
)

# Each chat tool is offered only while its ability is on.
TOOL_ABILITIES = {"navigation": "open_pages", "questions": "ask_questions", "goal_edit": "plan_goals"}


def provider_for(model: CoachModel, **options) -> "AdvisorProvider":
    cls = AnthropicMessagesProvider if model.provider == "anthropic" else OpenAIResponsesProvider
    return cls(model.api_key, model.model, advanced=model.settings, **options)


def configured_advisor_provider(db_session: Session, edit_scope: str | None = None, query: str = "") -> AdvisorProvider:
    """Coach for a chat turn: the policy's method, matching knowledge and routines, on the trigger's tier."""
    fixture = _ui_test_provider(edit_scope=edit_scope)
    if fixture:
        return fixture
    policy = coach_runtime(db_session)
    if not policy.enabled:
        raise AdvisorUnavailable("Coach is not configured or enabled.")
    return chat_provider(policy, edit_scope, query)


def chat_provider(policy, edit_scope: str | None = None, query: str = "") -> AdvisorProvider:
    """The chat provider a policy (live or draft) gives a turn."""
    triggers = ("learner_message", "planning_session") if edit_scope else ("learner_message",)
    tier = max((policy.tier_for(trigger) for trigger in triggers), key=("fast", "standard", "deep").index)
    try:
        model = policy.model(tier)
    except RuntimeError as error:
        raise AdvisorUnavailable(str(error)) from None
    tools = frozenset(tool for tool, ability in TOOL_ABILITIES.items() if policy.can(ability))
    return provider_for(model, instructions=policy.instructions(*triggers, query=query), edit_scope=edit_scope, tools=tools)


def configured_memory_provider(db_session: Session) -> AdvisorProvider:
    fixture = _ui_test_provider(memory=True)
    if fixture:
        return fixture
    policy = coach_runtime(db_session)
    if not policy.enabled:
        raise AdvisorUnavailable("Coach is not configured or enabled.")
    try:
        model = policy.model("fast")
    except RuntimeError as error:
        raise AdvisorUnavailable(str(error)) from None
    return provider_for(
        CoachModel(model.provider, model.api_key, model.model, {**model.settings, "max_output_tokens": 500}),
        instructions=MEMORY_EXTRACTOR_INSTRUCTIONS, allow_actions=False,
    )

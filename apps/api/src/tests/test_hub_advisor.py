import json

import httpx
import pytest
from fastapi import HTTPException, Request
from sqlmodel import Session, create_engine

from src.db.hub import (
    HubAdvisorConfiguration,
    HubAdvisorConfigurationUpdate,
    HubAdvisorProviderConfiguration,
)
from src.db.users import PublicUser, User
from src.services import hub_advisor
from src.services import hub_configuration
from src.services.hub_advisor import (
    AdvisorMessage,
    AdvisorResult,
    AdvisorProviderLimited,
    AdvisorUnavailable,
    AnthropicMessagesProvider,
    OpenAIResponsesProvider,
    ask_hub_advisor,
    validate_conversation,
)


def message(role: str, content: str) -> AdvisorMessage:
    return AdvisorMessage(role=role, content=content)  # type: ignore[arg-type]


def test_conversation_must_be_bounded_alternating_and_end_with_user():
    validate_conversation([message("user", "Help me choose a next step")])
    with pytest.raises(HTTPException, match="roles must alternate"):
        validate_conversation([message("user", "One"), message("user", "Two")])
    with pytest.raises(HTTPException, match="final message"):
        validate_conversation([message("user", "One"), message("assistant", "Two")])
    with pytest.raises(HTTPException, match="too long"):
        validate_conversation([
            message("user", "a" * 2000), message("assistant", "b" * 2000),
            message("user", "c" * 2000), message("assistant", "d" * 2000),
            message("user", "e"),
        ])


@pytest.mark.asyncio
async def test_openai_provider_is_stateless_tool_free_and_parses_usage():
    captured = {}

    async def handler(request: httpx.Request):
        captured.update(json.loads(request.content))
        assert request.headers["Authorization"] == "Bearer test-key"
        return httpx.Response(200, json={
            "model": "gpt-test", "usage": {"input_tokens": 12, "output_tokens": 8},
            "output": [{"type": "message", "content": [{"type": "output_text", "text": "Try one small step."}]}],
        })

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await OpenAIResponsesProvider("test-key", "gpt-test", client).respond(
            [message("user", "What next?")], "safe-user"
        )

    assert result == AdvisorResult("Try one small step.", "gpt-test", 12, 8)
    assert captured["store"] is False
    assert captured["tools"] == []
    assert captured["tool_choice"] == "none"
    assert captured["max_output_tokens"] == hub_advisor.MAX_OUTPUT_TOKENS
    assert "previous_response_id" not in captured
    assert "conversation" not in captured


@pytest.mark.asyncio
async def test_openai_provider_applies_supported_advanced_settings():
    captured = {}

    async def handler(request: httpx.Request):
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={
            "model": "gpt-test", "output": [
                {"type": "message", "content": [{"type": "output_text", "text": "Done."}]}
            ],
        })

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await OpenAIResponsesProvider(
            "test-key", "gpt-test", client,
            advanced={"max_output_tokens": 800, "reasoning_effort": "low", "verbosity": "low"},
        ).respond([message("user", "What next?")], "safe-user")

    assert captured["max_output_tokens"] == 800
    assert captured["reasoning"] == {"effort": "low"}
    assert captured["text"] == {"verbosity": "low"}


@pytest.mark.asyncio
async def test_openai_quota_error_is_not_reported_as_request_frequency():
    async def handler(_request: httpx.Request):
        return httpx.Response(429, json={"error": {"type": "insufficient_quota"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(AdvisorUnavailable, match="billing and project credits"):
            await OpenAIResponsesProvider("test-key", "gpt-test", client).respond(
                [message("user", "What next?")], "safe-user"
            )


@pytest.mark.asyncio
async def test_openai_true_rate_limit_preserves_provider_retry_after():
    async def handler(_request: httpx.Request):
        return httpx.Response(
            429,
            headers={"retry-after": "17"},
            json={"error": {"type": "rate_limit_exceeded"}},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(AdvisorProviderLimited, match="OpenAI is temporarily") as caught:
            await OpenAIResponsesProvider("test-key", "gpt-test", client).respond(
                [message("user", "What next?")], "safe-user"
            )

    assert caught.value.retry_after == 17


@pytest.mark.asyncio
async def test_anthropic_provider_is_stateless_and_applies_thinking_settings():
    captured = {}

    async def handler(request: httpx.Request):
        captured.update(json.loads(request.content))
        assert request.headers["x-api-key"] == "test-key"
        assert request.headers["anthropic-version"] == "2023-06-01"
        return httpx.Response(200, json={
            "model": "claude-test", "usage": {"input_tokens": 9, "output_tokens": 6},
            "content": [{"type": "text", "text": "Try one focused experiment."}],
        })

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await AnthropicMessagesProvider(
            "test-key", "claude-test", client, advanced={"max_output_tokens": 900, "thinking_effort": "low"}
        ).respond([message("user", "What next?")], "safe-user")

    assert result == AdvisorResult("Try one focused experiment.", "claude-test", 9, 6)
    assert captured["max_tokens"] == 900
    assert captured["thinking"] == {"type": "adaptive"}
    assert captured["output_config"] == {"effort": "low"}


def _admin() -> PublicUser:
    return PublicUser(
        id=7,
        user_uuid="user_7",
        username="admin",
        email="admin@example.com",
        first_name="Platform",
        last_name="Admin",
        is_superadmin=True,
    )


def _configuration_session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    User.__table__.create(engine)
    HubAdvisorConfiguration.__table__.create(engine)
    HubAdvisorProviderConfiguration.__table__.create(engine)
    return Session(engine)


def test_superadmin_configuration_encrypts_key_and_never_returns_it():
    with _configuration_session() as db:
        result = hub_configuration.update_hub_advisor_configuration(
            db,
            _admin(),
            HubAdvisorConfigurationUpdate(
                provider="openai",
                enabled=True,
                model="gpt-test",
                instructions="Give concise guidance.",
                api_key="sk-test-secret-that-must-not-leak",
            ),
        )
        stored = hub_configuration.get_provider_record(db, "openai")
        assert stored is not None and stored.api_key_ciphertext is not None
        assert stored.api_key_ciphertext != "sk-test-secret-that-must-not-leak"
        assert "sk-test-secret" not in stored.api_key_ciphertext
        assert "api_key" not in result
        assert result["provider_configurations"]["openai"]["api_key_configured"] is True
        assert hub_configuration.get_enabled_hub_advisor_credentials(db) == (
            "openai",
            "sk-test-secret-that-must-not-leak",
            "gpt-test",
            "Give concise guidance.",
            {
                "max_output_tokens": 700,
                "reasoning_effort": "default",
                "verbosity": "default",
                "thinking_effort": "default",
            },
        )


def test_enabled_configuration_requires_key_and_key_can_be_cleared():
    with _configuration_session() as db:
        with pytest.raises(HTTPException, match="Add an Anthropic API key"):
            hub_configuration.update_hub_advisor_configuration(
                db,
                _admin(),
                HubAdvisorConfigurationUpdate(
                    provider="anthropic",
                    enabled=True,
                    model="claude-test",
                    instructions="Help learners.",
                ),
            )
        hub_configuration.update_hub_advisor_configuration(
            db,
            _admin(),
            HubAdvisorConfigurationUpdate(
                provider="openai",
                enabled=False,
                model="gpt-test",
                instructions="Help learners.",
                api_key="sk-test-secret-that-must-not-leak",
            ),
        )
        result = hub_configuration.update_hub_advisor_configuration(
            db,
            _admin(),
            HubAdvisorConfigurationUpdate(
                provider="openai",
                enabled=False,
                model="gpt-test",
                instructions="Help learners.",
                clear_api_key=True,
            ),
        )
        assert result["provider_configurations"]["openai"]["api_key_configured"] is False
        with pytest.raises(RuntimeError, match="not configured or enabled"):
            hub_configuration.get_enabled_hub_advisor_credentials(db)


def test_provider_credentials_and_settings_are_retained_independently():
    with _configuration_session() as db:
        hub_configuration.update_hub_advisor_configuration(
            db,
            _admin(),
            HubAdvisorConfigurationUpdate(
                provider="openai",
                enabled=False,
                model="gpt-test",
                instructions="Shared instructions.",
                api_key="sk-openai-secret-that-must-not-leak",
                advanced={"max_output_tokens": 500, "reasoning_effort": "low"},
            ),
        )
        result = hub_configuration.update_hub_advisor_configuration(
            db,
            _admin(),
            HubAdvisorConfigurationUpdate(
                provider="anthropic",
                enabled=True,
                model="claude-test",
                instructions="Shared instructions.",
                api_key="sk-anthropic-secret-that-must-not-leak",
                advanced={"max_output_tokens": 900, "thinking_effort": "high"},
            ),
        )

        assert result["provider"] == "anthropic"
        assert result["provider_configurations"]["openai"]["api_key_configured"] is True
        assert result["provider_configurations"]["openai"]["advanced"]["max_output_tokens"] == 500
        assert result["provider_configurations"]["anthropic"]["api_key_configured"] is True
        assert hub_configuration.get_enabled_hub_advisor_credentials(db) == (
            "anthropic",
            "sk-anthropic-secret-that-must-not-leak",
            "claude-test",
            "Shared instructions.",
            {
                "max_output_tokens": 900,
                "reasoning_effort": "default",
                "verbosity": "default",
                "thinking_effort": "high",
            },
        )


@pytest.mark.asyncio
async def test_model_catalog_uses_curated_choices_without_a_provider_key():
    with _configuration_session() as db:
        result = await hub_configuration.list_hub_advisor_models(db, "anthropic")

    assert result["source"] == "curated"
    assert any(model["id"] == "claude-haiku-4-5-20251001" for model in result["models"])


class FakeProvider:
    async def respond(self, messages, safety_identifier):
        assert messages[-1].content == "Help"
        assert len(safety_identifier) == 64
        return AdvisorResult("Start here", "fake", 5, 3)


@pytest.mark.asyncio
async def test_advisor_requires_membership_and_applies_user_rate_limit(monkeypatch):
    membership = []
    monkeypatch.setattr(hub_advisor, "require_org_membership", lambda user_id, org_id, _db: membership.append((user_id, org_id)))
    monkeypatch.setattr(hub_advisor, "check_rate_limit", lambda *args: (True, 1, 60))
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})

    result = await ask_hub_advisor(request, 7, 11, [message("user", "Help")], object(), FakeProvider())  # type: ignore[arg-type]

    assert result.text == "Start here"
    assert membership == [(11, 7)]


@pytest.mark.asyncio
async def test_advisor_returns_retry_after_when_rate_limited(monkeypatch):
    monkeypatch.setattr(hub_advisor, "require_org_membership", lambda *_args: None)
    monkeypatch.setattr(hub_advisor, "check_rate_limit", lambda *args: (False, 12, 41))
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})

    with pytest.raises(HTTPException) as caught:
        await ask_hub_advisor(request, 7, 11, [message("user", "Help")], object(), FakeProvider())  # type: ignore[arg-type]

    assert caught.value.status_code == 429
    assert caught.value.headers == {"Retry-After": "41"}

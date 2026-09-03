"""Stateless provider boundary for the learner Hub advisor."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx
from fastapi import HTTPException, Request
from sqlmodel import Session

from src.security.org_auth import require_org_membership
from src.services.hub_configuration import (
    DEFAULT_HUB_ADVISOR_INSTRUCTIONS,
    get_enabled_hub_advisor_credentials,
)
from src.services.security.rate_limiting import check_rate_limit, get_client_ip

logger = logging.getLogger(__name__)

MAX_MESSAGES = 12
MAX_MESSAGE_CHARS = 2_000
MAX_CONVERSATION_CHARS = 8_000
MAX_OUTPUT_TOKENS = 700
ADVISOR_RATE_LIMIT = 12
ADVISOR_RATE_WINDOW_SECONDS = 60
DEFAULT_MODEL = "gpt-5.6-luna"

class AdvisorError(RuntimeError):
    pass


class AdvisorUnavailable(AdvisorError):
    pass


class AdvisorProviderLimited(AdvisorError):
    def __init__(self, message: str, retry_after: int = 30):
        super().__init__(message)
        self.retry_after = retry_after


def _retry_after_seconds(response: httpx.Response) -> int:
    try:
        return max(1, min(int(float(response.headers.get("retry-after", "30"))), 3600))
    except (TypeError, ValueError):
        return 30


def _provider_error_code(response: httpx.Response) -> str:
    try:
        error = response.json().get("error") or {}
    except ValueError:
        return ""
    return str(error.get("code") or error.get("type") or "").lower()


@dataclass(frozen=True)
class AdvisorMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class AdvisorResult:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class AdvisorProvider(Protocol):
    async def respond(self, messages: list[AdvisorMessage], safety_identifier: str) -> AdvisorResult: ...


class OpenAIResponsesProvider:
    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        client: httpx.AsyncClient | None = None,
        instructions: str = DEFAULT_HUB_ADVISOR_INSTRUCTIONS,
        advanced: dict | None = None,
    ):
        if not api_key.strip():
            raise AdvisorUnavailable("Hub Ask is not configured yet.")
        self.api_key = api_key.strip()
        self.model = model.strip() or DEFAULT_MODEL
        self.instructions = instructions.strip()
        self.advanced = advanced or {}
        self.client = client

    async def respond(self, messages: list[AdvisorMessage], safety_identifier: str) -> AdvisorResult:
        payload = {
            "model": self.model,
            "instructions": self.instructions,
            "input": [{"role": item.role, "content": item.content} for item in messages],
            "max_output_tokens": int(self.advanced.get("max_output_tokens", MAX_OUTPUT_TOKENS)),
            "store": False,
            "tools": [],
            "tool_choice": "none",
            "safety_identifier": safety_identifier,
        }
        if self.advanced.get("reasoning_effort") not in (None, "default"):
            payload["reasoning"] = {"effort": self.advanced["reasoning_effort"]}
        if self.advanced.get("verbosity") not in (None, "default"):
            payload["text"] = {"verbosity": self.advanced["verbosity"]}
        owned_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=30)
        try:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            if response.status_code >= 400:
                logger.warning(
                    "Hub advisor provider failure provider=openai status=%s code=%s request_id=%s",
                    response.status_code,
                    _provider_error_code(response) or "unavailable",
                    response.headers.get("x-request-id", "unavailable"),
                )
            if response.status_code == 429:
                error_code = _provider_error_code(response)
                if error_code in {"insufficient_quota", "billing_hard_limit_reached"}:
                    raise AdvisorUnavailable(
                        "OpenAI API quota is unavailable. Check API billing and project credits, then try again."
                    )
                raise AdvisorProviderLimited(
                    "OpenAI is temporarily rate-limiting this API key. Try again shortly.",
                    _retry_after_seconds(response),
                )
            if response.status_code == 401:
                raise AdvisorUnavailable("OpenAI rejected the saved API key. Replace it in Platform Settings.")
            if response.status_code == 403:
                raise AdvisorUnavailable("This OpenAI API key cannot use the selected model.")
            if response.status_code == 404:
                raise AdvisorUnavailable("The selected OpenAI model is not available to this API key.")
            if response.status_code == 400:
                raise AdvisorUnavailable("OpenAI rejected the selected model or advanced configuration.")
            if response.status_code >= 400:
                raise AdvisorUnavailable("The advisor is temporarily unavailable.")
            data = response.json()
        except AdvisorError:
            raise
        except (httpx.HTTPError, ValueError):
            logger.exception("Hub advisor provider request failed")
            raise AdvisorUnavailable("The advisor is temporarily unavailable.") from None
        finally:
            if owned_client:
                await client.aclose()

        text = "\n".join(
            content.get("text", "").strip()
            for output in data.get("output", [])
            if output.get("type") == "message"
            for content in output.get("content", [])
            if content.get("type") == "output_text" and content.get("text", "").strip()
        ).strip()
        if not text:
            raise AdvisorUnavailable("The advisor did not return a response. Please try again.")
        usage = data.get("usage") or {}
        return AdvisorResult(
            text=text,
            model=str(data.get("model") or self.model),
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
        )


class AnthropicMessagesProvider:
    def __init__(
        self,
        api_key: str,
        model: str,
        client: httpx.AsyncClient | None = None,
        instructions: str = DEFAULT_HUB_ADVISOR_INSTRUCTIONS,
        advanced: dict | None = None,
    ):
        if not api_key.strip():
            raise AdvisorUnavailable("Hub Ask is not configured yet.")
        self.api_key = api_key.strip()
        self.model = model.strip()
        self.instructions = instructions.strip()
        self.advanced = advanced or {}
        self.client = client

    async def respond(self, messages: list[AdvisorMessage], safety_identifier: str) -> AdvisorResult:
        payload: dict = {
            "model": self.model,
            "system": self.instructions,
            "messages": [{"role": item.role, "content": item.content} for item in messages],
            "max_tokens": int(self.advanced.get("max_output_tokens", MAX_OUTPUT_TOKENS)),
            "metadata": {"user_id": safety_identifier},
        }
        if self.advanced.get("thinking_effort") not in (None, "default"):
            payload["thinking"] = {"type": "adaptive"}
            payload["output_config"] = {"effort": self.advanced["thinking_effort"]}
        owned_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=30)
        try:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=payload,
            )
            if response.status_code >= 400:
                logger.warning(
                    "Hub advisor provider failure provider=anthropic status=%s code=%s request_id=%s",
                    response.status_code,
                    _provider_error_code(response) or "unavailable",
                    response.headers.get("request-id", "unavailable"),
                )
            if response.status_code == 429:
                raise AdvisorProviderLimited(
                    "Anthropic is temporarily rate-limiting this API key. Try again shortly.",
                    _retry_after_seconds(response),
                )
            if response.status_code == 401:
                raise AdvisorUnavailable("Anthropic rejected the saved API key. Replace it in Platform Settings.")
            if response.status_code == 403:
                raise AdvisorUnavailable("This Anthropic API key cannot use the selected model.")
            if response.status_code == 404:
                raise AdvisorUnavailable("The selected Anthropic model is not available to this API key.")
            if response.status_code == 400:
                raise AdvisorUnavailable("Anthropic rejected the selected model or advanced configuration.")
            if response.status_code >= 400:
                raise AdvisorUnavailable("The advisor is temporarily unavailable.")
            data = response.json()
        except AdvisorError:
            raise
        except (httpx.HTTPError, ValueError):
            logger.exception("Hub advisor provider request failed")
            raise AdvisorUnavailable("The advisor is temporarily unavailable.") from None
        finally:
            if owned_client:
                await client.aclose()

        text = "\n".join(
            item.get("text", "").strip()
            for item in data.get("content", [])
            if item.get("type") == "text" and item.get("text", "").strip()
        ).strip()
        if not text:
            raise AdvisorUnavailable("The advisor did not return a response. Please try again.")
        usage = data.get("usage") or {}
        return AdvisorResult(
            text=text,
            model=str(data.get("model") or self.model),
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
        )


def configured_advisor_provider(db_session: Session) -> AdvisorProvider:
    try:
        provider, api_key, model, instructions, advanced = get_enabled_hub_advisor_credentials(db_session)
    except RuntimeError as error:
        raise AdvisorUnavailable(str(error)) from None
    if provider == "anthropic":
        return AnthropicMessagesProvider(api_key, model, instructions=instructions, advanced=advanced)
    return OpenAIResponsesProvider(api_key, model, instructions=instructions, advanced=advanced)


def validate_conversation(messages: list[AdvisorMessage]) -> None:
    if not messages or len(messages) > MAX_MESSAGES:
        raise HTTPException(status_code=422, detail=f"Send between 1 and {MAX_MESSAGES} messages.")
    if messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The final message must be from the learner.")
    total = 0
    expected: Literal["user", "assistant"] = "user"
    for message in messages:
        content = message.content.strip()
        if not content or len(content) > MAX_MESSAGE_CHARS:
            raise HTTPException(status_code=422, detail=f"Each message must be 1–{MAX_MESSAGE_CHARS} characters.")
        if message.role != expected:
            raise HTTPException(status_code=422, detail="Conversation roles must alternate, starting with the learner.")
        total += len(content)
        expected = "assistant" if expected == "user" else "user"
    if total > MAX_CONVERSATION_CHARS:
        raise HTTPException(status_code=422, detail="This conversation is too long. Start a new chat.")


async def ask_hub_advisor(
    request: Request,
    org_id: int,
    user_id: int,
    messages: list[AdvisorMessage],
    db_session: Session,
    provider: AdvisorProvider | None = None,
) -> AdvisorResult:
    require_org_membership(user_id, org_id, db_session)
    validate_conversation(messages)
    allowed, _, retry_after = check_rate_limit(
        f"hub_advisor:{org_id}:{user_id}:{get_client_ip(request)}",
        ADVISOR_RATE_LIMIT,
        ADVISOR_RATE_WINDOW_SECONDS,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many advisor requests. Try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )
    safety_identifier = hashlib.sha256(f"launchlms-hub:{user_id}".encode()).hexdigest()[:64]
    result = await (provider or configured_advisor_provider(db_session)).respond(messages, safety_identifier)
    logger.info(
        "hub_advisor_usage org_id=%s user_id=%s model=%s input_tokens=%s output_tokens=%s",
        org_id, user_id, result.model, result.input_tokens, result.output_tokens,
    )
    return result

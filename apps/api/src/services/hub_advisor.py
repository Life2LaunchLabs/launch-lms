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
    pass


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
    ):
        if not api_key.strip():
            raise AdvisorUnavailable("Hub Ask is not configured yet.")
        self.api_key = api_key.strip()
        self.model = model.strip() or DEFAULT_MODEL
        self.instructions = instructions.strip()
        self.client = client

    async def respond(self, messages: list[AdvisorMessage], safety_identifier: str) -> AdvisorResult:
        payload = {
            "model": self.model,
            "instructions": self.instructions,
            "input": [{"role": item.role, "content": item.content} for item in messages],
            "max_output_tokens": MAX_OUTPUT_TOKENS,
            "store": False,
            "tools": [],
            "tool_choice": "none",
            "safety_identifier": safety_identifier,
        }
        owned_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=30)
        try:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            if response.status_code == 429:
                raise AdvisorProviderLimited("The advisor is busy. Try again shortly.")
            if response.status_code >= 400:
                logger.warning("Hub advisor provider failure status=%s", response.status_code)
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


def configured_advisor_provider(db_session: Session) -> AdvisorProvider:
    try:
        api_key, model, instructions = get_enabled_hub_advisor_credentials(db_session)
    except RuntimeError as error:
        raise AdvisorUnavailable(str(error)) from None
    return OpenAIResponsesProvider(api_key, model, instructions=instructions)


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

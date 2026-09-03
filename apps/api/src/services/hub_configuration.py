"""Secure persisted configuration for platform Hub agents."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import datetime

import httpx
from config.config import get_launchlms_config
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.hub import (
    HubAdvisorAdvancedConfiguration,
    HubAdvisorConfiguration,
    HubAdvisorConfigurationUpdate,
    HubAdvisorProviderConfiguration,
)
from src.db.users import PublicUser

logger = logging.getLogger(__name__)

DEFAULT_HUB_ADVISOR_INSTRUCTIONS = """You are the Launch LMS Hub advisor. Help a learner clarify goals, consider realistic next steps, and reflect on tradeoffs. Be warm, concise, and practical. Ask at most one useful follow-up question at a time. Do not claim to have searched Launch LMS resources, accessed private data, remembered earlier sessions, or changed anything in the product. You have no tools. Do not present medical, legal, financial, or crisis guidance as professional advice; encourage appropriate qualified or emergency help when needed."""
CONFIGURATION_ID = 1
SUPPORTED_PROVIDERS = ("openai", "anthropic")
DEFAULT_MODELS = {"openai": "gpt-5.6-luna", "anthropic": "claude-haiku-4-5-20251001"}
PROVIDER_NAMES = {"openai": "OpenAI", "anthropic": "Anthropic"}

CURATED_MODELS = {
    "openai": [
        {"id": "gpt-6-astra", "name": "GPT-6 Astra", "description": "Highest capability for difficult end-to-end work."},
        {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol", "description": "High-quality choice for complex professional work."},
        {"id": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "description": "Balanced intelligence, latency, and cost."},
        {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna", "description": "Recommended for the Hub: fast and cost-conscious."},
    ],
    "anthropic": [
        {"id": "claude-opus-5", "name": "Claude Opus 5", "description": "Highest capability for complex enterprise work."},
        {"id": "claude-sonnet-5", "name": "Claude Sonnet 5", "description": "Balanced speed and intelligence."},
        {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5", "description": "Recommended for the Hub: fast and cost-effective."},
    ],
}


def _cipher() -> Fernet:
    root_secret = get_launchlms_config().security_config.auth_jwt_secret_key
    key = base64.urlsafe_b64encode(
        hashlib.sha256(f"launchlms:hub-advisor:{root_secret}".encode()).digest()
    )
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    return _cipher().encrypt(api_key.strip().encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken as error:
        logger.error("Hub advisor credential could not be decrypted")
        raise RuntimeError("Hub advisor credential is unreadable; replace it in Superadmin settings.") from error


def get_configuration_record(db_session: Session) -> HubAdvisorConfiguration | None:
    return db_session.exec(
        select(HubAdvisorConfiguration).where(HubAdvisorConfiguration.id == CONFIGURATION_ID)
    ).first()


def get_provider_record(
    db_session: Session, provider: str
) -> HubAdvisorProviderConfiguration | None:
    return db_session.exec(
        select(HubAdvisorProviderConfiguration).where(
            HubAdvisorProviderConfiguration.provider == provider
        )
    ).first()


def _advanced(record: HubAdvisorProviderConfiguration | None) -> dict:
    defaults = HubAdvisorAdvancedConfiguration().model_dump()
    if not record:
        return defaults
    try:
        saved = json.loads(record.advanced_settings)
    except (TypeError, ValueError):
        saved = {}
    return {**defaults, **saved}


def get_hub_advisor_configuration(db_session: Session) -> dict:
    configuration = get_configuration_record(db_session)
    active_provider = configuration.provider if configuration else "openai"
    provider_configurations = {}
    for provider in SUPPORTED_PROVIDERS:
        record = get_provider_record(db_session, provider)
        provider_configurations[provider] = {
            "model": record.model if record else DEFAULT_MODELS[provider],
            "api_key_configured": bool(record and record.api_key_ciphertext),
            "advanced": _advanced(record),
        }
    return {
        "provider": active_provider,
        "enabled": configuration.enabled if configuration else False,
        "instructions": configuration.instructions if configuration else DEFAULT_HUB_ADVISOR_INSTRUCTIONS,
        "provider_configurations": provider_configurations,
        "updated_at": configuration.updated_at if configuration else None,
        "updated_by_user_id": configuration.updated_by_user_id if configuration else None,
    }


def update_hub_advisor_configuration(
    db_session: Session,
    current_user: PublicUser,
    payload: HubAdvisorConfigurationUpdate,
) -> dict:
    provider = payload.provider
    model = payload.model.strip()
    instructions = payload.instructions.strip()
    if not model or not instructions:
        raise HTTPException(status_code=422, detail="Model and agent instructions are required.")

    provider_record = get_provider_record(db_session, provider)
    existing_ciphertext = provider_record.api_key_ciphertext if provider_record else None
    if payload.clear_api_key:
        existing_ciphertext = None
    if payload.api_key is not None:
        normalized_api_key = payload.api_key.strip()
        if len(normalized_api_key) < 20:
            raise HTTPException(status_code=422, detail=f"Enter a valid {PROVIDER_NAMES[provider]} API key.")
        existing_ciphertext = encrypt_api_key(normalized_api_key)
    if payload.enabled and not existing_ciphertext:
        raise HTTPException(status_code=422, detail=f"Add an {PROVIDER_NAMES[provider]} API key before enabling Hub Ask.")

    now = datetime.utcnow()
    if provider_record is None:
        provider_record = HubAdvisorProviderConfiguration(provider=provider, model=model)
    provider_record.model = model
    provider_record.api_key_ciphertext = existing_ciphertext
    provider_record.advanced_settings = payload.advanced.model_dump_json()
    provider_record.updated_at = now
    db_session.add(provider_record)

    configuration = get_configuration_record(db_session)
    if configuration is None:
        configuration = HubAdvisorConfiguration(
            id=CONFIGURATION_ID,
            provider=provider,
            instructions=instructions,
        )
    configuration.provider = provider
    configuration.enabled = payload.enabled
    configuration.instructions = instructions
    configuration.updated_by_user_id = current_user.id
    configuration.updated_at = now
    db_session.add(configuration)
    db_session.commit()
    db_session.refresh(configuration)
    logger.info(
        "hub_advisor_configuration_updated user_id=%s provider=%s enabled=%s key_configured=%s",
        current_user.id,
        provider,
        configuration.enabled,
        bool(provider_record.api_key_ciphertext),
    )
    return get_hub_advisor_configuration(db_session)


def get_enabled_hub_advisor_credentials(
    db_session: Session,
) -> tuple[str, str, str, str, dict]:
    configuration = get_configuration_record(db_session)
    if not configuration or not configuration.enabled:
        raise RuntimeError("Hub Ask is not configured or enabled.")
    provider_record = get_provider_record(db_session, configuration.provider)
    if not provider_record or not provider_record.api_key_ciphertext:
        raise RuntimeError("Hub Ask is not configured or enabled.")
    return (
        configuration.provider,
        decrypt_api_key(provider_record.api_key_ciphertext),
        provider_record.model,
        configuration.instructions,
        _advanced(provider_record),
    )


async def list_hub_advisor_models(db_session: Session, provider: str) -> dict:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=422, detail="Unsupported advisor provider.")
    curated = {item["id"]: {**item, "available": None} for item in CURATED_MODELS[provider]}
    record = get_provider_record(db_session, provider)
    if not record or not record.api_key_ciphertext:
        return {"provider": provider, "source": "curated", "models": list(curated.values())}

    api_key = decrypt_api_key(record.api_key_ciphertext)
    url = "https://api.openai.com/v1/models" if provider == "openai" else "https://api.anthropic.com/v1/models?limit=1000"
    headers = (
        {"Authorization": f"Bearer {api_key}"}
        if provider == "openai"
        else {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json().get("data", [])
    except (httpx.HTTPError, ValueError):
        logger.warning("Could not refresh Hub advisor model catalog for provider=%s", provider)
        return {"provider": provider, "source": "curated", "models": list(curated.values())}

    live = {str(item.get("id")): item for item in data if item.get("id")}
    for model_id, item in curated.items():
        item["available"] = model_id in live
    extras = []
    for model_id, item in live.items():
        if model_id in curated or not _looks_like_text_model(provider, model_id):
            continue
        extras.append({
            "id": model_id,
            "name": str(item.get("display_name") or model_id),
            "description": "Available to this API key.",
            "available": True,
        })
    return {"provider": provider, "source": "live", "models": [*curated.values(), *extras]}


def _looks_like_text_model(provider: str, model_id: str) -> bool:
    if provider == "anthropic":
        return model_id.startswith("claude-")
    excluded = ("audio", "embed", "image", "moderation", "realtime", "search", "transcribe", "tts", "whisper")
    return model_id.startswith(("gpt-", "o")) and not any(part in model_id for part in excluded)

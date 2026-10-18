"""Provider API keys for Coach. Several keys per provider; each tier picks one.

Keys are encrypted at rest and never returned after they're saved; admins see a label and the
last four characters.
"""

from __future__ import annotations

import base64
import hashlib
import logging
from datetime import datetime
from uuid import uuid4

import httpx
from config.config import get_launchlms_config
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import TIERS, CoachKeyCreate, CoachKeyUpdate, CoachPolicy, CoachProviderKey
from src.db.users import PublicUser

logger = logging.getLogger(__name__)

PROVIDERS = ("openai", "anthropic")
PROVIDER_NAMES = {"openai": "OpenAI", "anthropic": "Anthropic"}

CURATED_MODELS = {
    "openai": [
        {"id": "gpt-6-astra", "name": "GPT-6 Astra", "description": "Highest capability for difficult end-to-end work."},
        {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol", "description": "High-quality choice for complex professional work."},
        {"id": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "description": "Balanced intelligence, latency, and cost."},
        {"id": "gpt-5.6-luna", "name": "GPT-5.6 Luna", "description": "Fast and cost-conscious."},
    ],
    "anthropic": [
        {"id": "claude-opus-5-5", "name": "Claude Opus 5.5", "description": "Highest capability for complex work."},
        {"id": "claude-sonnet-5-5", "name": "Claude Sonnet 5.5", "description": "Balanced speed and intelligence."},
        {"id": "claude-haiku-5-5", "name": "Claude Haiku 5.5", "description": "Fast and cost-effective."},
    ],
}


def _cipher() -> Fernet:
    # The derivation label predates Coach's rename; changing it would make stored keys unreadable.
    root_secret = get_launchlms_config().security_config.auth_jwt_secret_key
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"launchlms:hub-advisor:{root_secret}".encode()).digest()))


def encrypt_api_key(api_key: str) -> str:
    return _cipher().encrypt(api_key.strip().encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken as error:
        logger.error("Coach provider key could not be decrypted")
        raise RuntimeError("A Coach API key is unreadable; replace it on Platform › Coach › Model.") from error


def key_dict(key: CoachProviderKey) -> dict:
    return {
        "key_uuid": key.key_uuid, "provider": key.provider, "label": key.label, "last_four": key.last_four,
        "created_at": key.created_at, "updated_at": key.updated_at,
    }


def list_keys(db: Session) -> list[CoachProviderKey]:
    return list(db.exec(select(CoachProviderKey).order_by(CoachProviderKey.provider, CoachProviderKey.created_at)).all())


def get_key(db: Session, key_uuid: str) -> CoachProviderKey:
    key = db.exec(select(CoachProviderKey).where(CoachProviderKey.key_uuid == key_uuid)).first()
    if key is None:
        raise HTTPException(status_code=404, detail="Key not found.")
    return key


def _secret(api_key: str, provider: str) -> str:
    value = api_key.strip()
    if len(value) < 20:
        raise HTTPException(status_code=422, detail=f"Enter a valid {PROVIDER_NAMES[provider]} API key.")
    return value


def create_key(db: Session, current_user: PublicUser, payload: CoachKeyCreate) -> dict:
    secret = _secret(payload.api_key, payload.provider)
    key = CoachProviderKey(
        key_uuid=f"coach_key_{uuid4().hex}", provider=payload.provider, label=payload.label.strip(),
        ciphertext=encrypt_api_key(secret), last_four=secret[-4:], created_by_user_id=current_user.id,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    logger.info("coach_key_created user_id=%s provider=%s", current_user.id, key.provider)
    return key_dict(key)


def update_key(db: Session, current_user: PublicUser, key_uuid: str, payload: CoachKeyUpdate) -> dict:
    key = get_key(db, key_uuid)
    if payload.label is not None:
        key.label = payload.label.strip()
    if payload.api_key is not None:
        secret = _secret(payload.api_key, key.provider)
        key.ciphertext, key.last_four = encrypt_api_key(secret), secret[-4:]
    key.updated_at = datetime.utcnow()
    db.add(key)
    db.commit()
    db.refresh(key)
    logger.info("coach_key_updated user_id=%s provider=%s replaced=%s", current_user.id, key.provider, payload.api_key is not None)
    return key_dict(key)


def delete_key(db: Session, key_uuid: str) -> None:
    key = get_key(db, key_uuid)
    from src.services.coach.policy import live_snapshot

    policy = db.get(CoachPolicy, 1)
    tiers = (policy.tiers if policy else None) or {}
    using = [tier for tier in TIERS if (tiers.get(tier) or {}).get("key_uuid") == key_uuid]
    if using:
        names = " and ".join(tier.capitalize() for tier in using)
        raise HTTPException(status_code=409, detail=f"{names} uses this key. Choose another key for it first.")
    live = live_snapshot(db).get("tiers") or {}
    if any((live.get(tier) or {}).get("key_uuid") == key_uuid for tier in TIERS):
        raise HTTPException(status_code=409, detail="The live release uses this key. Release a draft that doesn't use it first.")
    db.delete(key)
    db.commit()


async def list_models(db: Session, key_uuid: str) -> dict:
    """The provider's curated models, marked with what this key can use when the provider says."""
    key = get_key(db, key_uuid)
    provider = key.provider
    curated = {item["id"]: {**item, "available": None} for item in CURATED_MODELS[provider]}
    api_key = decrypt_api_key(key.ciphertext)
    url = "https://api.openai.com/v1/models" if provider == "openai" else "https://api.anthropic.com/v1/models?limit=1000"
    headers = {"Authorization": f"Bearer {api_key}"} if provider == "openai" else {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json().get("data", [])
    except (httpx.HTTPError, ValueError):
        logger.warning("Could not refresh the Coach model catalog for provider=%s", provider)
        return {"provider": provider, "source": "curated", "models": list(curated.values())}
    live = {str(item.get("id")): item for item in data if item.get("id")}
    for model_id, item in curated.items():
        item["available"] = model_id in live
    extras = [
        {"id": model_id, "name": str(item.get("display_name") or model_id), "description": "Available to this key.", "available": True}
        for model_id, item in live.items()
        if model_id not in curated and _looks_like_text_model(provider, model_id)
    ]
    return {"provider": provider, "source": "live", "models": [*curated.values(), *extras]}


def _looks_like_text_model(provider: str, model_id: str) -> bool:
    if provider == "anthropic":
        return model_id.startswith("claude-")
    excluded = ("audio", "embed", "image", "moderation", "realtime", "search", "transcribe", "tts", "whisper")
    return model_id.startswith(("gpt-", "o")) and not any(part in model_id for part in excluded)

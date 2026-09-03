"""Secure persisted configuration for platform Hub agents."""

from __future__ import annotations

import base64
import hashlib
import logging
from datetime import datetime

from config.config import get_launchlms_config
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.hub import HubAdvisorConfiguration, HubAdvisorConfigurationUpdate
from src.db.users import PublicUser

logger = logging.getLogger(__name__)

DEFAULT_HUB_ADVISOR_MODEL = "gpt-5.6-luna"
DEFAULT_HUB_ADVISOR_INSTRUCTIONS = """You are the Launch LMS Hub advisor. Help a learner clarify goals, consider realistic next steps, and reflect on tradeoffs. Be warm, concise, and practical. Ask at most one useful follow-up question at a time. Do not claim to have searched Launch LMS resources, accessed private data, remembered earlier sessions, or changed anything in the product. You have no tools. Do not present medical, legal, financial, or crisis guidance as professional advice; encourage appropriate qualified or emergency help when needed."""
CONFIGURATION_ID = 1


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


def get_hub_advisor_configuration(db_session: Session) -> dict:
    configuration = get_configuration_record(db_session)
    return {
        "provider": configuration.provider if configuration else "openai",
        "enabled": configuration.enabled if configuration else False,
        "model": configuration.model if configuration else DEFAULT_HUB_ADVISOR_MODEL,
        "instructions": (
            configuration.instructions if configuration else DEFAULT_HUB_ADVISOR_INSTRUCTIONS
        ),
        "api_key_configured": bool(configuration and configuration.api_key_ciphertext),
        "updated_at": configuration.updated_at if configuration else None,
        "updated_by_user_id": configuration.updated_by_user_id if configuration else None,
    }


def update_hub_advisor_configuration(
    db_session: Session,
    current_user: PublicUser,
    payload: HubAdvisorConfigurationUpdate,
) -> dict:
    model = payload.model.strip()
    instructions = payload.instructions.strip()
    if not model or not instructions:
        raise HTTPException(status_code=422, detail="Model and agent instructions are required.")
    configuration = get_configuration_record(db_session)
    existing_ciphertext = configuration.api_key_ciphertext if configuration else None
    if payload.clear_api_key:
        existing_ciphertext = None
    if payload.api_key is not None:
        normalized_api_key = payload.api_key.strip()
        if len(normalized_api_key) < 20:
            raise HTTPException(status_code=422, detail="Enter a valid OpenAI API key.")
        existing_ciphertext = encrypt_api_key(normalized_api_key)
    if payload.enabled and not existing_ciphertext:
        raise HTTPException(status_code=422, detail="Add an OpenAI API key before enabling Hub Ask.")

    if configuration is None:
        configuration = HubAdvisorConfiguration(
            id=CONFIGURATION_ID,
            provider="openai",
            model=model,
            instructions=instructions,
        )
    configuration.enabled = payload.enabled
    configuration.model = model
    configuration.instructions = instructions
    configuration.api_key_ciphertext = existing_ciphertext
    configuration.updated_by_user_id = current_user.id
    configuration.updated_at = datetime.utcnow()
    db_session.add(configuration)
    db_session.commit()
    db_session.refresh(configuration)
    logger.info(
        "hub_advisor_configuration_updated user_id=%s enabled=%s key_configured=%s",
        current_user.id,
        configuration.enabled,
        bool(configuration.api_key_ciphertext),
    )
    return get_hub_advisor_configuration(db_session)


def get_enabled_hub_advisor_credentials(db_session: Session) -> tuple[str, str, str]:
    configuration = get_configuration_record(db_session)
    if not configuration or not configuration.enabled or not configuration.api_key_ciphertext:
        raise RuntimeError("Hub Ask is not configured or enabled.")
    return (
        decrypt_api_key(configuration.api_key_ciphertext),
        configuration.model,
        configuration.instructions,
    )

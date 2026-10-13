"""Live Jira connection for tester feedback, edited from Platform → Feedback."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from datetime import datetime

from config.config import get_launchlms_config
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from src.db.feedback import FeedbackJiraConfiguration

logger = logging.getLogger(__name__)

CONFIGURATION_ID = 1


class FeedbackJiraConfigurationUpdate(BaseModel):
    enabled: bool = True
    base_url: str = Field(default="", max_length=500)
    email: str = Field(default="", max_length=320)
    # Omitted keeps the saved token; an empty string clears it.
    api_token: str | None = Field(default=None, max_length=2000)
    project_key: str = Field(default="", max_length=50)
    issue_type: str = Field(default="Task", max_length=100)
    board_id: str = Field(default="", max_length=50)


def _cipher() -> Fernet:
    root_secret = get_launchlms_config().security_config.auth_jwt_secret_key
    key = base64.urlsafe_b64encode(
        hashlib.sha256(f"launchlms:feedback-jira:{root_secret}".encode()).digest()
    )
    return Fernet(key)


def _decrypt(ciphertext: str | None) -> str:
    if not ciphertext:
        return ""
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        logger.error("Feedback Jira token could not be decrypted")
        return ""


def get_record(db_session: Session) -> FeedbackJiraConfiguration | None:
    return db_session.exec(
        select(FeedbackJiraConfiguration).where(
            FeedbackJiraConfiguration.id == CONFIGURATION_ID
        )
    ).first()


def environment_settings(environment=None) -> dict:
    env = environment or os.environ
    return {
        "base_url": str(
            env.get("LAUNCHLMS_FEEDBACK_JIRA_BASE_URL", env.get("JIRA_BASE_URL", ""))
        ),
        "email": str(
            env.get("LAUNCHLMS_FEEDBACK_JIRA_EMAIL", env.get("JIRA_EMAIL", ""))
        ),
        "token": str(
            env.get("LAUNCHLMS_FEEDBACK_JIRA_API_TOKEN", env.get("JIRA_API_TOKEN", ""))
        ),
        "project": str(
            env.get(
                "LAUNCHLMS_FEEDBACK_JIRA_PROJECT_KEY", env.get("JIRA_PROJECT_KEY", "")
            )
        ),
        "issue_type": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_ISSUE_TYPE", "Task")),
        "board_id": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_BOARD_ID", "")),
        "enabled": True,
    }


def record_settings(record: FeedbackJiraConfiguration) -> dict:
    return {
        "base_url": record.base_url,
        "email": record.email,
        "token": _decrypt(record.api_token_ciphertext),
        "project": record.project_key,
        "issue_type": record.issue_type or "Task",
        "board_id": record.board_id,
        "enabled": record.enabled,
    }


def stored_settings() -> dict | None:
    """The saved connection, read from the primary database (never a demo sandbox)."""
    from src.core.events.database import engine

    try:
        with Session(engine) as db_session:
            record = get_record(db_session)
            return record_settings(record) if record else None
    except Exception:
        # Missing table (unmigrated database) or no database: use the environment.
        logger.debug("Feedback Jira configuration unavailable", exc_info=True)
        return None


def serialize(db_session: Session) -> dict:
    record = get_record(db_session)
    env = environment_settings()
    env_configured = all((env["base_url"], env["email"], env["token"], env["project"]))
    if record:
        return {
            "source": "platform",
            "enabled": record.enabled,
            "base_url": record.base_url,
            "email": record.email,
            "has_api_token": bool(record.api_token_ciphertext),
            "project_key": record.project_key,
            "issue_type": record.issue_type,
            "board_id": record.board_id,
            "environment_configured": env_configured,
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }
    return {
        "source": "environment" if env_configured else "none",
        "enabled": True,
        "base_url": env["base_url"],
        "email": env["email"],
        "has_api_token": bool(env["token"]),
        "project_key": env["project"],
        "issue_type": env["issue_type"],
        "board_id": env["board_id"],
        "environment_configured": env_configured,
        "updated_at": None,
    }


def save(
    db_session: Session, body: FeedbackJiraConfigurationUpdate, user_id: int
) -> dict:
    base_url = body.base_url.strip().rstrip("/")
    if base_url and not base_url.startswith("https://"):
        raise HTTPException(status_code=422, detail="Jira URL must start with https://")
    record = get_record(db_session) or FeedbackJiraConfiguration(id=CONFIGURATION_ID)
    if body.api_token is None and not record.api_token_ciphertext:
        # First save from an environment-backed connection keeps its token.
        env_token = environment_settings()["token"]
        if env_token:
            record.api_token_ciphertext = _cipher().encrypt(env_token.encode()).decode()
    elif body.api_token is not None:
        token = body.api_token.strip()
        record.api_token_ciphertext = (
            _cipher().encrypt(token.encode()).decode() if token else None
        )
    record.enabled = body.enabled
    record.base_url = base_url
    record.email = body.email.strip()
    record.project_key = body.project_key.strip().upper()
    record.issue_type = body.issue_type.strip() or "Task"
    record.board_id = body.board_id.strip()
    record.updated_by_user_id = user_id
    record.updated_at = datetime.utcnow()
    db_session.add(record)
    db_session.commit()
    return serialize(db_session)

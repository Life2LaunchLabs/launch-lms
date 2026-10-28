"""Platform-wide API keys, edited in Platform › Settings: saved encrypted, else read from the environment."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from datetime import datetime

from config.config import get_launchlms_config
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.platform_secrets import PlatformSecret

logger = logging.getLogger(__name__)

# The keys a superadmin can set: name -> label, environment fallback, where to get one.
SECRETS = {
    "pexels": {"label": "Pexels", "env": "PEXELS_API_KEY", "help_url": "https://www.pexels.com/api/"},
}


def _cipher() -> Fernet:
    root_secret = get_launchlms_config().security_config.auth_jwt_secret_key
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"launchlms:platform-secret:{root_secret}".encode()).digest()))


def _known(name: str) -> dict:
    if name not in SECRETS:
        raise HTTPException(status_code=404, detail="Unknown platform key")
    return SECRETS[name]


def _record(db: Session, name: str) -> PlatformSecret | None:
    return db.exec(select(PlatformSecret).where(PlatformSecret.key == name)).first()


def get(name: str) -> str:
    """The key to use: the saved one, else the environment variable. Reads the primary database."""
    from src.core.events.database import engine

    try:
        with Session(engine) as db:
            record = _record(db, name)
            if record:
                return _cipher().decrypt(record.ciphertext.encode()).decode()
    except InvalidToken:
        logger.error("Platform key %s could not be decrypted", name)
    except Exception:
        # Missing table (unmigrated database) or no database: use the environment.
        logger.debug("Platform key %s unavailable", name, exc_info=True)
    return os.environ.get(SECRETS[name]["env"], "").strip()


def describe(db: Session) -> list[dict]:
    """What's set, never the keys themselves."""
    rows = []
    for name, info in SECRETS.items():
        record = _record(db, name)
        env = bool(os.environ.get(info["env"], "").strip())
        rows.append({
            "key": name, "label": info["label"], "help_url": info["help_url"], "env": info["env"],
            "source": "platform" if record else "environment" if env else "none",
            "last4": record.last4 if record else "", "updated_at": record.updated_at.isoformat() if record else None,
        })
    return rows


def save(db: Session, name: str, value: str, user_id: int) -> list[dict]:
    _known(name)
    value = value.strip()
    record = _record(db, name)
    if not value:
        if record:
            db.delete(record)
            db.commit()
        return describe(db)
    if len(value) < 8 or any(ch.isspace() for ch in value):
        raise HTTPException(status_code=422, detail="That doesn't look like an API key")
    record = record or PlatformSecret(key=name, ciphertext="")
    record.ciphertext = _cipher().encrypt(value.encode()).decode()
    record.last4 = value[-4:]
    record.updated_by_user_id = user_id
    record.updated_at = datetime.utcnow()
    db.add(record)
    db.commit()
    return describe(db)

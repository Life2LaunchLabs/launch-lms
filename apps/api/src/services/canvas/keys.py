"""Life2Launch's one LTI signing key, shared by every school.

Canvas asks for the tool's public key when the tool is registered (and v0.12.0's gradebook work signs
with it). The private key comes from LAUNCHLMS_LTI_PRIVATE_KEY (PEM) when set; otherwise it is made on
first use and kept encrypted with the platform secrets, so every API worker and restart uses the same one.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from datetime import datetime
from functools import lru_cache

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from src.db.platform_secrets import PlatformSecret

logger = logging.getLogger(__name__)

ENV_PRIVATE_KEY = "LAUNCHLMS_LTI_PRIVATE_KEY"
SECRET_NAME = "lti_signing_key"


def _cipher():
    from src.services.platform_secrets import _cipher as platform_cipher

    return platform_cipher()


def _generate_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()


def _stored_pem(db: Session) -> str | None:
    record = db.exec(select(PlatformSecret).where(PlatformSecret.key == SECRET_NAME)).first()
    return _cipher().decrypt(record.ciphertext.encode()).decode() if record else None


def private_key_pem(db: Session) -> str:
    env = os.environ.get(ENV_PRIVATE_KEY, "").strip()
    if env:
        return env.replace("\\n", "\n")
    stored = _stored_pem(db)
    if stored:
        return stored
    pem = _generate_pem()
    record = PlatformSecret(
        key=SECRET_NAME, ciphertext=_cipher().encrypt(pem.encode()).decode(), last4="", updated_at=datetime.utcnow()
    )
    try:
        db.add(record)
        db.commit()
        logger.info("Created the LTI signing key")
        return pem
    except IntegrityError:
        # Another worker made it first: use theirs.
        db.rollback()
        stored = _stored_pem(db)
        if not stored:
            raise
        return stored


def _b64(number: int) -> str:
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@lru_cache(maxsize=4)
def _public_jwk(pem: str) -> dict:
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    numbers = key.public_key().public_numbers()
    jwk = {"kty": "RSA", "e": _b64(numbers.e), "n": _b64(numbers.n)}
    # RFC 7638 thumbprint as the key id, so a new key gets a new id.
    thumbprint = hashlib.sha256(json.dumps(jwk, sort_keys=True, separators=(",", ":")).encode()).digest()
    kid = base64.urlsafe_b64encode(thumbprint).rstrip(b"=").decode()
    return {**jwk, "kid": kid, "alg": "RS256", "use": "sig"}


def public_jwk(db: Session) -> dict:
    return _public_jwk(private_key_pem(db))


def jwks(db: Session) -> dict:
    return {"keys": [public_jwk(db)]}

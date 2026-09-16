"""Issue short-lived, opaque sessions for the external operations surface."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Response
import jwt
from pydantic import BaseModel
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.org_auth import get_user_org_role, require_org_membership


router = APIRouter()
NONCE = re.compile(r"^[0-9a-f-]{16,64}$")


class OperationsSessionRequest(BaseModel):
    nonce: str
    protocol: str
    org_id: int


def _enabled() -> tuple[str, str]:
    enabled = os.getenv("LAUNCHLMS_OPERATIONS_SURFACE_ENABLED", "false").lower() == "true"
    environment = os.getenv("LAUNCHLMS_OPERATIONS_ENVIRONMENT", "").lower()
    if not enabled or not environment or environment == "production":
        raise HTTPException(status_code=404, detail="Operations surface is not enabled")
    return os.getenv("LAUNCHLMS_OPERATIONS_PROJECT", "launch-lms"), environment


def _opaque(kind: str, value: str) -> str:
    secret = os.getenv("LAUNCHLMS_OPERATIONS_SUBJECT_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(status_code=503, detail="Operations subject signing is not configured")
    return hmac.new(secret.encode(), f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()


@router.post("/session")
def issue_operations_session(
    payload: OperationsSessionRequest,
    response: Response,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    project, environment = _enabled()
    if payload.protocol != "launch-operations/v1" or not NONCE.fullmatch(payload.nonce):
        raise HTTPException(status_code=422, detail="Invalid operations protocol or nonce")
    require_org_membership(current_user.id, payload.org_id, db_session)
    organization = db_session.exec(select(Organization).where(Organization.id == payload.org_id)).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    role = get_user_org_role(current_user.id, payload.org_id, db_session)
    role_name = "superadmin" if current_user.is_superadmin else (role.name if role else "member")
    private_key = os.getenv("LAUNCHLMS_OPERATIONS_TOKEN_PRIVATE_KEY", "").replace("\\n", "\n")
    key_id = os.getenv("LAUNCHLMS_OPERATIONS_TOKEN_KEY_ID", "")
    if not private_key or not key_id:
        raise HTTPException(status_code=503, detail="Operations session signing is not configured")
    now = int(datetime.now(timezone.utc).timestamp())
    claims = {
        "iss": os.getenv("LAUNCHLMS_OPERATIONS_TOKEN_ISSUER", "launch-lms"),
        "aud": os.getenv("LAUNCHLMS_OPERATIONS_TOKEN_AUDIENCE", "launch-operations"),
        "project": project,
        "environment": environment,
        "sub": _opaque("user", current_user.user_uuid),
        "org": _opaque("organization", organization.org_uuid),
        "role": role_name,
        "nonce": payload.nonce,
        "iat": now,
        "exp": now + 240,
    }
    try:
        token = jwt.encode(claims, private_key, algorithm="EdDSA", headers={"kid": key_id})
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=503, detail="Operations signing key is invalid") from error
    response.headers["Cache-Control"] = "no-store"
    return {"token": token, "expires_in": 240, "protocol": payload.protocol}

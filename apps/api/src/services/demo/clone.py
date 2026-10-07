"""Create a fictional demo account as a copy of a consenting real account."""

import json
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.security.rbac.constants import USER_ROLE_ID
from src.security.security import security_hash_password, security_verify_password
from src.services.demo.cohort import identity
from src.services.demo.configuration import configuration
from src.services.demo.media import copy_user_files
from src.services.security.rate_limiting import check_rate_limit

DEMO_EMAIL_DOMAIN = "demo.example.com"
REJECTED = "The email or password for the account to copy is incorrect."


class CloneRequest(BaseModel):
    source_email: EmailStr
    # Proof that the account's owner agreed: the admin must know the password.
    password: str = Field(min_length=1, max_length=256)
    demo_email: EmailStr | None = None


def _unique_username(db: Session, base: str) -> str:
    candidate, suffix = f"{base}-demo", 1
    while db.exec(select(User).where(User.username == candidate)).first():
        suffix += 1
        candidate = f"{base}-demo-{suffix}"
    return candidate


def clone_account(db: Session, actor_id: int, body: CloneRequest) -> dict:
    config = configuration(db, lock=True)
    if not config.entry_org_id:
        raise HTTPException(
            422, "Choose the fictional scenario organization in Settings first."
        )
    allowed, _, retry = check_rate_limit(f"demo-clone:{actor_id}", 10, 600)
    if not allowed:
        raise HTTPException(
            429,
            "Too many attempts. Please wait before copying another account.",
            headers={"Retry-After": str(retry)},
        )
    source = db.exec(select(User).where(User.email == body.source_email)).first()
    try:
        verified = bool(
            source
            and source.password
            and security_verify_password(body.password, source.password)
        )
    except Exception:
        verified = False
    if not source or not verified:
        raise HTTPException(403, REJECTED)

    username = _unique_username(db, source.username)
    email = body.demo_email or f"{username}@{DEMO_EMAIL_DOMAIN}"
    if db.exec(select(User).where(User.email == email)).first():
        raise HTTPException(422, "That demo email address is already in use.")

    uuid = f"user_{uuid4()}"
    # Profile JSON and avatar paths embed the owner's uuid in their media URLs.
    swap = lambda value: json.loads(json.dumps(value).replace(source.user_uuid, uuid))  # noqa: E731
    now = str(datetime.now())
    clone = User(
        username=username,
        first_name=source.first_name,
        last_name=source.last_name,
        email=email,
        avatar_image=(source.avatar_image or "").replace(source.user_uuid, uuid),
        bio=source.bio,
        details=swap(source.details or {}),
        profile=swap(source.profile or {}),
        # Impersonation needs no password; this one is random and never disclosed.
        password=security_hash_password(secrets.token_urlsafe(32)),
        user_uuid=uuid,
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc).isoformat(),
        signup_method="demo_clone",
        creation_date=now,
        update_date=now,
    )
    db.add(clone)
    db.flush()
    db.add(
        UserOrganization(
            user_id=clone.id,
            org_id=config.entry_org_id,
            role_id=USER_ROLE_ID,
            creation_date=now,
            update_date=now,
        )
    )
    # Files first: a storage failure leaves no database rows behind.
    copy_user_files(source.user_uuid, uuid)
    db.commit()
    db.refresh(clone)
    return {
        **identity(clone),
        "user_email": clone.email,
        "pilotable": False,
        "description": "",
    }

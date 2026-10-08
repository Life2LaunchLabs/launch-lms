"""Demo Studio: create, copy, edit and remove demo users on the live site."""

import json
import secrets
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.demo import DemoMember
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.security.rbac.constants import ADMIN_ROLE_ID, MAINTAINER_ROLE_ID, USER_ROLE_ID
from src.security.security import security_hash_password, security_verify_password
from src.services.demo.cohort import (
    HANDLE,
    RESERVED_HANDLES,
    default_org,
    draft_accounts,
    resolve_handle,
    unique_handle,
    validate_member,
)
from src.services.demo.configuration import configuration
from src.services.demo.guide import GuidePages
from src.services.demo.media import copy_user_files
from src.services.security.rate_limiting import check_rate_limit

DEMO_EMAIL_DOMAIN = "demo.example.com"
REJECTED = "The email or password for the account to copy is incorrect."
ROLES = {"student": USER_ROLE_ID, "staff": MAINTAINER_ROLE_ID, "admin": ADMIN_ROLE_ID}


class OrgChoice(BaseModel):
    slug: str = Field(min_length=1, max_length=100)
    role: Literal["student", "staff", "admin"] = "student"


class StartPage(BaseModel):
    start_path: str = Field(default="", max_length=300)
    start_org_slug: str = Field(default="", max_length=100)

    @field_validator("start_path")
    @classmethod
    def path(cls, value: str) -> str:
        if value and (not value.startswith("/") or value.startswith("//")):
            raise ValueError("The start page must be a path starting with /.")
        return value


class CreateDemoUser(StartPage):
    start_from: Literal["blank", "copy", "duplicate"] = "blank"
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(default="", max_length=60)
    role_line: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=1000)
    orgs: list[OrgChoice] = Field(default_factory=list, max_length=10)
    pilotable: bool = True
    source_email: EmailStr | None = None
    # Proof that the account's owner agreed: the admin must know the password.
    password: str | None = Field(default=None, max_length=256)
    source_user_id: int | None = None
    include_conversations: bool = False


class UpdateDemoUser(StartPage):
    first_name: str | None = Field(default=None, min_length=1, max_length=60)
    last_name: str | None = Field(default=None, max_length=60)
    role_line: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    handle: str | None = Field(default=None, max_length=40)
    pilotable: bool | None = None
    position: int | None = None
    guide: GuidePages | None = None
    start_path: str | None = Field(default=None, max_length=300)  # type: ignore[assignment]
    start_org_slug: str | None = Field(default=None, max_length=100)  # type: ignore[assignment]


class AddExisting(BaseModel):
    user_email: EmailStr
    pilotable: bool = False


def _now() -> str:
    return str(datetime.now())


def _unique_username(db: Session, base: str) -> str:
    stem = "-".join(part for part in base.lower().split() if part) or "demo"
    candidate, suffix = f"{stem}-demo", 1
    while db.exec(select(User).where(User.username == candidate)).first():
        suffix += 1
        candidate = f"{stem}-demo-{suffix}"
    return candidate


def _source(db: Session, actor_id: int, body: CreateDemoUser) -> User | None:
    if body.start_from == "blank":
        return None
    if body.start_from == "duplicate":
        if not body.source_user_id or not db.get(DemoMember, body.source_user_id):
            raise HTTPException(422, "Choose a demo user to duplicate.")
        return db.get(User, body.source_user_id)
    allowed, _, retry = check_rate_limit(f"demo-clone:{actor_id}", 10, 600)
    if not allowed:
        raise HTTPException(
            429,
            "Too many attempts. Please wait before copying another account.",
            headers={"Retry-After": str(retry)},
        )
    source = (
        db.exec(select(User).where(User.email == body.source_email)).first()
        if body.source_email
        else None
    )
    try:
        verified = bool(
            source
            and source.password
            and body.password
            and security_verify_password(body.password, source.password)
        )
    except Exception:
        verified = False
    if not source or not verified:
        raise HTTPException(403, REJECTED)
    return source


def _memberships(db: Session, choices: list[OrgChoice]) -> dict[int, int]:
    main = default_org(db)
    result = {main.id: USER_ROLE_ID}
    for choice in choices:
        org = db.exec(
            select(Organization).where(Organization.slug == choice.slug)
        ).first()
        if not org:
            raise HTTPException(422, f"No organization has the slug “{choice.slug}”.")
        if org.id == main.id and choice.role == "admin":
            raise HTTPException(
                422,
                "Demo users cannot administer the main organization; that would grant platform access.",
            )
        result[org.id] = ROLES[choice.role]
    return result


def create_demo_user(db: Session, actor_id: int, body: CreateDemoUser) -> dict:
    config = configuration(db, lock=True)
    source = _source(db, actor_id, body)
    memberships = _memberships(db, body.orgs)
    username = _unique_username(db, f"{body.first_name} {body.last_name}")
    uuid = f"user_{uuid4()}"
    now = _now()

    def swap(value):
        if not source:
            return value or {}
        return json.loads(json.dumps(value or {}).replace(source.user_uuid, uuid))

    user = User(
        username=username,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        email=f"{username}@{DEMO_EMAIL_DOMAIN}",
        avatar_image=(source.avatar_image or "").replace(source.user_uuid, uuid)
        if source
        else "",
        bio=source.bio if source else "",
        details=swap(source.details if source else {}),
        profile=swap(source.profile if source else {}),
        # Setup mode needs no password; this one is random and never disclosed.
        password=security_hash_password(secrets.token_urlsafe(32)),
        user_uuid=uuid,
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc).isoformat(),
        signup_method="demo",
        creation_date=now,
        update_date=now,
    )
    db.add(user)
    db.flush()
    for org_id, role_id in memberships.items():
        db.add(
            UserOrganization(
                user_id=user.id,
                org_id=org_id,
                role_id=role_id,
                creation_date=now,
                update_date=now,
            )
        )
    copied = {}
    if source:
        from src.services.demo.copy import copy_account

        copied = copy_account(
            db, source, user, set(memberships), body.include_conversations
        )
    position = db.exec(select(func.max(DemoMember.position))).one() or 0
    source_member = db.get(DemoMember, source.id) if source else None
    db.add(
        DemoMember(
            user_id=user.id,
            pilotable=body.pilotable,
            description=body.description.strip(),
            role_line=body.role_line.strip(),
            handle=unique_handle(db, body.first_name),
            start_path=body.start_path,
            start_org_slug=body.start_org_slug,
            guide=dict(source_member.guide)
            if source_member and source_member.guide
            else {},
            position=position + 1,
        )
    )
    config.revision += 1
    db.add(config)
    # Files first: a storage failure leaves no database rows behind.
    if source:
        copy_user_files(source.user_uuid, uuid)
    db.commit()
    account = next(item for item in draft_accounts(db) if item["user_id"] == user.id)
    return {**account, "copied": copied}


def update_demo_user(db: Session, user_id: int, body: UpdateDemoUser) -> dict:
    member = db.get(DemoMember, user_id)
    user = db.get(User, user_id)
    if not member or not user:
        raise HTTPException(404, "That demo user no longer exists.")
    changes = body.model_dump(exclude_unset=True)
    if "handle" in changes:
        handle = (changes["handle"] or "").strip().lower()
        if not HANDLE.fullmatch(handle) or handle in RESERVED_HANDLES:
            raise HTTPException(
                422, "Use lowercase letters, numbers and dashes for the link name."
            )
        existing = resolve_handle(db, handle)
        if existing and existing.user_id != user_id:
            raise HTTPException(422, "Another demo user already uses that link name.")
        member.handle = handle
    for field in (
        "role_line",
        "description",
        "start_path",
        "start_org_slug",
        "pilotable",
        "position",
    ):
        if field in changes and changes[field] is not None:
            setattr(
                member,
                field,
                changes[field].strip()
                if isinstance(changes[field], str)
                else changes[field],
            )
    if body.guide is not None:
        member.guide = body.guide.model_dump()
    for field in ("first_name", "last_name"):
        if changes.get(field) is not None:
            setattr(user, field, changes[field].strip())
            user.update_date = _now()
            db.add(user)
    db.add(member)
    db.commit()
    return next(item for item in draft_accounts(db) if item["user_id"] == user_id)


def add_existing(db: Session, body: AddExisting) -> dict:
    config = configuration(db, lock=True)
    user = validate_member(
        db, db.exec(select(User).where(User.email == body.user_email)).first()
    )
    if db.get(DemoMember, user.id):
        raise HTTPException(422, "That account is already part of the demo.")
    position = db.exec(select(func.max(DemoMember.position))).one() or 0
    db.add(
        DemoMember(
            user_id=user.id,
            pilotable=body.pilotable,
            handle=unique_handle(db, user.first_name or user.username),
            position=position + 1,
        )
    )
    config.revision += 1
    db.add(config)
    db.commit()
    return next(item for item in draft_accounts(db) if item["user_id"] == user.id)


def remove_demo_user(db: Session, user_id: int) -> None:
    """Removes the account from the demo; the account itself stays."""
    config = configuration(db, lock=True)
    member = db.get(DemoMember, user_id)
    if not member:
        raise HTTPException(404, "That demo user no longer exists.")
    db.delete(member)
    config.revision += 1
    db.add(config)
    db.commit()


def mark_setup(db: Session, user_id: int) -> None:
    member = db.get(DemoMember, user_id)
    if member:
        member.last_setup_at = datetime.utcnow()
        db.add(member)
        db.commit()

"""Personas: accounts made fresh by the console, on the test domain, with no usable password.

Every persona joins the main (owner) org as a learner, like every account does at signup.
An org-owner persona also gets a new test org they administer. A new_signup or org_creator
persona starts like an account the front page's sign-up just made. Personas are never given
staff or admin roles in a real org.
"""

import secrets
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.organizations import Organization, OrganizationCreate
from src.db.user_organizations import UserOrganization
from src.db.user_tests import TestCohort, TestCohortOrg, TestPersona
from src.db.users import PublicUser, User
from src.security.rbac.constants import USER_ROLE_ID
from src.security.security import security_hash_password
from src.services.user_tests.cohorts import MAX_PERSONAS, get_cohort, is_open, persona_row, slugify
from src.services.user_tests.settings import email_domain


StartState = Literal["has_account", "new_signup", "org_creator", "org_owner"]
# Just made their account: they start with the profile a welcome signup gives (routers/auth.py).
JUST_SIGNED_UP = ("new_signup", "org_creator")


class CreatePersona(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(default="", max_length=60)
    brief: str = Field(default="", max_length=4000)
    start_state: StartState = "has_account"
    org_name: str = Field(default="", max_length=100)

    @field_validator("first_name", "last_name", "brief", "org_name")
    @classmethod
    def trimmed(cls, value: str) -> str:
        return value.strip()


class CreatePersonas(BaseModel):
    personas: list[CreatePersona] = Field(min_length=1, max_length=MAX_PERSONAS)


def _unique_handle(db: Session, cohort: TestCohort, first_name: str) -> str:
    stem = slugify(first_name, 20)
    candidate, suffix = stem, 1
    while db.exec(
        select(TestPersona).where(TestPersona.cohort_id == cohort.id, TestPersona.handle == candidate)
    ).first():
        suffix += 1
        candidate = f"{stem}-{suffix}"
    return candidate


def _unique_username(db: Session, base: str) -> str:
    candidate, suffix = base, 1
    while db.exec(select(User).where(User.username == candidate)).first():
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


def _unique_org_slug(db: Session, base: str) -> str:
    candidate, suffix = base, 1
    while db.exec(select(Organization).where(Organization.slug == candidate)).first():
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


def record_org(db: Session, user_id: int | None, org_id: int | None, email: str | None = None) -> bool:
    """Called when anyone creates an org: one a persona creates belongs to its cohort."""
    from src.services.user_tests.settings import is_test_address

    # Personas always have a test address, so real users never touch the persona tables.
    if not user_id or not org_id or not is_test_address(email):
        return False
    persona = db.get(TestPersona, int(user_id))
    if not persona:
        return False
    if not db.get(TestCohortOrg, int(org_id)):
        db.add(TestCohortOrg(org_id=int(org_id), cohort_id=persona.cohort_id, created_by_user_id=int(user_id)))
    org = db.get(Organization, int(org_id))
    if org and org.explore:
        org.explore = False  # never listed for real users
        db.add(org)
    db.commit()
    return True


def _create_user(db: Session, cohort: TestCohort, body: CreatePersona, main_org_id: int) -> tuple[User, TestPersona]:
    from src.services.auth.welcome import signup_profile

    handle = _unique_handle(db, cohort, body.first_name)
    username = _unique_username(db, f"{handle}-{cohort.slug}")
    now = str(datetime.now())
    started_at = datetime.now(timezone.utc).isoformat()
    just_signed_up = body.start_state in JUST_SIGNED_UP
    user = User(
        username=username,
        first_name=body.first_name,
        last_name=body.last_name,
        email=f"{handle}.{cohort.slug}@{email_domain()}",
        # Never disclosed: personas sign in only through admin-minted login links.
        password=security_hash_password(secrets.token_urlsafe(32)),
        user_uuid=f"user_{uuid4()}",
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc).isoformat(),
        signup_method="test_persona",
        details={"onboarding": {"started_at": started_at}} if just_signed_up else {},
        profile=signup_profile(started_at) if just_signed_up else {},
        creation_date=now,
        update_date=now,
    )
    db.add(user)
    db.flush()
    db.add(UserOrganization(user_id=user.id, org_id=main_org_id, role_id=USER_ROLE_ID, creation_date=now, update_date=now))
    persona = TestPersona(user_id=user.id, cohort_id=cohort.id, handle=handle, brief=body.brief, start_state=body.start_state)
    db.add(persona)
    db.commit()
    db.refresh(user)
    return user, persona


async def _create_owned_org(db: Session, cohort: TestCohort, user: User, persona: TestPersona, name: str) -> None:
    from src.services.orgs.orgs import create_org

    org_name = name or f"{user.first_name}'s test org"
    slug = _unique_org_slug(db, f"{slugify(org_name, 30)}-{cohort.slug}")
    org = await create_org(
        None,  # type: ignore[arg-type]  # create_org does not read the request
        OrganizationCreate(name=org_name, slug=slug, email=user.email, explore=False),
        PublicUser(**user.model_dump()),
        db,
    )
    record_org(db, user.id, org.id, user.email)


async def create_personas(db: Session, cohort_uuid: str, body: CreatePersonas) -> list[dict]:
    from src.services.orgs.owner import require_owner_org

    cohort = get_cohort(db, cohort_uuid)
    if not is_open(cohort):
        raise HTTPException(422, "This cohort is closed. Start a new one to add personas.")
    existing = db.exec(select(func.count()).select_from(TestPersona).where(TestPersona.cohort_id == cohort.id)).one()
    if existing + len(body.personas) > MAX_PERSONAS:
        raise HTTPException(422, f"A cohort holds at most {MAX_PERSONAS} personas.")
    main_org = require_owner_org(db)
    created = []
    for item in body.personas:
        user, persona = _create_user(db, cohort, item, int(main_org.id))
        if item.start_state == "org_owner":
            await _create_owned_org(db, cohort, user, persona, item.org_name)
        created.append(persona_row(db, persona, user))
    return created

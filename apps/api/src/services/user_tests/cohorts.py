"""Cohorts: one test run's world, with an expiry, a size cap and a close switch."""

import re
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select
from src.db.organizations import Organization
from src.db.user_tests import TestCohort, TestCohortOrg, TestMail, TestPersona
from src.db.users import User

MAX_OPEN_COHORTS = 5
MAX_PERSONAS = 50


class CreateCohort(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    days: int = Field(default=7, ge=1, le=30)
    notes: str = Field(default="", max_length=2000)

    @field_validator("name", "notes")
    @classmethod
    def trimmed(cls, value: str) -> str:
        return value.strip()


def slugify(value: str, limit: int = 24) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:limit].strip("-")
    return slug or "test"


def _unique_slug(db: Session, name: str) -> str:
    stem = slugify(name)
    candidate, suffix = stem, 1
    while db.exec(select(TestCohort).where(TestCohort.slug == candidate)).first():
        suffix += 1
        candidate = f"{stem[:20]}-{suffix}"
    return candidate


def get_cohort(db: Session, cohort_uuid: str) -> TestCohort:
    cohort = db.exec(select(TestCohort).where(TestCohort.cohort_uuid == cohort_uuid)).first()
    if not cohort:
        raise HTTPException(404, "That test cohort no longer exists.")
    return cohort


def is_open(cohort: TestCohort) -> bool:
    return cohort.status == "open" and cohort.expires_at > datetime.utcnow()


def create_cohort(db: Session, actor_id: int, body: CreateCohort) -> dict:
    now = datetime.utcnow()
    open_count = db.exec(
        select(func.count()).select_from(TestCohort).where(TestCohort.status == "open", TestCohort.expires_at > now)
    ).one()
    if open_count >= MAX_OPEN_COHORTS:
        raise HTTPException(422, f"Close a cohort first: at most {MAX_OPEN_COHORTS} can be open at once.")
    cohort = TestCohort(
        cohort_uuid=f"cohort_{uuid4().hex}",
        name=body.name,
        slug=_unique_slug(db, body.name),
        created_by=actor_id,
        expires_at=now + timedelta(days=body.days),
        notes=body.notes,
    )
    db.add(cohort)
    db.commit()
    db.refresh(cohort)
    return serialize(db, cohort)


def close_cohort(db: Session, cohort_uuid: str) -> dict:
    """Ends every session in it on their next request; personas and mail stay for review."""
    cohort = get_cohort(db, cohort_uuid)
    if cohort.status == "open":
        cohort.status, cohort.update_date = "closed", datetime.utcnow()
        db.add(cohort)
        db.commit()
    return serialize(db, cohort)


def persona_row(db: Session, persona: TestPersona, user: User) -> dict:
    unread = db.exec(
        select(func.count()).select_from(TestMail).where(TestMail.to_user_id == user.id, TestMail.opened_at.is_(None))
    ).one()
    return {
        "user_id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "username": user.username,
        "email": user.email,
        "handle": persona.handle,
        "brief": persona.brief,
        "start_state": persona.start_state,
        "last_active_at": persona.last_active_at.isoformat() + "Z" if persona.last_active_at else None,
        "unread_mail": unread,
        # Orgs this persona made, by hand or at the start: a new sign-up's org shows here once it exists.
        "orgs": [{"id": org_id, "name": name, "slug": slug} for org_id, name, slug in db.exec(
            select(Organization.id, Organization.name, Organization.slug).join(TestCohortOrg, TestCohortOrg.org_id == Organization.id)
            .where(TestCohortOrg.created_by_user_id == user.id).order_by(Organization.id)
        ).all()],
    }


def personas(db: Session, cohort: TestCohort) -> list[dict]:
    rows = db.exec(
        select(TestPersona, User)
        .join(User, User.id == TestPersona.user_id)
        .where(TestPersona.cohort_id == cohort.id)
        .order_by(TestPersona.creation_date, TestPersona.user_id)
    ).all()
    return [persona_row(db, persona, user) for persona, user in rows]


def serialize(db: Session, cohort: TestCohort, *, detail: bool = False) -> dict:
    count = db.exec(select(func.count()).select_from(TestPersona).where(TestPersona.cohort_id == cohort.id)).one()
    data = {
        "cohort_uuid": cohort.cohort_uuid,
        "name": cohort.name,
        "slug": cohort.slug,
        "status": cohort.status if cohort.status != "open" or is_open(cohort) else "expired",
        "notes": cohort.notes,
        "expires_at": cohort.expires_at.isoformat() + "Z",
        "creation_date": cohort.creation_date.isoformat() + "Z",
        "persona_count": count,
        "stages": cohort.stages or [],
        "max_personas": MAX_PERSONAS,
    }
    if detail:
        data["personas"] = personas(db, cohort)
        data["org_ids"] = list(
            db.exec(select(TestCohortOrg.org_id).where(TestCohortOrg.cohort_id == cohort.id)).all()
        )
    return data


def list_cohorts(db: Session) -> list[dict]:
    cohorts = db.exec(select(TestCohort).order_by(TestCohort.creation_date.desc())).all()
    return [serialize(db, cohort) for cohort in cohorts]

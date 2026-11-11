"""What an organization calls the people it supports: "students", "trainees", "participants".

Organizations aren't all schools: an HR team onboarding new hires, a summer camp and a district all use
the app, and their people can be any age. So the app never says "learners" or "youth" to staff; it
uses the organization's own word, kept in ``customization.general`` as ``people_one`` and
``people_many``. /start fills it in from the role picked there, admins change it in Settings, and an
organization without one gets the neutral "participant".
"""

from __future__ import annotations

import re
from datetime import datetime

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.users import PublicUser

DEFAULT = ("participant", "participants")
# The word each /start role starts with (services/orgs/onboarding.ROLES).
ROLE_WORDS: dict[str, tuple[str, str]] = {
    "parent": ("kid", "kids"),
    "mentor": ("mentee", "mentees"),
    "teacher": ("student", "students"),
    "program": DEFAULT,
    "training": ("trainee", "trainees"),
    "district": ("student", "students"),
}
WORD = re.compile(r"^[^\W\d_][^\W\d_' \-]*(?:[ '\-][^\W\d_]+)*$", re.UNICODE)


class PeopleWords(BaseModel):
    one: str = Field(min_length=1, max_length=30)
    many: str = Field(min_length=1, max_length=30)

    @field_validator("one", "many")
    @classmethod
    def _word(cls, value: str) -> str:
        value = " ".join(value.split()).lower()
        if not WORD.match(value):
            raise ValueError("Use letters, spaces or hyphens, like “team members”")
        return value


def words(db: Session, org_id: int) -> tuple[str, str]:
    """(one, many) for this organization, the neutral default when it has none."""
    row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    general = ((((row.config if row else None) or {}).get("customization") or {}).get("general")) or {}
    one, many = general.get("people_one"), general.get("people_many")
    return (one, many) if one and many else DEFAULT


async def update(request: Request, db: Session, current_user: PublicUser, org_id: int, payload: PeopleWords) -> dict:
    """Store the organization's word, for someone who may change its settings."""
    from src.services.orgs.orgs import rbac_check

    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    await rbac_check(request, org.org_uuid, current_user, "update", db)
    row = db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Organization config not found")
    config = dict(row.config or {})
    customization = dict(config.get("customization") or {})
    customization["general"] = {**(customization.get("general") or {}), "people_one": payload.one, "people_many": payload.many}
    row.config = {**config, "customization": customization}
    row.update_date = str(datetime.now())
    db.add(row)
    db.commit()
    return payload.model_dump()

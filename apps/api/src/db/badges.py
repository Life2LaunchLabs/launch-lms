"""Badges: an optional part of a plan, and the awards learners earn.

A plan template may earn one badge. The badge is a block of the template
document (``services/badges/definition.py``), so it is drafted, versioned and
released with the plan; nearly everything about it (name, image, criteria,
alignment, creator, version) comes from the plan. ``BadgeAward`` is what a
learner earns: by finishing the plan, or awarded directly by staff who sign off
on equivalent work. Awards keep the achievement as it was when earned, so they
survive later releases and even the plan's deletion.

Each award is issued as a signed Open Badges 3.0 credential
(``services/badges/signing.py``), kept as issued, with a slot in its issuing
organization's revocation status list. ``OrgSigningKey`` is the organization's
Ed25519 key; its private half is encrypted at rest.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime
from enum import Enum

from sqlalchemy import JSON, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlmodel import Field, SQLModel


class AwardSource(str, Enum):
    PLAN_COMPLETION = "plan_completion"
    DIRECT_AWARD = "direct_award"


class AwardStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"


# Crockford base32: no I, L, O or U, so a code read off a printed certificate can't be mistyped as another.
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_award_code() -> str:
    """An award's short public code, for its page at ``/b/<code>`` and the certificate."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


class BadgeAward(SQLModel, table=True):
    __tablename__ = "badge_award"
    __table_args__ = (
        UniqueConstraint("award_uuid"),
        UniqueConstraint("code", name="uq_badge_award_code"),
        # A learner holds a plan's badge once; a revoked award doesn't count, so it can be awarded again.
        Index("uq_badge_award_active_holder", "template_id", "user_id", unique=True,
              postgresql_where=text("status = 'active'"), sqlite_where=text("status = 'active'")),
        UniqueConstraint("issuing_org_id", "status_list_index"),
    )

    id: int | None = Field(default=None, primary_key=True)
    award_uuid: str = Field(index=True)
    # Its short public code: the award's page is /b/<code>.
    code: str = Field(default_factory=new_award_code, sa_column=Column(String, nullable=False))
    # The plan whose badge it is; None once the plan is deleted (the award keeps its achievement).
    template_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="SET NULL"), nullable=True, index=True))
    # The release it was earned against.
    version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template_version.id", ondelete="SET NULL"), nullable=True))
    semver: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    # The organization that ran the plan with the learner or awarded it; the plan's owner is the badge's creator.
    issuing_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))
    creator_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True))
    source: AwardSource = Field(default=AwardSource.PLAN_COMPLETION, sa_column=Column(String, nullable=False, index=True))
    # The learner's plan it was earned by (plan completions).
    goal_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal.id", ondelete="SET NULL"), nullable=True))
    # Direct awards: who signed off, what the learner did, a link to the work.
    awarded_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    statement: str = ""
    evidence_url: str = ""
    earned_on: date = Field(sa_column=Column(Date, nullable=False))
    # The achievement as it was when earned (see services/badges/definition.achievement).
    achievement: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    issued_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    status: AwardStatus = Field(default=AwardStatus.ACTIVE, sa_column=Column(String, nullable=False, server_default="active", index=True))
    revoked_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    revoked_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    revoked_reason: str = ""
    # The award's slot in its issuing organization's revocation status list, and the signed credential as issued.
    status_list_index: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    credential: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class OrgSigningKey(SQLModel, table=True):
    """An organization's Ed25519 key for signing the credentials it issues, made on its first award."""
    __tablename__ = "org_signing_key"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, unique=True))
    # Multikey (multibase base58btc of 0xed01 + the raw key), as the DID document publishes it.
    public_key_multibase: str = Field(sa_column=Column(String, nullable=False))
    # The raw private key, Fernet-encrypted with the credential key (services/badges/signing.py).
    private_key_encrypted: str = Field(sa_column=Column(Text, nullable=False))
    creation_date: str = ""

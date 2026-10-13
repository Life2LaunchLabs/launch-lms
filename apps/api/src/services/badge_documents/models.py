"""Badge Document v1: one badge's credential, Marketing story and listing as JSON.

Used by the Claude connector to read, validate, create, save and publish
badges in one piece, the same way Plan Template Documents are used for plan
templates. The document is the badge's working version: a published version is
never edited in place (saving over one starts a new draft).
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DOCUMENT_FORMAT = "launch-lms.badge"
DOCUMENT_FORMAT_VERSION = 1
GUIDE_PATH = Path(__file__).with_name("authoring_guide.md")

# The values the admin Definition tab offers.
ACHIEVEMENT_TYPES = (
    "Achievement", "Badge", "Award", "Assessment", "Certificate", "CertificateOfCompletion", "Certification", "Competency", "Course",
)
CERTIFICATE_THEMES = ("royal", "tech", "nature", "geometric", "vintage", "waves", "minimal", "professional", "academic", "modern")
AchievementType = Literal["Achievement", "Badge", "Award", "Assessment", "Certificate", "CertificateOfCompletion", "Certification", "Competency", "Course"]
CertificateTheme = Literal["royal", "tech", "nature", "geometric", "vintage", "waves", "minimal", "professional", "academic", "modern"]


class BadgeCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", description="One or two sentences: what earning it says about the learner. Required to publish.")
    criteria: str = Field(default="", description="What a learner must do to earn it (the Open Badges criteria narrative). Required to publish.")
    about: str = Field(default="", description="The longer story on the badge page: who it is for and why it matters.")
    image_url: str = Field(default="", description="Badge image: an https URL or a /content/... path already in Launch LMS.")
    achievement_type: AchievementType = "Badge"
    certificate_theme: CertificateTheme = Field(default="professional", description="Background pattern of the printable certificate.")
    criteria_url: str = Field(default="", description="Optional public URL describing the criteria.")
    issuer_name: str = Field(default="", description="Optional issuer name to show instead of the organization's name.")
    direct_issuance: bool = Field(default=True, description="Staff may award it directly, without the learner finishing a plan.")


class BadgeHighlight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = ""
    body: str = ""
    media_url: str = ""
    image_side: Literal["left", "right"] = "left"


class BadgeMarketing(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subtitle: str = Field(default="", description="Short line under the name on cards and the badge page.")
    estimated_time: str = Field(default="", description="e.g. \"~2 hrs\" or \"4 weeks\".")
    trust_line: str = Field(default="", description="e.g. \"100% free - start anytime - no pressure\".")
    highlights: list[BadgeHighlight] = Field(default_factory=list, description="\"What it proves\" cards on the badge page, in order.")


class BadgeListing(BaseModel):
    model_config = ConfigDict(extra="forbid")

    collection_uuid: str | None = Field(default=None, description="The badge collection it belongs to (see list_badge_collections); null for none.")
    public: bool = Field(default=True, description="Shown in Discover once published.")
    marketplace_listed: bool = Field(default=False, description="Offered to other organizations to issue.")


class BadgeDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["launch-lms.badge"] = DOCUMENT_FORMAT
    format_version: Literal[1] = DOCUMENT_FORMAT_VERSION
    badge: BadgeCredential
    marketing: BadgeMarketing = Field(default_factory=BadgeMarketing)
    listing: BadgeListing = Field(default_factory=BadgeListing, description="Not versioned: changes apply immediately, also to the live badge.")


def badge_json_schema() -> dict:
    return BadgeDocument.model_json_schema()


def authoring_guide() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")

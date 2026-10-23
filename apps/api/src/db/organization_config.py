from typing import Literal

from pydantic import BaseModel, field_validator
from sqlalchemy import JSON, BigInteger, Column, ForeignKey
from sqlmodel import Field, SQLModel
from src.db.discover import DiscoverSettings

# ============================================================================
# Auth Branding
# ============================================================================

class AuthBrandingConfig(BaseModel):
    welcome_message: str = ""
    background_type: Literal["gradient", "custom", "unsplash"] = "gradient"
    background_image: str = ""
    text_color: Literal["light", "dark"] = "light"


# ============================================================================
# Customization models
# ============================================================================

class GeneralCustomization(BaseModel):
    color: str = ""
    dark_color: str = ""
    footer_text: str = ""
    favicon_image: str = ""
    hide_org_name: bool = False
    # Off, the one logo shows in both themes; on, dark_logo_image replaces it in dark mode.
    separate_dark_logo: bool = False
    dark_logo_image: str = ""


class DarkLogoConfig(BaseModel):
    separate_dark_logo: bool = False
    dark_logo_image: str = Field(default="", max_length=2048)

    @field_validator("dark_logo_image")
    @classmethod
    def _stored_image(cls, value: str) -> str:
        # A media library URL, a site path or a stored file name; nothing that could run as a link.
        value = value.strip()
        safe = value.startswith(("https://", "http://")) or (":" not in value and not value.startswith("//"))
        if value and not safe:
            raise ValueError("dark_logo_image must be a media URL or file name")
        return value


class SeoOrgConfig(BaseModel):
    default_meta_title_suffix: str = ""
    default_meta_description: str = ""
    default_og_image: str = ""
    google_site_verification: str = ""
    twitter_handle: str = ""
    noindex_communities: bool = False


class BadgeIssuerConfig(BaseModel):
    name: str = ""
    url: str = ""
    email: str = ""
    description: str = ""
    image_url: str = ""


class OnboardingGoalBadges(BaseModel):
    higher_education: list[str] = Field(default_factory=list)
    employment: list[str] = Field(default_factory=list)
    self_starting: list[str] = Field(default_factory=list)
    not_sure: list[str] = Field(default_factory=list)


class OnboardingConfig(BaseModel):
    recommended_badges: OnboardingGoalBadges = OnboardingGoalBadges()


class CustomizationConfig(BaseModel):
    general: GeneralCustomization = GeneralCustomization()
    auth_branding: AuthBrandingConfig = AuthBrandingConfig()
    seo: SeoOrgConfig = SeoOrgConfig()
    badge_issuer: BadgeIssuerConfig = BadgeIssuerConfig()
    onboarding: OnboardingConfig = OnboardingConfig()
    landing: dict = Field(default_factory=dict)
    discover: DiscoverSettings = Field(default_factory=DiscoverSettings)


# ============================================================================
# Messaging policy
# ============================================================================

class MessagingPolicy(BaseModel):
    """Who may message whom in an organization. Helpers are never messaged directly: only in their plan's feed."""

    # Staff and learners may open one-to-one chats (on by default, as before the policy). Off keeps every staff-learner conversation in a plan feed.
    staff_dm_learners: bool = True
    # A learner's plan feed takes messages only once at least two staff are on it.
    min_two_staff_on_feeds: bool = False
    # A helper a learner invites to a plan the organization gave them joins only after an admin approves.
    helper_approval: bool = False


# ============================================================================
# Config document
# ============================================================================

class OrganizationConfigDocument(BaseModel):
    """What `OrganizationConfig.config` holds. Access rules live in `security/access/catalog.py`."""

    config_version: str = "3.0"
    active: bool = True
    tier: Literal["free", "full", "enterprise"] = "free"
    # Partner programs a superadmin approved (badge_publisher, plan_publisher, resource_partner).
    partners: list[str] = Field(default_factory=list)
    # Superadmin grants: {"payments": {"enabled": true}, "learners": {"extra": 40}}.
    grants: dict = Field(default_factory=dict)
    # The one Full trial, once started: {"tier": "full", "started_at": iso, "ends_at": iso}. See services/orgs/trial.py.
    trial: dict | None = None
    # Set by /start: {"role", "solo", "created_by_user_id", "completed_at"}. See services/orgs/onboarding.py.
    setup: dict | None = None
    signup_mode: Literal["open", "inviteOnly"] = "open"
    customization: CustomizationConfig = CustomizationConfig()
    messaging: MessagingPolicy = MessagingPolicy()


# ============================================================================
# SQLModel table (config is a JSON blob)
# ============================================================================

class OrganizationConfig(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    config: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str | None = None
    update_date: str | None = None

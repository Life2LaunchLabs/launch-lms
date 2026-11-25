from datetime import date
from typing import TYPE_CHECKING

from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel
from src.db.roles import RoleRead

if TYPE_CHECKING:
    from src.db.organizations import OrganizationRead



class UserBase(SQLModel):
    username: str
    first_name: str
    last_name: str
    # The name someone goes by, shown everywhere except rosters and official reports.
    preferred_name: str | None = ""
    email: EmailStr
    avatar_image: str | None = ""
    bio: str | None = ""
    details: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    profile: dict | None = Field(default_factory=dict, sa_column=Column(JSON))

class UserCreate(UserBase):
    first_name: str = ""
    last_name: str = ""
    password: str
    # Checked at sign-up (no one under 13, DEV-38) and kept on the account (DEV-139); never sent back in a response.
    birth_date: date | None = Field(default=None, exclude=True)


class UserSignupCreate(UserCreate):
    pass


class UserUpdate(UserBase):
    username: str
    first_name: str | None = None
    last_name: str | None = None
    email: str
    avatar_image: str | None = ""
    bio: str | None = ""
    details: dict | None = Field(default_factory=dict)
    profile: dict | None = Field(default_factory=dict)


class UserUpdatePassword(SQLModel):
    old_password: str
    new_password: str


class UserRead(UserBase):
    id: int
    user_uuid: str
    email_verified: bool = False
    last_login_at: str | None = None
    signup_method: str | None = None
    is_superadmin: bool = False


# Keys of ``User.details`` that are the person's own: accessibility and email settings, the account's phone number
# and its Google sign-in state (PF-3). Other people never see them.
PRIVATE_DETAILS = ("accessibility", "email_notifications", "phone", "google_sign_in")


class UserReadPublic(UserBase):
    """User model for public-facing endpoints — excludes sensitive fields."""
    id: int
    user_uuid: str
    email_verified: bool = False
    avatar_image: str | None = ""
    bio: str | None = ""

    @field_validator("details", mode="after")
    @classmethod
    def _private_details(cls, value: dict | None) -> dict | None:
        """Accessibility and email settings are the person's own; other people never see them."""
        return {key: item for key, item in value.items() if key not in PRIVATE_DETAILS} if isinstance(value, dict) else value


class PublicUser(UserRead):
    pass


class UserRoleWithOrg(BaseModel):
    role: RoleRead
    org: "OrganizationRead"


class UserSession(BaseModel):
    user: UserRead
    roles: list[UserRoleWithOrg]


class AnonymousUser(SQLModel):
    id: int = 0
    user_uuid: str = "user_anonymous"
    username: str = "anonymous"

class InternalUser(SQLModel):
    id: int = 0
    user_uuid: str = "user_internal"
    username: str = "internal"


class APITokenUser(SQLModel):
    """
    Represents an authenticated API token request.
    Used to identify requests made with API tokens instead of user sessions.
    """
    id: int = 0  # Token ID
    user_uuid: str = "apitoken_user"  # Will be set to token_uuid
    username: str = "api_token"
    org_id: int  # CRITICAL: Organization scope - token can only access this org
    rights: dict | None = None  # Token's rights/permissions
    token_name: str = ""
    created_by_user_id: int = 0  # User who created the token


class User(UserBase, table=True):
    __table_args__ = (
        Index("ix_user_email", "email"),
        {"extend_existing": True},
    )
    id: int | None = Field(default=None, primary_key=True)
    password: str = ""
    user_uuid: str = Field(default="", index=True)
    email_verified: bool = False
    email_verified_at: str | None = None
    failed_login_attempts: int = 0
    locked_until: str | None = None
    last_login_at: str | None = None
    last_login_ip: str | None = None
    signup_method: str | None = None
    is_superadmin: bool = Field(default=False)
    # The date of birth given at sign-up (DEV-139): suggestions by age and age-gated opportunities. Only the person
    # (Download my data) and the app itself use it; it is left out of every response and never shown to staff.
    # Accounts made before it was kept, or by a school's single sign-on, have none.
    birth_date: date | None = Field(default=None, exclude=True)
    creation_date: str = ""
    update_date: str = ""


# Rebuild models to resolve forward references after all classes are defined
def rebuild_models():
    from src.db.organizations import OrganizationRead  # noqa: F401
    UserRoleWithOrg.model_rebuild()
    UserSession.model_rebuild()

rebuild_models()

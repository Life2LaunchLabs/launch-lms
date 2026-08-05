from typing import TYPE_CHECKING

from pydantic import BaseModel, EmailStr
from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel
from src.db.roles import RoleRead

if TYPE_CHECKING:
    from src.db.organizations import OrganizationRead



class UserBase(SQLModel):
    username: str
    first_name: str
    last_name: str
    email: EmailStr
    avatar_image: str | None = ""
    bio: str | None = ""
    details: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    profile: dict | None = Field(default_factory=dict, sa_column=Column(JSON))

class UserCreate(UserBase):
    first_name: str = ""
    last_name: str = ""
    password: str


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


class UserReadPublic(UserBase):
    """User model for public-facing endpoints — excludes sensitive fields."""
    id: int
    user_uuid: str
    email_verified: bool = False
    avatar_image: str | None = ""
    bio: str | None = ""


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
    creation_date: str = ""
    update_date: str = ""


# Rebuild models to resolve forward references after all classes are defined
def rebuild_models():
    from src.db.organizations import OrganizationRead  # noqa: F401
    UserRoleWithOrg.model_rebuild()
    UserSession.model_rebuild()

rebuild_models()

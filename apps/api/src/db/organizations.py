from typing import TYPE_CHECKING

from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel
from src.db.organization_config import OrganizationConfig
from src.db.roles import RoleRead
from src.db.usergroups import UserGroupRead

if TYPE_CHECKING:
    from src.db.users import UserRead


class OrganizationBase(SQLModel):
    name: str
    description: str | None = None
    about: str | None = None
    socials: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    links: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    scripts: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    logo_image: str | None = None
    thumbnail_image: str | None = None
    previews: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    explore: bool | None = Field(default=False)
    label: str | None = None
    slug: str
    email: str


class Organization(OrganizationBase, table=True):
    __table_args__ = {"extend_existing": True}
    id: int | None = Field(default=None, primary_key=True)
    org_uuid: str = Field(default="", unique=True)
    slug: str = Field(unique=True, index=True)  # Override to add unique constraint
    creation_date: str = ""
    update_date: str = ""

class OrganizationUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    about: str | None = None
    socials: dict | None = None
    links: dict | None = None
    scripts: dict | None = None
    logo_image: str | None = None
    thumbnail_image: str | None = None
    previews: dict | None = None
    label: str | None = None
    slug: str | None = None
    email: str | None = None
    explore: bool | None = None

class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase):
    id: int
    org_uuid: str
    config: OrganizationConfig | dict | None = None
    creation_date: str
    update_date: str


class PublicPage(BaseModel):
    """What an organization's public page adds to its stored fields (config ``page`` block)."""
    city: str = ""
    website: str = ""
    highlights: list[str] = []
    # Plan template uuids: up to three shown first, and any the admin keeps off the page.
    pinned_plans: list[str] = []
    hidden_plans: list[str] = []


class OrganizationDiscoverRead(OrganizationRead):
    """An organization as its public page and Discover show it. Outside the org there is no
    contact email, no config and no head count: the page is about what it offers, not its people."""
    signup_mode: str = "open"
    is_member: bool = False
    page: PublicPage = PublicPage()
    plan_count: int = 0
    badge_count: int = 0
    # The page meets Discover's bar: a cover, a tagline and a plan anyone can join or request.
    complete: bool = False
    # Turned on "List us in Discover" (Organization.explore) and complete: it shows on the shelf.
    listed: bool = False


class PublicPageUpdate(BaseModel):
    """The Public page settings tab. Unset fields stay as they are."""
    description: str | None = PydanticField(default=None, max_length=100)
    about: str | None = PydanticField(default=None, max_length=1500)
    city: str | None = PydanticField(default=None, max_length=80)
    website: str | None = PydanticField(default=None, max_length=300)
    socials: dict[str, str] | None = None
    highlights: list[str] | None = PydanticField(default=None, max_length=3)
    pinned_plans: list[str] | None = PydanticField(default=None, max_length=3)
    hidden_plans: list[str] | None = PydanticField(default=None, max_length=200)
    listed: bool | None = None


class OrganizationUser(BaseModel):
    user: "UserRead"
    role: RoleRead
    usergroups: list[UserGroupRead] = []
    joined_at: str | None = None
    membership_status: str = "active"
    membership_status_since: str | None = None
    # Staff only: what they may do (security/org_auth.STAFF_PERMISSIONS); admins have every permission.
    permissions: list[str] = []


# Rebuild models to resolve forward references after all classes are defined
def rebuild_models():
    from src.db.users import UserRead  # noqa: F401
    OrganizationUser.model_rebuild()

rebuild_models()

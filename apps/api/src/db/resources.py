from enum import Enum

from sqlalchemy import Boolean, Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class ResourceTypeEnum(str, Enum):
    assessment = "assessment"
    video = "video"
    article = "article"
    tool = "tool"
    guide = "guide"
    course = "course"
    other = "other"


class ResourceAccessModeEnum(str, Enum):
    free = "free"
    paid = "paid"
    restricted = "restricted"


class ResourceBase(SQLModel):
    title: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    resource_type: ResourceTypeEnum = ResourceTypeEnum.other
    provider_name: str | None = None
    provider_url: str | None = None
    external_url: str
    cover_image_url: str | None = None
    thumbnail_image: str | None = None
    estimated_time: int | None = None
    is_featured: bool = False
    is_live: bool = False
    access_mode: ResourceAccessModeEnum = ResourceAccessModeEnum.free


class ResourceTagBase(SQLModel):
    name: str


class ResourceTag(ResourceTagBase, table=True):
    __tablename__ = "resourcetag"
    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_resourcetag_org_name"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    tag_uuid: str = Field(index=True, unique=True)
    creation_date: str = ""
    update_date: str = ""


class ResourceTagCreate(ResourceTagBase):
    pass


class ResourceTagUpdate(SQLModel):
    name: str | None = None


class ResourceTagRead(ResourceTagBase):
    id: int
    org_id: int
    tag_uuid: str
    creation_date: str
    update_date: str


class ResourceTagLink(SQLModel, table=True):
    __tablename__ = "resourcetaglink"
    __table_args__ = (
        UniqueConstraint("resource_id", "tag_id", name="uq_resource_tag"),
    )

    id: int | None = Field(default=None, primary_key=True)
    resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True)
    )
    tag_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resourcetag.id", ondelete="CASCADE"), index=True)
    )
    creation_date: str = ""


class Resource(ResourceBase, table=True):
    __tablename__ = "resource"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    resource_uuid: str = Field(index=True, unique=True)
    created_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    creation_date: str = ""
    update_date: str = ""


class ResourceCreate(ResourceBase):
    tag_uuids: list[str] = Field(default_factory=list)


class ResourceUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    resource_type: ResourceTypeEnum | None = None
    provider_name: str | None = None
    provider_url: str | None = None
    external_url: str | None = None
    cover_image_url: str | None = None
    estimated_time: int | None = None
    is_featured: bool | None = None
    is_live: bool | None = None
    access_mode: ResourceAccessModeEnum | None = None
    tag_uuids: list[str] | None = None


class ResourceRead(ResourceBase):
    id: int
    org_id: int
    resource_uuid: str
    created_by_user_id: int | None = None
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    creation_date: str
    update_date: str
    tags: list[ResourceTagRead] = Field(default_factory=list)


class ResourceChannelBase(SQLModel):
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    thumbnail_image: str | None = None
    public: bool = True
    shared: bool = False
    is_starred: bool = False
    color: str | None = None


class ResourceChannel(ResourceChannelBase, table=True):
    __tablename__ = "resourcechannel"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    channel_uuid: str = Field(index=True, unique=True)
    creation_date: str = ""
    update_date: str = ""


class ResourceChannelCreate(ResourceChannelBase):
    pass


class ResourceChannelUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    public: bool | None = None
    shared: bool | None = None
    is_starred: bool | None = None
    color: str | None = None


class ResourceChannelRead(ResourceChannelBase):
    id: int
    org_id: int
    channel_uuid: str
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    creation_date: str
    update_date: str


class ResourceChannelResource(SQLModel, table=True):
    __tablename__ = "resourcechannelresource"
    __table_args__ = (
        UniqueConstraint("channel_id", "resource_id", name="uq_channel_resource"),
    )

    id: int | None = Field(default=None, primary_key=True)
    channel_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resourcechannel.id", ondelete="CASCADE"), index=True)
    )
    resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True)
    )
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class UserResourceChannelBase(SQLModel):
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    is_default: bool = False
    icon: str | None = None
    color: str | None = None
    icon_color: str | None = None


class UserResourceChannel(UserResourceChannelBase, table=True):
    __tablename__ = "userresourcechannel"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True)
    )
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    user_channel_uuid: str = Field(index=True, unique=True)
    creation_date: str = ""
    update_date: str = ""


class UserResourceChannelCreate(UserResourceChannelBase):
    pass


class UserResourceChannelRead(UserResourceChannelBase):
    id: int
    user_id: int
    org_id: int
    user_channel_uuid: str
    creation_date: str
    update_date: str


class UserSavedResourceBase(SQLModel):
    notes: str | None = Field(default=None, sa_column=Column(Text))
    outcome_text: str | None = Field(default=None, sa_column=Column(Text))
    outcome_link: str | None = None
    outcome_file: str | None = None
    last_opened_at: str | None = None
    completed_at: str | None = None
    open_count: int = 0


class UserSavedResource(UserSavedResourceBase, table=True):
    __tablename__ = "usersavedresource"
    __table_args__ = (
        UniqueConstraint("user_id", "resource_id", name="uq_user_saved_resource"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True)
    )
    resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True)
    )
    creation_date: str = ""
    update_date: str = ""


class UserSavedResourceUpdate(SQLModel):
    notes: str | None = None
    outcome_text: str | None = None
    outcome_link: str | None = None
    completed_at: str | None = None
    open_count_increment: int | None = None
    add_to_default_channel: bool = True
    user_channel_uuids: list[str] = []


class UserSavedResourceRead(UserSavedResourceBase):
    id: int
    user_id: int
    resource_id: int
    creation_date: str
    update_date: str


class UserSavedResourceChannel(SQLModel, table=True):
    __tablename__ = "usersavedresourcechannel"
    __table_args__ = (
        UniqueConstraint("saved_resource_id", "user_channel_id", name="uq_saved_resource_channel"),
    )

    id: int | None = Field(default=None, primary_key=True)
    saved_resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("usersavedresource.id", ondelete="CASCADE"), index=True)
    )
    user_channel_id: int = Field(
        sa_column=Column(Integer, ForeignKey("userresourcechannel.id", ondelete="CASCADE"), index=True)
    )
    creation_date: str = ""


class ResourceCommentBase(SQLModel):
    content: str = Field(sa_column=Column(Text))


class ResourceComment(ResourceCommentBase, table=True):
    __tablename__ = "resourcecomment"

    id: int | None = Field(default=None, primary_key=True)
    resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True)
    )
    author_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True)
    )
    comment_uuid: str = Field(index=True, unique=True)
    is_locked: bool = Field(default=False, sa_column=Column(Boolean, default=False))
    creation_date: str = ""
    update_date: str = ""


class ResourceCommentCreate(ResourceCommentBase):
    pass


class ResourceCommentUpdate(SQLModel):
    content: str | None = None


class ResourceCommentRead(ResourceCommentBase):
    id: int
    resource_id: int
    author_id: int
    comment_uuid: str
    is_locked: bool
    creation_date: str
    update_date: str


class ResourceCommentReadWithAuthor(ResourceCommentRead):
    author: dict | None = None

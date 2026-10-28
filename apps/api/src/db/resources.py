from enum import Enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
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


class ResourceSearchDocument(SQLModel, table=True):
    """Versioned searchable projection of a Resource and its tags."""

    __tablename__ = "resourcesearchdocument"
    __table_args__ = (
        UniqueConstraint("resource_id", name="uq_resourcesearchdocument_resource_id"),
        Index(
            "ix_resourcesearchdocument_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_where=text("embedding IS NOT NULL"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True)
    )
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    document_version: str = Field(max_length=50)
    content_hash: str = Field(max_length=64, index=True)
    title: str
    description: str = Field(default="", sa_column=Column(Text, nullable=False))
    provider: str = ""
    resource_type: str = ""
    tags_text: str = Field(default="", sa_column=Column(Text, nullable=False))
    search_text: str = Field(default="", sa_column=Column(Text, nullable=False))
    embedding: list[float] | None = Field(default=None, sa_column=Column(Vector(384), nullable=True))
    embedding_model: str | None = Field(default=None, max_length=100)
    embedding_version: str | None = Field(default=None, max_length=100)
    embedding_updated_at: str | None = None
    creation_date: str = ""
    update_date: str = ""


class ChannelAudience(str, Enum):
    """Who in the owning organization sees a channel. Listing it in the Library opens it to everyone."""

    org = "org"
    groups = "groups"
    staff = "staff"


class CommentRule(str, Enum):
    """Who may comment on the resources in a channel."""

    all = "all"
    staff = "staff"
    off = "off"


class ResourceChannelBase(SQLModel):
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    thumbnail_image: str | None = None
    color: str | None = None
    audience: ChannelAudience = Field(default=ChannelAudience.org, sa_column=Column(String, nullable=False, server_default="org"))
    comment_rule: CommentRule = Field(default=CommentRule.all, sa_column=Column(String, nullable=False, server_default="all"))
    # A comment with a web link waits for staff before anyone else sees it.
    hold_links: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))


class ResourceChannel(ResourceChannelBase, table=True):
    __tablename__ = "resourcechannel"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True)
    )
    channel_uuid: str = Field(index=True, unique=True)
    # In the Library: anyone can find, save and comment on it. Only resource partners list channels.
    listed: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false", index=True))
    listed_at: str | None = None
    creation_date: str = ""
    update_date: str = ""


class ResourceChannelCreate(ResourceChannelBase):
    pass


class ResourceChannelUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    color: str | None = None
    audience: ChannelAudience | None = None
    comment_rule: CommentRule | None = None
    hold_links: bool | None = None
    listed: bool | None = None


class ResourceChannelRead(ResourceChannelBase):
    id: int
    org_id: int
    channel_uuid: str
    listed: bool = False
    listed_at: str | None = None
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
    add_to_default_channel: bool = False
    user_channel_uuids: list[str] = Field(default_factory=list)


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


class ResourceNoteBlockBase(SQLModel):
    block_type: str
    media_asset_uuid: str | None = None
    content: str | None = Field(default=None, sa_column=Column(Text))
    url: str | None = Field(default=None, sa_column=Column(Text))
    title: str | None = None
    description: str | None = Field(default=None, sa_column=Column(Text))
    preview_image_url: str | None = Field(default=None, sa_column=Column(Text))
    filename: str | None = None
    original_filename: str | None = None
    mime_type: str | None = None
    storage_directory: str | None = None
    sort_order: int = 0


class ResourceNoteBlock(ResourceNoteBlockBase, table=True):
    __tablename__ = "resourcenoteblock"
    __table_args__ = (
        CheckConstraint(
            "block_type IN ('text', 'link', 'image', 'file')",
            name="ck_resource_note_block_type",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True)
    )
    resource_id: int = Field(
        sa_column=Column(Integer, ForeignKey("resource.id", ondelete="CASCADE"), index=True)
    )
    note_uuid: str = Field(index=True, unique=True)
    creation_date: str = ""
    update_date: str = ""


class ResourceNoteBlockCreate(SQLModel):
    block_type: str
    media_asset_uuid: str | None = None
    content: str | None = None
    url: str | None = None
    title: str | None = None
    description: str | None = None
    preview_image_url: str | None = None
    sort_order: int | None = None


class ResourceNoteBlockUpdate(SQLModel):
    content: str | None = None
    url: str | None = None
    title: str | None = None
    description: str | None = None
    preview_image_url: str | None = None
    sort_order: int | None = None


class ResourceNoteBlockRead(ResourceNoteBlockBase):
    id: int
    user_id: int
    resource_id: int
    note_uuid: str
    creation_date: str
    update_date: str


class CommentStatus(str, Enum):
    """Live comments are public. Held ones wait for the owning org's staff; hidden ones only staff see."""

    live = "live"
    held = "held"
    hidden = "hidden"


class ResourceCommentBase(SQLModel):
    content: str = Field(sa_column=Column(Text))
    rating: int | None = Field(default=None, ge=1, le=5)


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
    status: CommentStatus = Field(default=CommentStatus.live, sa_column=Column(String, nullable=False, server_default="live", index=True))
    creation_date: str = ""
    update_date: str = ""


class ResourceCommentCreate(ResourceCommentBase):
    pass


class ResourceCommentUpdate(SQLModel):
    content: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)


class ResourceReviewCreate(SQLModel):
    content: str = Field(sa_column=Column(Text))
    rating: int = Field(ge=1, le=5)


class ResourceCommentRead(ResourceCommentBase):
    id: int
    resource_id: int
    author_id: int
    comment_uuid: str
    status: CommentStatus
    creation_date: str
    update_date: str


class ResourceCommentReadWithAuthor(ResourceCommentRead):
    author: dict | None = None

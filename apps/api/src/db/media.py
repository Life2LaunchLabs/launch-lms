from enum import Enum

from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class MediaOwnerType(str, Enum):
    user = "user"
    org = "org"


class MediaSourceType(str, Enum):
    upload = "upload"
    link = "link"


class MediaType(str, Enum):
    image = "image"
    video = "video"


class MediaAssetBase(SQLModel):
    owner_type: MediaOwnerType
    source_type: MediaSourceType
    media_type: MediaType
    title: str = ""
    url: str = Field(sa_column=Column(Text, nullable=False))
    thumbnail_url: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    folder: str | None = None


class MediaAsset(MediaAssetBase, table=True):
    __tablename__ = "mediaasset"

    id: int | None = Field(default=None, primary_key=True)
    asset_uuid: str = Field(index=True, unique=True)
    owner_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    owner_org_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    created_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    creation_date: str = ""
    update_date: str = ""


class MediaFolder(SQLModel, table=True):
    __tablename__ = "mediafolder"

    id: int | None = Field(default=None, primary_key=True)
    folder_uuid: str = Field(index=True, unique=True)
    owner_type: MediaOwnerType
    owner_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    owner_org_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    created_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    name: str
    creation_date: str = ""
    update_date: str = ""


class MediaAssetRead(MediaAssetBase):
    id: int
    asset_uuid: str
    owner_user_id: int | None = None
    owner_org_id: int | None = None
    created_by_user_id: int | None = None
    creation_date: str
    update_date: str


class MediaFolderRead(SQLModel):
    id: int
    folder_uuid: str
    owner_type: MediaOwnerType
    owner_user_id: int | None = None
    owner_org_id: int | None = None
    created_by_user_id: int | None = None
    name: str
    creation_date: str
    update_date: str


class MediaLinkCreate(SQLModel):
    owner_type: MediaOwnerType
    owner_id: int
    media_type: MediaType
    url: str
    title: str | None = None
    folder: str | None = None


class MediaFolderCreate(SQLModel):
    owner_type: MediaOwnerType
    owner_id: int
    name: str


class MediaFolderUpdate(SQLModel):
    name: str


class MediaAssetFolderUpdate(SQLModel):
    folder: str | None = None

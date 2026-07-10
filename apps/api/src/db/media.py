from enum import Enum
from typing import Optional

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
    thumbnail_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    folder: Optional[str] = None


class MediaAsset(MediaAssetBase, table=True):
    __tablename__ = "mediaasset"

    id: Optional[int] = Field(default=None, primary_key=True)
    asset_uuid: str = Field(index=True, unique=True)
    owner_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    owner_org_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    created_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    creation_date: str = ""
    update_date: str = ""


class MediaFolder(SQLModel, table=True):
    __tablename__ = "mediafolder"

    id: Optional[int] = Field(default=None, primary_key=True)
    folder_uuid: str = Field(index=True, unique=True)
    owner_type: MediaOwnerType
    owner_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    owner_org_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True, nullable=True),
    )
    created_by_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), index=True, nullable=True),
    )
    name: str
    creation_date: str = ""
    update_date: str = ""


class MediaAssetRead(MediaAssetBase):
    id: int
    asset_uuid: str
    owner_user_id: Optional[int] = None
    owner_org_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    creation_date: str
    update_date: str


class MediaFolderRead(SQLModel):
    id: int
    folder_uuid: str
    owner_type: MediaOwnerType
    owner_user_id: Optional[int] = None
    owner_org_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    name: str
    creation_date: str
    update_date: str


class MediaLinkCreate(SQLModel):
    owner_type: MediaOwnerType
    owner_id: int
    media_type: MediaType
    url: str
    title: Optional[str] = None
    folder: Optional[str] = None


class MediaFolderCreate(SQLModel):
    owner_type: MediaOwnerType
    owner_id: int
    name: str


class MediaFolderUpdate(SQLModel):
    name: str


class MediaAssetFolderUpdate(SQLModel):
    folder: Optional[str] = None

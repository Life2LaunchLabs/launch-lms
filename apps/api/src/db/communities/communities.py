
from sqlalchemy import JSON, Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class CommunityBase(SQLModel):
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    public: bool = True
    shared: bool = False
    thumbnail_image: str | None = Field(default="")


class Community(CommunityBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    course_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="SET NULL"))
    )
    community_uuid: str = ""
    moderation_words: list[str] = Field(default=[], sa_column=Column(JSON, default=[]))
    creation_date: str = ""
    update_date: str = ""


class CommunityCreate(CommunityBase):
    org_id: int = Field(default=None, foreign_key="organization.id")
    course_id: int | None = Field(default=None, foreign_key="course.id")


class CommunityUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    public: bool | None = None
    shared: bool | None = None
    thumbnail_image: str | None = None
    moderation_words: list[str] | None = None


class CommunityRead(CommunityBase):
    id: int
    org_id: int = Field(default=None, foreign_key="organization.id")
    course_id: int | None = Field(default=None, foreign_key="course.id")
    community_uuid: str
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    moderation_words: list[str] = []
    creation_date: str
    update_date: str


from sqlalchemy import BigInteger, Column, ForeignKey
from sqlmodel import Field, SQLModel


class CollectionBase(SQLModel):
    name: str
    public: bool
    shared: bool = False
    hidden: bool = False
    protected: bool = False
    system_type: str | None = None
    description: str | None = ""
    

class Collection(CollectionBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    collection_uuid: str = ""
    creation_date: str = ""
    update_date: str = ""
    thumbnail_image: str | None = None


class CollectionCreate(CollectionBase):
    courses: list[int]
    org_id: int = Field(default=None, foreign_key="organization.id")



class CollectionUpdate(SQLModel):
    courses: list | None = None
    name: str | None = None
    public: bool | None = None
    shared: bool | None = None
    thumbnail_image: str | None = None
    hidden: bool | None = None
    protected: bool | None = None
    system_type: str | None = None
    description: str | None = None


class CollectionRead(CollectionBase):
    id: int
    courses: list
    collection_uuid: str
    owner_org_id: int | None = None
    owner_org_uuid: str | None = None
    owner_org_slug: str | None = None
    owner_org_name: str | None = None
    is_shared_from_other_org: bool = False
    creation_date: str
    update_date: str
    thumbnail_image: str | None = None


class CourseCollectionAssignment(SQLModel):
    collection_uuid: str


class CourseCollectionRepairItem(SQLModel):
    course: dict
    collections: list[dict]

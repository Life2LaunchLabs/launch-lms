
from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class CourseUpdate(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    courseupdate_uuid: str
    title: str 
    content: str 
    course_id: int = Field(
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE"))
    )
    linked_activity_uuids: str | None = Field(default=None)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    creation_date: str
    update_date: str

class CourseUpdateCreate(SQLModel):
    title: str 
    content: str 
    linked_activity_uuids: str | None = Field(default=None)
    org_id: int

class CourseUpdateRead(SQLModel):
    id: int
    title: str 
    content: str 
    course_id: int
    courseupdate_uuid: str
    linked_activity_uuids: str | None = Field(default=None)
    org_id: int
    creation_date: str
    update_date: str

class CourseUpdateUpdate(SQLModel):
    title: str | None = None
    content: str | None = None
    linked_activity_uuids: str | None = Field(default=None)

    
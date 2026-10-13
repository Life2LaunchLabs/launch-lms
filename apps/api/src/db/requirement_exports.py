"""Input contract for teacher-selected requirement evidence exports."""

from pydantic import BaseModel, Field


class RequirementEvidenceExport(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=1000)
    assignment_uuid: str | None = None
    usergroup_id: int | None = None
    framework_uuid: str | None = None
    course_name: str = Field(default="", max_length=250)
    course_code: str = Field(default="", max_length=50)
    section: str = Field(default="", max_length=250)
    term: str = Field(default="", max_length=250)

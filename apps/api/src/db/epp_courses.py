"""A learner's high school course plan with one school, for their Education Plan and Profile.

Each row is one course in one grade: planned, in progress or completed. The learner or the school's staff
add them, or they come in from an Oregon CIS course planner export. Only staff can mark a course
school confirmed, and only a confirmed course is reported as "school confirmed". The transcript stays
the official record of credit.
"""

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, false
from sqlmodel import Field, SQLModel

# Oregon Diploma subject areas (OAR 581-022-2000) and the credits each needs, from the class of 2027.
# Extra credits in one area count as electives.
SUBJECTS: dict[str, tuple[str, float]] = {
    "language_arts": ("Language Arts", 4),
    "mathematics": ("Mathematics (Algebra 1 and above)", 3),
    "science": ("Science", 3),
    "social_sciences": ("Social Sciences", 3),
    "wl_arts_cte": ("World Languages, Arts or CTE", 3),
    "health": ("Health", 1),
    "physical_education": ("Physical Education", 1),
    "personal_finance": ("Personal Financial Education", 0.5),
    "career_path_skills": ("Higher Education and Career Path Skills", 0.5),
    "electives": ("Electives", 5),
}
COURSE_STATUSES = ("planned", "in_progress", "completed")
# student: the learner entered it. staff: school staff did. cis: imported from an Oregon CIS course planner.
COURSE_SOURCES = ("student", "staff", "cis")
GRADES = (9, 10, 11, 12)


class EppCourse(SQLModel, table=True):
    __tablename__ = "eppcourse"

    id: int | None = Field(default=None, primary_key=True)
    course_uuid: str = Field(sa_column=Column(String, nullable=False, unique=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    # The learner. The frozen report (slice 5) keeps its own copy, so this can go with the account.
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    grade: int = Field(sa_column=Column(Integer, nullable=False))
    school_year: str | None = None
    subject: str = Field(sa_column=Column(String, nullable=False))
    title: str = Field(sa_column=Column(String, nullable=False))
    term: str | None = None
    credits: float = Field(default=0, sa_column=Column(Float, nullable=False, server_default="0"))
    status: str = Field(default="planned", sa_column=Column(String, nullable=False, server_default="planned"))
    course_code: str | None = None
    dual_credit: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=false()))
    dual_credit_school: str | None = None
    dual_credit_credits: float | None = None
    note: str | None = None
    source: str = Field(default="student", sa_column=Column(String, nullable=False, server_default="student"))
    added_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    confirmed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    confirmed_at: str | None = None
    creation_date: str = ""
    update_date: str = ""


class EppCourseWrite(BaseModel):
    """A new course, or the fields to change on one. Unset fields stay as they are."""

    grade: int | None = PydanticField(default=None, ge=9, le=12)
    school_year: str | None = PydanticField(default=None, max_length=20)
    subject: str | None = None
    title: str | None = PydanticField(default=None, max_length=200)
    term: str | None = PydanticField(default=None, max_length=40)
    credits: float | None = PydanticField(default=None, ge=0, le=4)
    status: str | None = None
    course_code: str | None = PydanticField(default=None, max_length=40)
    dual_credit: bool | None = None
    dual_credit_school: str | None = PydanticField(default=None, max_length=200)
    dual_credit_credits: float | None = PydanticField(default=None, ge=0, le=20)
    note: str | None = PydanticField(default=None, max_length=500)


class EppCourseConfirm(BaseModel):
    confirmed: bool = True

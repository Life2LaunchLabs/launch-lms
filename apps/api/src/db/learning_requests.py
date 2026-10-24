"""Request bodies for playing activities."""

from sqlmodel import Field, SQLModel


class LearningPageComplete(SQLModel):
    run_uuid: str
    page_uuid: str
    data: dict = Field(default_factory=dict)


class LearningResponseSubmit(SQLModel):
    run_uuid: str
    page_uuid: str
    answer: dict = Field(default_factory=dict)
    button: str | None = None


class LearningResponseGrade(SQLModel):
    score: float
    feedback: str | None = ""
    question_scores: dict[str, float] = Field(default_factory=dict)
    question_feedback: dict[str, str] = Field(default_factory=dict)


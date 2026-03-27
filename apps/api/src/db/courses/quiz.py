from datetime import datetime
from typing import Optional
from sqlalchemy import JSON, Column, ForeignKey, Integer
from sqlmodel import Field, SQLModel


class QuizAttempt(SQLModel, table=True):
    """Records one attempt of a quiz by a user."""
    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_uuid: str = Field(default="", index=True)
    activity_id: int = Field(
        sa_column=Column(Integer, ForeignKey("activity.id", ondelete="CASCADE"), index=True)
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True)
    )
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    course_id: int = Field(
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE"))
    )
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)
    creation_date: str = ""
    update_date: str = ""


class QuizAnswer(SQLModel, table=True):
    """One answer within an attempt (one row per question answered)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_id: int = Field(
        sa_column=Column(Integer, ForeignKey("quizattempt.id", ondelete="CASCADE"), index=True)
    )
    # UUID matching the question_uuid in the Tiptap node attrs
    question_uuid: str = Field(default="", index=True)
    # {"type": "select", "option_uuid": "o_abc"} or {"type": "info"}
    answer_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""


class QuizResult(SQLModel, table=True):
    """Computed result for a completed attempt (1:1 with QuizAttempt)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_id: int = Field(
        sa_column=Column(Integer, ForeignKey("quizattempt.id", ondelete="CASCADE"), unique=True)
    )
    # Full computed bundle: {scores, vectors, category_sets_with_ranked_categories}
    result_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    computed_at: datetime = Field(default_factory=datetime.utcnow)
    creation_date: str = ""


# ── Pydantic read/write schemas ──────────────────────────────────────────────

class QuizAnswerInput(SQLModel):
    question_uuid: str
    answer_json: dict  # {"type": "select", "option_uuid": "..."} or {"type": "info"}


class QuizAttemptSubmit(SQLModel):
    answers: list[QuizAnswerInput]


class QuizAttemptRead(SQLModel):
    id: int
    attempt_uuid: str
    activity_id: int
    user_id: int
    started_at: datetime
    completed_at: Optional[datetime]


class QuizResultRead(SQLModel):
    id: int
    attempt_id: int
    attempt_uuid: str
    result_json: dict
    computed_at: datetime

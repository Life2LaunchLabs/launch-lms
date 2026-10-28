from datetime import datetime
from enum import Enum

from pydantic import BaseModel
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


class LearningPageType(str, Enum):
    VIDEO = "video"
    STANDARD = "standard"


class LearningVariableValueType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    OPTION = "option"
    MULTIPLE_CHOICE = "multiple_choice"
    IMAGE = "image"


class LearningRunStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class LearningActivityBase(SQLModel):
    """An interactive activity: the content of a goal template's activity step."""

    goal_template_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=True, index=True))
    frozen_from_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="SET NULL"), nullable=True, index=True))
    frozen_hash: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    icon: str | None = None
    settings: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningActivity(LearningActivityBase, table=True):
    __table_args__ = (UniqueConstraint("activity_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    activity_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningActivityUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    icon: str | None = None
    settings: dict | None = None


class LearningActivityRead(LearningActivityBase):
    id: int
    activity_uuid: str
    creation_date: str
    update_date: str
    pages: list["LearningPageRead"] = Field(default_factory=list)
    # The order editors work on: the stored sequence, else the flow converted, else the pages in order.
    sequence: dict | None = None
    sequence_flags: list[dict] = Field(default_factory=list)


class LearningPageBase(SQLModel):
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    page_type: LearningPageType = Field(sa_column=Column(String, nullable=False))
    title: str
    order: int = 1
    required: bool = True
    content: dict = Field(default_factory=dict, sa_column=Column(JSON))
    design: dict = Field(default_factory=dict, sa_column=Column(JSON))
    scoring: dict = Field(default_factory=dict, sa_column=Column(JSON))
    completion: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningPage(LearningPageBase, table=True):
    __table_args__ = (UniqueConstraint("page_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    page_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningPageCreate(SQLModel):
    activity_uuid: str
    page_type: LearningPageType
    title: str
    required: bool = True
    content: dict = Field(default_factory=dict)
    design: dict = Field(default_factory=dict)


class LearningPageUpdate(SQLModel):
    page_type: LearningPageType | None = None
    title: str | None = None
    order: int | None = None
    required: bool | None = None
    content: dict | None = None
    design: dict | None = None


class LearningPageRead(LearningPageBase):
    id: int
    page_uuid: str
    creation_date: str
    update_date: str


class LearningVariableBase(SQLModel):
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    key: str
    label: str
    description: str | None = ""
    value_type: LearningVariableValueType = LearningVariableValueType.TEXT
    options: list = Field(default_factory=list, sa_column=Column(JSON))


class LearningVariable(LearningVariableBase, table=True):
    __table_args__ = (UniqueConstraint("variable_uuid"), UniqueConstraint("org_id", "key"))

    id: int | None = Field(default=None, primary_key=True)
    variable_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningVariableCreate(SQLModel):
    org_id: int
    key: str
    label: str
    description: str | None = ""
    value_type: LearningVariableValueType = LearningVariableValueType.TEXT
    options: list = Field(default_factory=list)


class LearningVariableUpdate(SQLModel):
    label: str | None = None
    description: str | None = None
    value_type: LearningVariableValueType | None = None
    options: list | None = None


class LearningVariableRead(LearningVariableBase):
    id: int
    variable_uuid: str
    creation_date: str
    update_date: str


class LearningRun(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    run_uuid: str = Field(default="", index=True)
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="CASCADE"), nullable=False, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    issuing_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))  # the organization that issued the goal
    goal_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal.id", ondelete="CASCADE"), nullable=True, index=True))
    goal_step_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("goal_step.id", ondelete="CASCADE"), nullable=True, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    status: LearningRunStatus = LearningRunStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningPageProgress(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_id", "page_id"),)

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    page_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpage.id", ondelete="CASCADE"), index=True))
    complete: bool = False
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningResponseAttempt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    attempt_uuid: str = Field(default="", index=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    page_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpage.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    answer: dict = Field(default_factory=dict, sa_column=Column(JSON))
    is_correct: bool | None = None
    score: float | None = None
    feedback_key: str | None = None
    submitted_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    graded_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    result: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningRunRead(BaseModel):
    id: int
    run_uuid: str
    activity_id: int
    org_id: int
    issuing_org_id: int | None = None
    goal_id: int | None = None
    goal_step_id: int | None = None
    user_id: int
    status: LearningRunStatus
    started_at: datetime
    completed_at: datetime | None = None
    page_progress: list[dict] = []
    attempts: list[dict] = []
    navigation: dict | None = None
    render_context: dict = Field(default_factory=dict)


LearningActivityRead.model_rebuild()

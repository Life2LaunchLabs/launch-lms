from datetime import datetime
from enum import Enum
from typing import Optional

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


class LearningRunStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class LearningAwardSource(str, Enum):
    PATH_COMPLETION = "path_completion"
    DIRECT_CONFERRAL = "direct_conferral"


class LearningBadgeBase(SQLModel):
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    collection_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("badgecollection.id", ondelete="SET NULL"), nullable=True, index=True))
    name: str
    description: Optional[str] = ""
    about: Optional[str] = ""
    criteria: Optional[str] = ""
    thumbnail_image: Optional[str] = ""
    public: bool = True
    published: bool = False
    protected: bool = False
    system_type: Optional[str] = None
    direct_conferral_enabled: bool = True
    badge_metadata: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON))


class LearningBadge(LearningBadgeBase, table=True):
    __table_args__ = (UniqueConstraint("badge_uuid"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    badge_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningBadgeCreate(SQLModel):
    org_id: int
    collection_id: Optional[int] = None
    name: str
    description: Optional[str] = ""
    about: Optional[str] = ""
    criteria: Optional[str] = ""
    thumbnail_image: Optional[str] = ""
    public: bool = True
    published: bool = False
    protected: bool = False
    system_type: Optional[str] = None
    direct_conferral_enabled: bool = True
    badge_metadata: dict = Field(default_factory=dict)


class LearningBadgeUpdate(SQLModel):
    collection_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    about: Optional[str] = None
    criteria: Optional[str] = None
    thumbnail_image: Optional[str] = None
    public: Optional[bool] = None
    published: Optional[bool] = None
    protected: Optional[bool] = None
    system_type: Optional[str] = None
    direct_conferral_enabled: Optional[bool] = None
    badge_metadata: Optional[dict] = None


class LearningBadgeRead(LearningBadgeBase):
    id: int
    badge_uuid: str
    creation_date: str
    update_date: str


class BadgeCollectionBase(SQLModel):
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    name: str
    description: Optional[str] = ""
    thumbnail_image: Optional[str] = ""
    public: bool = True
    hidden: bool = False
    protected: bool = False
    system_type: Optional[str] = None


class BadgeCollection(BadgeCollectionBase, table=True):
    __table_args__ = (UniqueConstraint("collection_uuid"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    collection_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class BadgeCollectionCreate(SQLModel):
    org_id: int
    name: str
    description: Optional[str] = ""
    thumbnail_image: Optional[str] = ""
    public: bool = True
    hidden: bool = False
    protected: bool = False
    system_type: Optional[str] = None


class BadgeCollectionUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    thumbnail_image: Optional[str] = None
    public: Optional[bool] = None
    hidden: Optional[bool] = None
    protected: Optional[bool] = None
    system_type: Optional[str] = None


class BadgeCollectionRead(BadgeCollectionBase):
    id: int
    collection_uuid: str
    creation_date: str
    update_date: str
    badges: list[LearningBadgeRead] = Field(default_factory=list)


class LearningPath(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("badge_id"), UniqueConstraint("path_uuid"))

    id: Optional[int] = Field(default=None, primary_key=True)
    path_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: Optional[str] = ""
    description: Optional[str] = ""
    creation_date: str = ""
    update_date: str = ""


class LearningActivityBase(SQLModel):
    path_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpath.id", ondelete="CASCADE"), index=True))
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: Optional[str] = ""
    thumbnail_image: Optional[str] = ""
    icon: Optional[str] = None
    order: int = 1
    required: bool = True
    published: bool = False
    settings: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningActivity(LearningActivityBase, table=True):
    __table_args__ = (UniqueConstraint("activity_uuid"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    activity_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningActivityCreate(SQLModel):
    badge_uuid: str
    title: str
    description: Optional[str] = ""
    thumbnail_image: Optional[str] = ""
    icon: Optional[str] = None
    required: bool = True
    published: bool = False
    settings: dict = Field(default_factory=dict)


class LearningActivityUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_image: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = None
    required: Optional[bool] = None
    published: Optional[bool] = None
    settings: Optional[dict] = None


class LearningActivityRead(LearningActivityBase):
    id: int
    activity_uuid: str
    creation_date: str
    update_date: str
    pages: list["LearningPageRead"] = Field(default_factory=list)


class LearningPageBase(SQLModel):
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="CASCADE"), index=True))
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
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

    id: Optional[int] = Field(default=None, primary_key=True)
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
    scoring: dict = Field(default_factory=dict)
    completion: dict = Field(default_factory=dict)


class LearningPageUpdate(SQLModel):
    page_type: Optional[LearningPageType] = None
    title: Optional[str] = None
    order: Optional[int] = None
    required: Optional[bool] = None
    content: Optional[dict] = None
    design: Optional[dict] = None
    scoring: Optional[dict] = None
    completion: Optional[dict] = None


class LearningPageRead(LearningPageBase):
    id: int
    page_uuid: str
    creation_date: str
    update_date: str


class LearningVariableBase(SQLModel):
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    key: str
    label: str
    description: Optional[str] = ""
    value_type: LearningVariableValueType = LearningVariableValueType.TEXT
    options: list = Field(default_factory=list, sa_column=Column(JSON))


class LearningVariable(LearningVariableBase, table=True):
    __table_args__ = (UniqueConstraint("variable_uuid"), UniqueConstraint("org_id", "key"))

    id: Optional[int] = Field(default=None, primary_key=True)
    variable_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningVariableCreate(SQLModel):
    org_id: int
    key: str
    label: str
    description: Optional[str] = ""
    value_type: LearningVariableValueType = LearningVariableValueType.TEXT
    options: list = Field(default_factory=list)


class LearningVariableUpdate(SQLModel):
    label: Optional[str] = None
    description: Optional[str] = None
    value_type: Optional[LearningVariableValueType] = None
    options: Optional[list] = None


class LearningVariableRead(LearningVariableBase):
    id: int
    variable_uuid: str
    creation_date: str
    update_date: str


class LearningRun(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_uuid"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    run_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    path_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpath.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    guest_session_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True, index=True))
    status: LearningRunStatus = LearningRunStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    completed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningActivityRun(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_id", "activity_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="CASCADE"), index=True))
    status: LearningRunStatus = LearningRunStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    completed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningPageProgress(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_id", "page_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    activity_run_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("learningactivityrun.id", ondelete="CASCADE"), nullable=True, index=True))
    page_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpage.id", ondelete="CASCADE"), index=True))
    complete: bool = False
    completed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningResponseAttempt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    attempt_uuid: str = Field(default="", index=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    page_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpage.id", ondelete="CASCADE"), index=True))
    user_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    guest_session_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True, index=True))
    answer: dict = Field(default_factory=dict, sa_column=Column(JSON))
    is_correct: Optional[bool] = None
    score: Optional[float] = None
    feedback_key: Optional[str] = None
    submitted_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    graded_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    result: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningBadgeAward(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("award_uuid"), UniqueConstraint("badge_id", "user_id"))

    id: Optional[int] = Field(default=None, primary_key=True)
    award_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    run_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="SET NULL"), nullable=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    source: LearningAwardSource = LearningAwardSource.PATH_COMPLETION
    conferred_by_user_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    issued_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    evidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningRunRead(BaseModel):
    id: int
    run_uuid: str
    badge_id: int
    path_id: int
    org_id: int
    user_id: Optional[int] = None
    guest_session_id: Optional[int] = None
    status: LearningRunStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    page_progress: list[dict] = []
    attempts: list[dict] = []
    award: Optional[dict] = None


class LearningPathRead(BaseModel):
    path: dict
    badge: LearningBadgeRead
    activities: list[LearningActivityRead]
    run: Optional[LearningRunRead] = None


class LearningPageComplete(SQLModel):
    run_uuid: str
    page_uuid: str
    data: dict = Field(default_factory=dict)


class LearningResponseSubmit(SQLModel):
    run_uuid: str
    page_uuid: str
    answer: dict = Field(default_factory=dict)


class LearningResponseGrade(SQLModel):
    score: float
    feedback: Optional[str] = ""


class LearningAwardCreate(SQLModel):
    badge_uuid: str
    user_id: int
    evidence: dict = Field(default_factory=dict)


LearningActivityRead.model_rebuild()
LearningPathRead.model_rebuild()

from datetime import datetime
from enum import Enum

from pydantic import BaseModel
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
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


class LearningBadgeStatus(str, Enum):
    DRAFT = "draft"
    COMING_SOON = "coming_soon"
    PUBLISHED = "published"


class LearningBadgeVersionState(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class LearningAwardSource(str, Enum):
    PATH_COMPLETION = "path_completion"
    DIRECT_CONFERRAL = "direct_conferral"
    CHECKLIST_COMPLETION = "checklist_completion"


class BadgeIssuerAuthorizationStatus(str, Enum):
    QUEUED = "queued"
    REQUESTED = "requested"
    INVITED = "invited"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"
    PACKAGE_DENIED = "package_denied"


class BadgeIssuerLearnerLinkStatus(str, Enum):
    REQUESTED = "requested"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    ENDED = "ended"
    COMPLETED = "completed"


class LearningBadgeBase(SQLModel):
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    collection_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("badgecollection.id", ondelete="SET NULL"), nullable=True, index=True))
    name: str
    description: str | None = ""
    about: str | None = ""
    criteria: str | None = ""
    thumbnail_image: str | None = ""
    public: bool = True
    status: LearningBadgeStatus = Field(default=LearningBadgeStatus.DRAFT, sa_column=Column(String, nullable=False))
    protected: bool = False
    system_type: str | None = None
    direct_conferral_enabled: bool = True
    marketplace_listed: bool = False
    badge_metadata: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    deleted_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True, index=True))



class LearningBadge(LearningBadgeBase, table=True):
    __table_args__ = (UniqueConstraint("badge_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    badge_uuid: str = Field(default="", index=True)
    active_version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="SET NULL"), nullable=True, index=True))
    creation_date: str = ""
    update_date: str = ""


class LearningBadgeCreate(SQLModel):
    org_id: int
    collection_id: int | None = None
    name: str
    description: str | None = ""
    about: str | None = ""
    criteria: str | None = ""
    thumbnail_image: str | None = ""
    public: bool = True
    status: LearningBadgeStatus = LearningBadgeStatus.DRAFT
    protected: bool = False
    system_type: str | None = None
    direct_conferral_enabled: bool = True
    marketplace_listed: bool = False
    badge_metadata: dict = Field(default_factory=dict)


class OpenBadgeImport(SQLModel):
    org_id: int
    collection_id: int | None = None
    badge: dict


class LearningBadgeUpdate(SQLModel):
    collection_id: int | None = None
    name: str | None = None
    description: str | None = None
    about: str | None = None
    criteria: str | None = None
    thumbnail_image: str | None = None
    public: bool | None = None
    status: LearningBadgeStatus | None = None
    protected: bool | None = None
    system_type: str | None = None
    direct_conferral_enabled: bool | None = None
    marketplace_listed: bool | None = None
    badge_metadata: dict | None = None


class LearningBadgeRead(LearningBadgeBase):
    id: int
    badge_uuid: str
    creation_date: str
    update_date: str
    active_version_id: int | None = None
    selected_version: dict | None = None
    versions: list[dict] = Field(default_factory=list)
    can_edit: bool | None = None
    access_type: str | None = None


class LearningBadgeVersion(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("version_uuid"),
        UniqueConstraint("badge_id", "semantic_version"),
    )

    id: int | None = Field(default=None, primary_key=True)
    version_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    state: LearningBadgeVersionState = Field(default=LearningBadgeVersionState.DRAFT, sa_column=Column(String, nullable=False, index=True))
    semantic_version: str | None = Field(default=None, nullable=True)
    title: str = "Untitled draft"
    description: str | None = ""
    based_on_version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="SET NULL"), nullable=True, index=True))
    definition: dict = Field(default_factory=dict, sa_column=Column(JSON))
    revision: int = 1
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    published_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    published_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class LearningBadgeVersionCreate(SQLModel):
    based_on_version_uuid: str | None = None
    title: str
    description: str | None = ""


class LearningBadgeVersionUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    expected_revision: int | None = None


class LearningBadgeVersionPublish(SQLModel):
    semantic_version: str
    title: str
    description: str | None = ""
    set_active: bool = True
    expected_revision: int | None = None


class LearningBadgeNotificationSignup(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("badge_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    signup_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    creation_date: str = ""
    update_date: str = ""


class BadgeCollectionBase(SQLModel):
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    name: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    public: bool = True
    hidden: bool = False
    protected: bool = False
    system_type: str | None = None
    deleted_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True, index=True))



class BadgeCollection(BadgeCollectionBase, table=True):
    __table_args__ = (UniqueConstraint("collection_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    collection_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class BadgeCollectionCreate(SQLModel):
    org_id: int
    name: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    public: bool = True
    hidden: bool = False
    protected: bool = False
    system_type: str | None = None


class BadgeCollectionUpdate(SQLModel):
    name: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    public: bool | None = None
    hidden: bool | None = None
    protected: bool | None = None
    system_type: str | None = None


class BadgeCollectionRead(BadgeCollectionBase):
    id: int
    collection_uuid: str
    creation_date: str
    update_date: str
    badges: list[LearningBadgeRead] = Field(default_factory=list)
    can_edit: bool | None = None
    access_type: str | None = None
    creator_org: dict | None = None


class BadgeIssuerAuthorization(SQLModel, table=True):
    """Grants an issuing org the right to deliver, grade, and confer a creator org's badge."""

    __table_args__ = (UniqueConstraint("badge_id", "issuer_org_id"), UniqueConstraint("authorization_uuid"))

    id: int | None = Field(default=None, primary_key=True)
    authorization_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    creator_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    issuer_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    status: BadgeIssuerAuthorizationStatus = Field(default=BadgeIssuerAuthorizationStatus.REQUESTED, sa_column=Column(String, nullable=False))
    # When true the issuer accepts submissions from any learner; when false only
    # learners with a BadgeIssuerLearnerLink can select this issuer.
    open_to_all: bool = False
    message: str | None = ""
    requested_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class BadgeIssuerLearnerLink(SQLModel, table=True):
    """Issuer's declaration that it is willing to support a specific learner on a specific badge."""

    __table_args__ = (UniqueConstraint("authorization_id", "user_id"), UniqueConstraint("link_uuid"))

    id: int | None = Field(default=None, primary_key=True)
    link_uuid: str = Field(default="", index=True)
    authorization_id: int = Field(sa_column=Column(Integer, ForeignKey("badgeissuerauthorization.id", ondelete="CASCADE"), index=True))
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    issuer_org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    status: BadgeIssuerLearnerLinkStatus = Field(default=BadgeIssuerLearnerLinkStatus.ACCEPTED, sa_column=Column(String, nullable=False, index=True))
    requested_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    created_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    decided_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    staff_user_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    message: str | None = ""
    note: str | None = ""
    end_reason: str | None = None
    ended_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    ended_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    creation_date: str = ""
    update_date: str = ""


class BadgeIssuerAuthorizationRead(BaseModel):
    id: int
    authorization_uuid: str
    badge_id: int
    creator_org_id: int
    issuer_org_id: int
    status: BadgeIssuerAuthorizationStatus
    open_to_all: bool
    message: str | None = ""
    requested_by_user_id: int | None = None
    decided_by_user_id: int | None = None
    decided_at: datetime | None = None
    creation_date: str
    update_date: str
    badge: dict | None = None
    creator_org: dict | None = None
    issuer_org: dict | None = None


class IssuerAuthorizationRequest(SQLModel):
    badge_uuid: str
    issuer_org_id: int
    message: str | None = ""


class IssuerAuthorizationInvite(SQLModel):
    badge_uuid: str
    issuer_org_slug: str
    message: str | None = ""


class IssuerAuthorizationUpdate(SQLModel):
    open_to_all: bool | None = None


class IssuerLearnerLinkCreate(SQLModel):
    badge_uuid: str
    issuer_org_id: int
    user_id: int
    note: str | None = ""


class IssuerLearnerRequestCreate(SQLModel):
    badge_uuid: str
    issuer_org_id: int
    message: str | None = ""


class IssuerLearnerRequestDecision(SQLModel):
    staff_user_ids: list[int] = Field(default_factory=list)
    note: str | None = ""


class LearningPath(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("path_uuid"), UniqueConstraint("badge_id", "version_id"))

    id: int | None = Field(default=None, primary_key=True)
    path_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str | None = ""
    description: str | None = ""
    creation_date: str = ""
    update_date: str = ""


class LearningActivityBase(SQLModel):
    path_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpath.id", ondelete="CASCADE"), index=True))
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    icon: str | None = None
    order: int = 1
    required: bool = True
    published: bool = False
    settings: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningActivity(LearningActivityBase, table=True):
    __table_args__ = (UniqueConstraint("activity_uuid"),)

    id: int | None = Field(default=None, primary_key=True)
    activity_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class LearningActivityCreate(SQLModel):
    badge_uuid: str
    version_uuid: str | None = None
    title: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    icon: str | None = None
    required: bool = True
    published: bool = False
    settings: dict = Field(default_factory=dict)


class LearningActivityImportPage(SQLModel):
    title: str
    required: bool = True
    content: dict = Field(default_factory=dict)
    design: dict = Field(default_factory=dict)
    scoring: dict = Field(default_factory=dict)
    completion: dict = Field(default_factory=dict)


class LearningActivityImport(SQLModel):
    badge_uuid: str
    version_uuid: str | None = None
    title: str
    description: str | None = ""
    settings: dict = Field(default_factory=dict)
    pages: list[LearningActivityImportPage]


class LearningActivityUpdate(SQLModel):
    title: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    icon: str | None = None
    order: int | None = None
    required: bool | None = None
    published: bool | None = None
    settings: dict | None = None


class LearningActivityRead(LearningActivityBase):
    id: int
    activity_uuid: str
    creation_date: str
    update_date: str
    pages: list["LearningPageRead"] = Field(default_factory=list)


class LearningPageBase(SQLModel):
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="CASCADE"), index=True))
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True, index=True))
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
    scoring: dict = Field(default_factory=dict)
    completion: dict = Field(default_factory=dict)


class LearningPageUpdate(SQLModel):
    page_type: LearningPageType | None = None
    title: str | None = None
    order: int | None = None
    required: bool | None = None
    content: dict | None = None
    design: dict | None = None
    scoring: dict | None = None
    completion: dict | None = None


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
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    path_id: int = Field(sa_column=Column(Integer, ForeignKey("learningpath.id", ondelete="CASCADE"), index=True))
    badge_version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="RESTRICT"), nullable=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    # Org the learner is earning the badge under; None means the badge's creator org.
    issuing_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))
    program_assignment_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("programassignment.id", ondelete="SET NULL"), nullable=True, index=True))
    program_participant_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("programparticipant.id", ondelete="SET NULL"), nullable=True, index=True))
    issuer_learner_link_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("badgeissuerlearnerlink.id", ondelete="SET NULL"), nullable=True, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    guest_session_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True, index=True))
    status: LearningRunStatus = LearningRunStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningActivityRun(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_id", "activity_id"),)

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("learningactivity.id", ondelete="CASCADE"), index=True))
    status: LearningRunStatus = LearningRunStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningPageProgress(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("run_id", "page_id"),)

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="CASCADE"), index=True))
    activity_run_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningactivityrun.id", ondelete="CASCADE"), nullable=True, index=True))
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
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    guest_session_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True, index=True))
    answer: dict = Field(default_factory=dict, sa_column=Column(JSON))
    is_correct: bool | None = None
    score: float | None = None
    feedback_key: str | None = None
    submitted_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    graded_at: datetime | None = Field(default=None, sa_column=Column(DateTime, nullable=True))
    result: dict = Field(default_factory=dict, sa_column=Column(JSON))


class LearningBadgeAward(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("award_uuid"), UniqueConstraint("badge_id", "user_id", "major_version"))

    id: int | None = Field(default=None, primary_key=True)
    award_uuid: str = Field(default="", index=True)
    badge_id: int = Field(sa_column=Column(Integer, ForeignKey("learningbadge.id", ondelete="CASCADE"), index=True))
    badge_version_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningbadgeversion.id", ondelete="RESTRICT"), nullable=True, index=True))
    major_version: int = 1
    run_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("learningrun.id", ondelete="SET NULL"), nullable=True, index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    # Org that issued the award; None means the badge's creator org issued it.
    issuing_org_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("organization.id", ondelete="SET NULL"), nullable=True, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    source: LearningAwardSource = LearningAwardSource.PATH_COMPLETION
    conferred_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    issued_at: datetime = Field(default_factory=datetime.utcnow, sa_column=Column(DateTime, nullable=False))
    evidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: str = ""
    update_date: str = ""


class LearningRunRead(BaseModel):
    id: int
    run_uuid: str
    badge_id: int
    path_id: int
    badge_version_id: int | None = None
    org_id: int
    issuing_org_id: int | None = None
    program_assignment_id: int | None = None
    program_participant_id: int | None = None
    issuer_learner_link_id: int | None = None
    user_id: int | None = None
    guest_session_id: int | None = None
    status: LearningRunStatus
    started_at: datetime
    completed_at: datetime | None = None
    page_progress: list[dict] = []
    attempts: list[dict] = []
    award: dict | None = None
    navigation: dict | None = None
    render_context: dict = Field(default_factory=dict)


class LearningPathRead(BaseModel):
    path: dict
    badge: LearningBadgeRead
    activities: list[LearningActivityRead]
    run: LearningRunRead | None = None
    enrollment: dict = Field(default_factory=dict)


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
    feedback: str | None = ""
    question_scores: dict[str, float] = Field(default_factory=dict)


class LearningAwardCreate(SQLModel):
    badge_uuid: str
    user_id: int
    issuing_org_id: int | None = None
    evidence: dict = Field(default_factory=dict)


LearningActivityRead.model_rebuild()
LearningPathRead.model_rebuild()

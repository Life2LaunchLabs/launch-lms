from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class RoadmapOptionStatus(str, Enum):
    draft = "draft"
    active = "active"
    archived = "archived"


class RoadmapEndStateType(str, Enum):
    occupation = "occupation"
    entrepreneurship = "entrepreneurship"
    education = "education"
    life = "life"
    custom = "custom"


class RoadmapRequirementCategory(str, Enum):
    education = "education"
    work = "work"
    credential = "credential"
    life = "life"
    financial = "financial"
    custom = "custom"


class RoadmapRequirementLogic(str, Enum):
    required = "required"
    one_of = "one_of"


class RoadmapEventCategory(str, Enum):
    work = "work"
    education = "education"
    life = "life"


class UserRoadmapOption(SQLModel, table=True):
    __tablename__ = "userroadmapoption"
    __table_args__ = ({"extend_existing": True},)

    id: Optional[int] = Field(default=None, primary_key=True)
    roadmap_uuid: str = Field(index=True, unique=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    end_state_option_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("userroadmapendstateoption.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    end_state_title: str
    end_state_type: RoadmapEndStateType = Field(
        default=RoadmapEndStateType.occupation,
        sa_column=Column(String, nullable=False, server_default=RoadmapEndStateType.occupation.value, index=True),
    )
    status: RoadmapOptionStatus = Field(
        default=RoadmapOptionStatus.draft,
        sa_column=Column(String, nullable=False, server_default=RoadmapOptionStatus.draft.value, index=True),
    )
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_low: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_mid: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_high: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_monthly_living_expenses: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    creation_date: str = ""
    update_date: str = ""


class UserRoadmapEndStateOption(SQLModel, table=True):
    __tablename__ = "userroadmapendstateoption"
    __table_args__ = ({"extend_existing": True},)

    id: Optional[int] = Field(default=None, primary_key=True)
    option_uuid: str = Field(index=True, unique=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    end_state_type: RoadmapEndStateType = Field(
        default=RoadmapEndStateType.occupation,
        sa_column=Column(String, nullable=False, server_default=RoadmapEndStateType.occupation.value, index=True),
    )
    starred: bool = True
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_low: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_mid: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_high: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    creation_date: str = ""
    update_date: str = ""


class UserRoadmapTemplateEvent(SQLModel, table=True):
    __tablename__ = "userroadmaptemplateevent"
    __table_args__ = (
        UniqueConstraint("end_state_option_id", "template_event_uuid", name="uq_userroadmaptemplateevent_option_uuid"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    template_event_uuid: str = Field(index=True, unique=True)
    end_state_option_id: int = Field(
        sa_column=Column(Integer, ForeignKey("userroadmapendstateoption.id", ondelete="CASCADE"), index=True)
    )
    category: RoadmapEventCategory = Field(
        default=RoadmapEventCategory.work,
        sa_column=Column(String, nullable=False, server_default=RoadmapEventCategory.work.value, index=True),
    )
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    start_offset_months: int = 0
    duration_months: int = 1
    dependency_key: Optional[str] = Field(default=None, index=True)
    fork_group_key: Optional[str] = Field(default=None, index=True)
    optional: bool = False
    estimated_monthly_income: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    estimated_monthly_expense: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    estimated_one_time_cost: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class UserRoadmapRequirement(SQLModel, table=True):
    __tablename__ = "userroadmaprequirement"
    __table_args__ = (
        UniqueConstraint("roadmap_option_id", "requirement_uuid", name="uq_userroadmaprequirement_option_uuid"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_uuid: str = Field(index=True, unique=True)
    roadmap_option_id: int = Field(
        sa_column=Column(Integer, ForeignKey("userroadmapoption.id", ondelete="CASCADE"), index=True)
    )
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    category: RoadmapRequirementCategory = Field(
        default=RoadmapRequirementCategory.education,
        sa_column=Column(String, nullable=False, server_default=RoadmapRequirementCategory.education.value, index=True),
    )
    requirement_group_key: Optional[str] = Field(default=None, index=True)
    requirement_logic: RoadmapRequirementLogic = Field(
        default=RoadmapRequirementLogic.required,
        sa_column=Column(String, nullable=False, server_default=RoadmapRequirementLogic.required.value, index=True),
    )
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class UserRoadmapEvent(SQLModel, table=True):
    __tablename__ = "userroadmapevent"
    __table_args__ = (
        UniqueConstraint("roadmap_option_id", "event_uuid", name="uq_userroadmapevent_option_uuid"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    event_uuid: str = Field(index=True, unique=True)
    roadmap_option_id: int = Field(
        sa_column=Column(Integer, ForeignKey("userroadmapoption.id", ondelete="CASCADE"), index=True)
    )
    category: RoadmapEventCategory = Field(
        default=RoadmapEventCategory.work,
        sa_column=Column(String, nullable=False, server_default=RoadmapEventCategory.work.value, index=True),
    )
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    start_date: str
    end_date: Optional[str] = None
    is_ongoing: bool = False
    employer: Optional[str] = None
    institution: Optional[str] = None
    estimated_monthly_income: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    estimated_monthly_expense: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    estimated_one_time_cost: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    required_step: bool = False
    requirement_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("userroadmaprequirement.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class RoadmapOptionBase(BaseModel):
    title: str
    description: Optional[str] = None
    end_state_title: str
    end_state_type: RoadmapEndStateType = RoadmapEndStateType.occupation
    status: RoadmapOptionStatus = RoadmapOptionStatus.draft
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = None
    expected_annual_income_low: Optional[float] = None
    expected_annual_income_mid: Optional[float] = None
    expected_annual_income_high: Optional[float] = None
    expected_monthly_living_expenses: Optional[float] = None
    notes: Optional[str] = None
    end_state_option_uuid: Optional[str] = None


class RoadmapOptionCreate(RoadmapOptionBase):
    pass


class RoadmapOptionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    end_state_title: Optional[str] = None
    end_state_type: Optional[RoadmapEndStateType] = None
    status: Optional[RoadmapOptionStatus] = None
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = None
    expected_annual_income_low: Optional[float] = None
    expected_annual_income_mid: Optional[float] = None
    expected_annual_income_high: Optional[float] = None
    expected_monthly_living_expenses: Optional[float] = None
    notes: Optional[str] = None


class RoadmapOptionRead(RoadmapOptionBase):
    roadmap_uuid: str
    creation_date: str
    update_date: str


class RoadmapEndStateOptionBase(BaseModel):
    title: str
    description: Optional[str] = None
    end_state_type: RoadmapEndStateType = RoadmapEndStateType.occupation
    starred: bool = True
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = None
    expected_annual_income_low: Optional[float] = None
    expected_annual_income_mid: Optional[float] = None
    expected_annual_income_high: Optional[float] = None
    notes: Optional[str] = None


class RoadmapEndStateOptionCreate(RoadmapEndStateOptionBase):
    pass


class RoadmapEndStateOptionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    end_state_type: Optional[RoadmapEndStateType] = None
    starred: Optional[bool] = None
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = None
    expected_annual_income_low: Optional[float] = None
    expected_annual_income_mid: Optional[float] = None
    expected_annual_income_high: Optional[float] = None
    notes: Optional[str] = None


class RoadmapTemplateEventBase(BaseModel):
    category: RoadmapEventCategory = RoadmapEventCategory.work
    title: str
    description: Optional[str] = None
    start_offset_months: int = 0
    duration_months: int = 1
    dependency_key: Optional[str] = None
    fork_group_key: Optional[str] = None
    optional: bool = False
    estimated_monthly_income: Optional[float] = None
    estimated_monthly_expense: Optional[float] = None
    estimated_one_time_cost: Optional[float] = None
    sort_order: int = 0


class RoadmapTemplateEventCreate(RoadmapTemplateEventBase):
    pass


class RoadmapTemplateEventUpdate(BaseModel):
    category: Optional[RoadmapEventCategory] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_offset_months: Optional[int] = None
    duration_months: Optional[int] = None
    dependency_key: Optional[str] = None
    fork_group_key: Optional[str] = None
    optional: Optional[bool] = None
    estimated_monthly_income: Optional[float] = None
    estimated_monthly_expense: Optional[float] = None
    estimated_one_time_cost: Optional[float] = None
    sort_order: Optional[int] = None


class RoadmapTemplateEventRead(RoadmapTemplateEventBase):
    template_event_uuid: str
    creation_date: str
    update_date: str


class RoadmapEndStateOptionRead(RoadmapEndStateOptionBase):
    option_uuid: str
    built_roadmap_uuid: Optional[str] = None
    template_events: list[RoadmapTemplateEventRead] = PydanticField(default_factory=list)
    creation_date: str
    update_date: str


class RoadmapRequirementBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: RoadmapRequirementCategory = RoadmapRequirementCategory.education
    requirement_group_key: Optional[str] = None
    requirement_logic: RoadmapRequirementLogic = RoadmapRequirementLogic.required
    sort_order: int = 0


class RoadmapRequirementCreate(RoadmapRequirementBase):
    pass


class RoadmapRequirementUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[RoadmapRequirementCategory] = None
    requirement_group_key: Optional[str] = None
    requirement_logic: Optional[RoadmapRequirementLogic] = None
    sort_order: Optional[int] = None


class RoadmapRequirementRead(RoadmapRequirementBase):
    requirement_uuid: str
    satisfied_by_event_uuid: Optional[str] = None
    creation_date: str
    update_date: str


class RoadmapEventBase(BaseModel):
    category: RoadmapEventCategory = RoadmapEventCategory.work
    title: str
    description: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    is_ongoing: bool = False
    employer: Optional[str] = None
    institution: Optional[str] = None
    estimated_monthly_income: Optional[float] = None
    estimated_monthly_expense: Optional[float] = None
    estimated_one_time_cost: Optional[float] = None
    required_step: bool = False
    requirement_uuid: Optional[str] = None
    sort_order: int = 0


class RoadmapEventCreate(RoadmapEventBase):
    pass


class RoadmapEventUpdate(BaseModel):
    category: Optional[RoadmapEventCategory] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_ongoing: Optional[bool] = None
    employer: Optional[str] = None
    institution: Optional[str] = None
    estimated_monthly_income: Optional[float] = None
    estimated_monthly_expense: Optional[float] = None
    estimated_one_time_cost: Optional[float] = None
    required_step: Optional[bool] = None
    requirement_uuid: Optional[str] = None
    sort_order: Optional[int] = None


class RoadmapEventRead(RoadmapEventBase):
    event_uuid: str
    creation_date: str
    update_date: str


class RoadmapSummaryRead(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_months: int = 0
    months_until_first_income: Optional[int] = None
    months_until_sustaining_income: Optional[int] = None
    total_estimated_cost: float = 0
    total_estimated_income: float = 0
    lowest_projected_cash_position: float = 0
    support_needed: float = 0
    income_low: Optional[float] = None
    income_mid: Optional[float] = None
    income_high: Optional[float] = None
    monthly_living_expenses: Optional[float] = None
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    requirement_count: int = 0
    satisfied_requirement_count: int = 0


class RoadmapDetailRead(BaseModel):
    option: RoadmapOptionRead
    requirements: list[RoadmapRequirementRead] = PydanticField(default_factory=list)
    events: list[RoadmapEventRead] = PydanticField(default_factory=list)
    summary: RoadmapSummaryRead

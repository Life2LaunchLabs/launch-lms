from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class RoadmapBlockVisibility(str, Enum):
    user = "user"
    org = "org"


class RoadmapBlockCategory(str, Enum):
    work = "work"
    education = "education"
    life = "life"


class RoadmapBlockType(str, Enum):
    occupation = "occupation"
    entrepreneurship = "entrepreneurship"
    education = "education"
    credential = "credential"
    job = "job"
    life = "life"
    finance = "finance"
    custom = "custom"


class RoadmapPathwayStatus(str, Enum):
    draft = "draft"
    active = "active"
    archived = "archived"


class RoadmapRequirementLogic(str, Enum):
    required = "required"
    one_of = "one_of"


class RoadmapBlockDefinition(SQLModel, table=True):
    __tablename__ = "roadmapblockdefinition"
    __table_args__ = ({"extend_existing": True},)

    id: Optional[int] = Field(default=None, primary_key=True)
    block_uuid: str = Field(index=True, unique=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    owner_user_id: Optional[int] = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True))
    visibility: RoadmapBlockVisibility = Field(sa_column=Column(String, nullable=False, server_default=RoadmapBlockVisibility.user.value, index=True))
    lane_category: RoadmapBlockCategory = Field(sa_column=Column(String, nullable=False, server_default=RoadmapBlockCategory.work.value, index=True))
    block_type: RoadmapBlockType = Field(default=RoadmapBlockType.custom, sa_column=Column(String, nullable=False, server_default=RoadmapBlockType.custom.value, index=True))
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    starred: bool = True
    is_draft: bool = False
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_low: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_mid: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    expected_annual_income_high: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    default_monthly_income: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    default_monthly_expense: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    default_one_time_cost: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    creation_date: str = ""
    update_date: str = ""


class RoadmapBlockRequirement(SQLModel, table=True):
    __tablename__ = "roadmapblockrequirement"
    __table_args__ = (
        UniqueConstraint("block_id", "required_block_id", "group_key", name="uq_roadmapblockrequirement_block_required_group"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_uuid: str = Field(index=True, unique=True)
    block_id: int = Field(sa_column=Column(Integer, ForeignKey("roadmapblockdefinition.id", ondelete="CASCADE"), index=True))
    required_block_id: int = Field(sa_column=Column(Integer, ForeignKey("roadmapblockdefinition.id", ondelete="CASCADE"), index=True))
    group_key: Optional[str] = Field(default=None, index=True)
    logic: RoadmapRequirementLogic = Field(default=RoadmapRequirementLogic.required, sa_column=Column(String, nullable=False, server_default=RoadmapRequirementLogic.required.value, index=True))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class RoadmapPathway(SQLModel, table=True):
    __tablename__ = "roadmappathway"
    __table_args__ = ({"extend_existing": True},)

    id: Optional[int] = Field(default=None, primary_key=True)
    pathway_uuid: str = Field(index=True, unique=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    status: RoadmapPathwayStatus = Field(default=RoadmapPathwayStatus.draft, sa_column=Column(String, nullable=False, server_default=RoadmapPathwayStatus.draft.value, index=True))
    creation_date: str = ""
    update_date: str = ""


class RoadmapPathwayBlock(SQLModel, table=True):
    __tablename__ = "roadmappathwayblock"
    __table_args__ = (
        UniqueConstraint("pathway_id", "pathway_block_uuid", name="uq_roadmappathwayblock_pathway_uuid"),
        {"extend_existing": True},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    pathway_block_uuid: str = Field(index=True, unique=True)
    pathway_id: int = Field(sa_column=Column(Integer, ForeignKey("roadmappathway.id", ondelete="CASCADE"), index=True))
    block_id: int = Field(sa_column=Column(Integer, ForeignKey("roadmapblockdefinition.id", ondelete="CASCADE"), index=True))
    start_date: str
    end_date: Optional[str] = None
    is_ongoing: bool = False
    title_override: Optional[str] = None
    description_override: Optional[str] = Field(default=None, sa_column=Column(Text))
    monthly_income_override: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    monthly_expense_override: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    one_time_cost_override: Optional[float] = Field(default=None, sa_column=Column(Float, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    sort_order: int = 0
    creation_date: str = ""
    update_date: str = ""


class RoadmapBlockBase(BaseModel):
    lane_category: RoadmapBlockCategory = RoadmapBlockCategory.work
    block_type: RoadmapBlockType = RoadmapBlockType.custom
    title: str
    description: Optional[str] = None
    starred: bool = True
    is_draft: bool = False
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = None
    expected_annual_income_low: Optional[float] = None
    expected_annual_income_mid: Optional[float] = None
    expected_annual_income_high: Optional[float] = None
    default_monthly_income: Optional[float] = None
    default_monthly_expense: Optional[float] = None
    default_one_time_cost: Optional[float] = None
    notes: Optional[str] = None


class RoadmapBlockCreate(RoadmapBlockBase):
    visibility: RoadmapBlockVisibility = RoadmapBlockVisibility.user


class RoadmapBlockUpdate(BaseModel):
    lane_category: Optional[RoadmapBlockCategory] = None
    block_type: Optional[RoadmapBlockType] = None
    title: Optional[str] = None
    description: Optional[str] = None
    starred: Optional[bool] = None
    is_draft: Optional[bool] = None
    skill_fit_score: Optional[int] = None
    lifestyle_fit_score: Optional[int] = None
    confidence_score: Optional[int] = None
    target_annual_income: Optional[float] = None
    expected_annual_income_low: Optional[float] = None
    expected_annual_income_mid: Optional[float] = None
    expected_annual_income_high: Optional[float] = None
    default_monthly_income: Optional[float] = None
    default_monthly_expense: Optional[float] = None
    default_one_time_cost: Optional[float] = None
    notes: Optional[str] = None


class RoadmapBlockRead(RoadmapBlockBase):
    block_uuid: str
    visibility: RoadmapBlockVisibility
    owner_user_id: Optional[int] = None
    editable: bool = False
    creation_date: str
    update_date: str


class RoadmapBlockRequirementCreate(BaseModel):
    required_block_uuid: str
    group_key: Optional[str] = None
    logic: RoadmapRequirementLogic = RoadmapRequirementLogic.required
    sort_order: int = 0


class RoadmapBlockRequirementRead(BaseModel):
    requirement_uuid: str
    block_uuid: str
    required_block: RoadmapBlockRead
    group_key: Optional[str] = None
    logic: RoadmapRequirementLogic
    sort_order: int
    creation_date: str
    update_date: str


class RoadmapPathwayBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: RoadmapPathwayStatus = RoadmapPathwayStatus.draft


class RoadmapPathwayCreate(RoadmapPathwayBase):
    pass


class RoadmapPathwayUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[RoadmapPathwayStatus] = None


class RoadmapPathwayRead(RoadmapPathwayBase):
    pathway_uuid: str
    creation_date: str
    update_date: str


class RoadmapPathwayBlockCreate(BaseModel):
    block_uuid: Optional[str] = None
    title: Optional[str] = None
    lane_category: RoadmapBlockCategory = RoadmapBlockCategory.work
    block_type: RoadmapBlockType = RoadmapBlockType.custom
    start_date: str
    end_date: Optional[str] = None
    is_ongoing: bool = False
    title_override: Optional[str] = None
    description_override: Optional[str] = None
    monthly_income_override: Optional[float] = None
    monthly_expense_override: Optional[float] = None
    one_time_cost_override: Optional[float] = None
    notes: Optional[str] = None
    sort_order: int = 0


class RoadmapPathwayBlockUpdate(BaseModel):
    block_uuid: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_ongoing: Optional[bool] = None
    title_override: Optional[str] = None
    description_override: Optional[str] = None
    monthly_income_override: Optional[float] = None
    monthly_expense_override: Optional[float] = None
    one_time_cost_override: Optional[float] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class RoadmapRequirementStatusRead(BaseModel):
    requirement_uuid: str
    required_block: RoadmapBlockRead
    met: bool = False
    met_by_pathway_block_uuid: Optional[str] = None
    group_key: Optional[str] = None
    logic: RoadmapRequirementLogic


class RoadmapPathwayBlockRead(BaseModel):
    pathway_block_uuid: str
    block: RoadmapBlockRead
    start_date: str
    end_date: Optional[str] = None
    is_ongoing: bool
    title_override: Optional[str] = None
    description_override: Optional[str] = None
    monthly_income_override: Optional[float] = None
    monthly_expense_override: Optional[float] = None
    one_time_cost_override: Optional[float] = None
    notes: Optional[str] = None
    sort_order: int
    unmet_requirements: list[RoadmapRequirementStatusRead] = PydanticField(default_factory=list)
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
    unmet_requirement_count: int = 0


class RoadmapPathwayDetailRead(BaseModel):
    pathway: RoadmapPathwayRead
    blocks: list[RoadmapPathwayBlockRead] = PydanticField(default_factory=list)
    summary: RoadmapSummaryRead

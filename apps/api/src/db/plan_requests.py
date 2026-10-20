from typing import Literal

from sqlalchemy import BigInteger, Column, ForeignKey
from sqlmodel import Field, SQLModel


class PlanRequestBase(SQLModel):
    request_type: str = "tier_upgrade"  # "tier_upgrade" | "partner_application" | "feature_request"
    requested_value: str = ""  # tier (e.g. "full"), partner program (e.g. "badge_publisher") or feature (e.g. "payments")
    message: str | None = None


class PlanRequest(PlanRequestBase, table=True):
    __tablename__ = "plan_request"

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    request_uuid: str = ""
    status: str = "pending"  # "pending" | "approved" | "denied"
    creation_date: str = ""
    update_date: str = ""


class PlanRequestCreate(SQLModel):
    request_type: Literal["tier_upgrade", "partner_application", "feature_request"] = "tier_upgrade"
    requested_value: str = ""
    message: str | None = None


class PlanRequestRead(SQLModel):
    id: int
    org_id: int
    request_uuid: str
    request_type: str
    requested_value: str
    message: str | None
    status: str
    creation_date: str
    update_date: str


class PlanRequestUpdate(SQLModel):
    status: Literal["pending", "approved", "denied"]
    message: str | None = None

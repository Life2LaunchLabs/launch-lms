from typing import Literal, Optional
from sqlalchemy import BigInteger, Column, ForeignKey
from sqlmodel import Field, SQLModel


class PlanRequestBase(SQLModel):
    request_type: str = "plan_upgrade"  # "plan_upgrade" | "package_add"
    requested_value: str = ""  # plan name (e.g. "full") or package id (e.g. "analytics")
    message: Optional[str] = None


class PlanRequest(PlanRequestBase, table=True):
    __tablename__ = "plan_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    request_uuid: str = ""
    status: str = "pending"  # "pending" | "approved" | "denied"
    creation_date: str = ""
    update_date: str = ""


class PlanRequestCreate(SQLModel):
    request_type: Literal["plan_upgrade", "package_add"] = "plan_upgrade"
    requested_value: str = ""
    message: Optional[str] = None


class PlanRequestRead(SQLModel):
    id: int
    org_id: int
    request_uuid: str
    request_type: str
    requested_value: str
    message: Optional[str]
    status: str
    creation_date: str
    update_date: str


class PlanRequestUpdate(SQLModel):
    status: Literal["pending", "approved", "denied"]
    message: Optional[str] = None

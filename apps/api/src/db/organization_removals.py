from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel


class OrganizationRemoval(SQLModel, table=True):
    """A learner an organization removed with its data (a records request, services/orgs/removals.py). They can't come
    back on their own (Join, a join link, joining one of its plans) until the organization invites them again."""

    __tablename__ = "organization_removal"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_organization_removal_org_user"),)

    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True))
    removed_by_user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    creation_date: str = ""

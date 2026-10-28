"""Request bodies for a plan template's draft and live version (services/goals/drafts.py)."""

from sqlmodel import Field, SQLModel


class TemplateDraftStart(SQLModel):
    semver: str
    note: str = Field(default="", max_length=1000)


class TemplateDraftUpdate(SQLModel):
    semver: str | None = None
    note: str | None = Field(default=None, max_length=1000)


class TemplateLiveUpdate(SQLModel):
    # None makes the template inactive: nothing new can be assigned or started from it.
    version_uuid: str | None = None

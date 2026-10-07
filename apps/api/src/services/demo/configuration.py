from fastapi import HTTPException
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import update
from sqlmodel import Session, select
from src.db.demo import DemoConfiguration
from src.db.organizations import Organization


class DemoSettings(BaseModel):
    revision: int = Field(ge=1)
    enabled: bool
    source_user_id: int | None = Field(default=None, gt=0)
    entry_org_id: int | None = Field(default=None, gt=0)
    source_user_email: EmailStr | None = None
    entry_org_slug: str | None = Field(default=None, min_length=1, max_length=100)
    capacity: int = Field(default=200, ge=1, le=1000)
    session_minutes: int = Field(default=60, ge=10, le=1440)
    extension_minutes: int = Field(default=30, ge=10, le=1440)
    ai_requests_per_minute: int = Field(default=10, ge=1, le=60)
    ai_tokens_per_visitor: int = Field(default=100000, ge=1000, le=1000000)
    ai_tokens_per_day: int = Field(default=2000000, ge=1000, le=100000000)


def configuration(db: Session, *, lock: bool = False) -> DemoConfiguration:
    from sqlmodel import select

    statement = select(DemoConfiguration).where(DemoConfiguration.id == 1)
    if lock:
        statement = statement.with_for_update()
    result = db.exec(statement).first()
    if result is None:
        raise HTTPException(503, "Demo setup migration has not been applied.")
    return result


def save_settings(db: Session, settings: DemoSettings) -> DemoConfiguration:
    org = (
        db.exec(
            select(Organization).where(Organization.slug == settings.entry_org_slug)
        ).first()
        if settings.entry_org_slug
        else db.get(Organization, settings.entry_org_id)
    )
    if not org:
        raise HTTPException(422, "The fictional scenario organization was not found.")
    settings.entry_org_id = org.id
    previous = configuration(db, lock=True)
    values = settings.model_dump(
        exclude={"revision", "source_user_email", "entry_org_slug"}
    )
    if previous.entry_org_id != settings.entry_org_id:
        from src.db.demo import DemoMember
        from sqlmodel import delete

        db.exec(delete(DemoMember))
        values["checkpoint_id"] = None
        values["source_user_id"] = None
    else:
        values["source_user_id"] = previous.source_user_id
    changed = db.execute(
        update(DemoConfiguration)
        .where(
            DemoConfiguration.id == 1,
            DemoConfiguration.revision == settings.revision,
        )
        .values(**values, revision=settings.revision + 1)
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Demo settings changed. Reload before saving.")
    db.commit()
    db.expire_all()
    return configuration(db)

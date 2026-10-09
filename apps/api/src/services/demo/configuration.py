from fastapi import HTTPException

from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlmodel import Session, select
from src.db.demo import DemoConfiguration


class DemoSettings(BaseModel):
    revision: int = Field(ge=1)
    enabled: bool
    auto_recapture: bool = True
    capacity: int = Field(default=100, ge=1, le=1000)
    session_minutes: int = Field(default=60, ge=10, le=1440)
    extension_minutes: int = Field(default=30, ge=10, le=1440)
    ai_requests_per_minute: int = Field(default=10, ge=1, le=60)
    ai_tokens_per_visitor: int = Field(default=100000, ge=1000, le=1000000)
    ai_tokens_per_day: int = Field(default=2000000, ge=1000, le=100000000)


def configuration(db: Session, *, lock: bool = False) -> DemoConfiguration:
    statement = select(DemoConfiguration).where(DemoConfiguration.id == 1)
    if lock:
        statement = statement.with_for_update()
    result = db.exec(statement).first()
    if result is None:
        raise HTTPException(503, "Demo setup migration has not been applied.")
    return result


def save_settings(db: Session, settings: DemoSettings) -> DemoConfiguration:
    configuration(db, lock=True)
    values = settings.model_dump(exclude={"revision"})
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

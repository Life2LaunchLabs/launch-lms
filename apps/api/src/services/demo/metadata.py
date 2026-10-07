"""Read checkpoint routing metadata without loading its content/media archive."""

from sqlmodel import Session, select
from src.db.demo import DemoCheckpoint


def checkpoint_info(db: Session, identifier: str):
    return db.exec(
        select(
            DemoCheckpoint.id,
            DemoCheckpoint.created_at,
            DemoCheckpoint.created_by,
            DemoCheckpoint.pilots,
            DemoCheckpoint.entry_org_slug,
            DemoCheckpoint.schema_signature,
        ).where(DemoCheckpoint.id == identifier)
    ).first()

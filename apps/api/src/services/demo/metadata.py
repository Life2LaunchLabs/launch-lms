"""Read checkpoint routing metadata without loading its content/media archive."""

from threading import Lock

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


_content: tuple[str, dict] | None = None
_content_lock = Lock()


def checkpoint_content(db: Session, identifier: str) -> dict | None:
    """Checkpoints never change, so each process parses the current archive once."""
    global _content
    with _content_lock:
        if _content and _content[0] == identifier:
            return _content[1]
        data = db.exec(
            select(DemoCheckpoint.data).where(DemoCheckpoint.id == identifier)
        ).first()
        if data is not None:
            _content = (identifier, data)
        return data

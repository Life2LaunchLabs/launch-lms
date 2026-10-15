"""Copying and fingerprinting interactive activities.

Templates freeze a copy of each activity when they publish, so learners keep
playing the version they were issued; a content hash tells whether a working
activity changed since its last frozen copy.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage
from src.services.learning_documents.document import export_document
from src.services.learning_documents.references import rewrite_page_references


def _now() -> str:
    return datetime.now().isoformat()


def content_hash(value) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _pages(db: Session, activity: LearningActivity) -> list[LearningPage]:
    return list(db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order, LearningPage.id)).all())  # type: ignore[arg-type]


def activity_hash(db: Session, activity: LearningActivity) -> str:
    """Content hash of an activity, independent of its own and its pages' uuids."""
    pages = _pages(db, activity)
    document = export_document(activity, pages)
    numbering = {page.page_uuid: f"page-{index}" for index, page in enumerate(pages)}
    document = rewrite_page_references(document, numbering)
    document["activity"].pop("activity_uuid", None)
    return content_hash(document)


def copy_activity(db: Session, source: LearningActivity, **fields) -> LearningActivity:
    """A copy of an activity and its pages with new uuids; ``fields`` override the copy's own columns."""
    now = _now()
    pages = _pages(db, source)
    renamed = {page.page_uuid: f"learning_page_{uuid4()}" for page in pages}
    copy = LearningActivity(
        activity_uuid=f"learning_activity_{uuid4()}", objective_id=source.objective_id, org_id=source.org_id,
        title=source.title, description=source.description, thumbnail_image=source.thumbnail_image, icon=source.icon,
        settings=rewrite_page_references(deepcopy(source.settings or {}), renamed), creation_date=now, update_date=now,
    )
    for key, value in fields.items():
        setattr(copy, key, value)
    db.add(copy)
    db.flush()
    for page in pages:
        db.add(LearningPage(
            activity_id=int(copy.id), org_id=page.org_id, page_uuid=renamed[page.page_uuid], page_type=page.page_type,  # type: ignore[arg-type]
            title=page.title, order=page.order, required=page.required,
            content=rewrite_page_references(deepcopy(page.content or {}), renamed), design=deepcopy(page.design or {}),
            scoring=deepcopy(page.scoring or {}), completion=deepcopy(page.completion or {}), creation_date=now, update_date=now,
        ))
    db.flush()
    return copy

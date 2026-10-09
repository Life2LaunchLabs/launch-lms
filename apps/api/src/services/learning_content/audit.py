"""Report stored pages and flows the typed content models would reject.

Read-only. Run before deploying a model change against a copy of production::

    cd apps/api && uv run python cli.py audit-learning-content
"""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.services.learning_content.models import Flow, StandardPageContent, content_error


def audit(db_session: Session) -> list[tuple[str, str]]:
    problems = []
    for page in db_session.exec(select(LearningPage).where(LearningPage.page_type == LearningPageType.STANDARD)).all():
        error = content_error(StandardPageContent, page.content)
        if error:
            problems.append((page.page_uuid, error))
    for activity in db_session.exec(select(LearningActivity)).all():
        flow = (activity.settings or {}).get("flow")
        error = content_error(Flow, flow) if flow else None
        if error:
            problems.append((activity.activity_uuid, f"flow: {error}"))
    return problems


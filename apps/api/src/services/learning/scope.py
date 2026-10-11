"""What a learning run covers.

A badge run covers every activity of one badge version. An objective run
covers the single activity a plan objective plays. The runtime reads a run's
activities and pages only through these helpers, so both kinds of run share
navigation, page completion, responses and grading.
"""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.learning import LearningActivity, LearningPage, LearningRun


def run_activities(db_session: Session, run: LearningRun) -> list[LearningActivity]:
    if run.activity_id:
        activity = db_session.get(LearningActivity, run.activity_id)
        return [activity] if activity else []
    return list(db_session.exec(
        select(LearningActivity).where(
            LearningActivity.badge_id == run.badge_id,
            LearningActivity.version_id == run.badge_version_id,
        )
    ).all())


def run_pages(db_session: Session, run: LearningRun, required_only: bool = False) -> list[LearningPage]:
    activity_ids = [activity.id for activity in run_activities(db_session, run)]
    if not activity_ids:
        return []
    statement = select(LearningPage).where(LearningPage.activity_id.in_(activity_ids))  # type: ignore[union-attr]
    if required_only:
        statement = statement.where(LearningPage.required == True)  # noqa: E712
    return list(db_session.exec(statement).all())


def page_in_run(run: LearningRun, page: LearningPage) -> bool:
    if run.activity_id:
        return page.activity_id == run.activity_id
    return page.version_id == run.badge_version_id

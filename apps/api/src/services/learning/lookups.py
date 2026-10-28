"""Activity lookups and serializers."""

from fastapi import HTTPException
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningActivityRead,
    LearningPage,
    LearningPageRead,
    LearningResponseAttempt,
    LearningRun,
)
from src.services.learning import access_rules
from src.services.learning_sequence import activity_sequence


def _require_activity_editor(db_session: Session, user, activity: LearningActivity) -> None:
    """Activities belong to templates; their organization's admins edit them."""
    access_rules._require_org_admin(db_session, user, activity.org_id, "build_plans")


def _ensure_editable(db_session: Session, activity: LearningActivity) -> None:
    """Frozen copies belong to a published template version and never change."""
    if activity.frozen_from_id is not None:
        raise HTTPException(status_code=409, detail="This activity is part of a published template version and cannot be edited. Edit the template's draft instead.")


def _is_system_activity(db_session: Session, activity: LearningActivity) -> bool:
    """Activities of a system template (the starter) may use trusted portfolio outcomes and system blocks."""
    from src.services.learning_documents.store import owning_template

    template = owning_template(db_session, activity)
    return bool(template and template["system_type"] is not None)


def _serialize_page(page: LearningPage) -> LearningPageRead:
    return LearningPageRead(**page.model_dump())


def _serialize_activity(
    activity: LearningActivity, pages: list[LearningPage] | None = None
) -> LearningActivityRead:
    serialized = [_serialize_page(page) for page in (pages or [])]
    converted = activity_sequence(activity.settings, [{"page_uuid": page.page_uuid, "content": page.content} for page in serialized]) if pages else None
    return LearningActivityRead(
        **activity.model_dump(),
        pages=serialized,
        sequence=converted.sequence if converted else None,
        sequence_flags=converted.flags if converted else [],
    )


def _get_activity(db_session: Session, activity_uuid: str) -> LearningActivity:
    activity = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.activity_uuid
            == access_rules._clean_uuid(activity_uuid, "learning_activity_")
        )
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    return activity


def _get_page(db_session: Session, page_uuid: str) -> LearningPage:
    page = db_session.exec(
        select(LearningPage).where(
            LearningPage.page_uuid == access_rules._clean_uuid(page_uuid, "learning_page_")
        )
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Learning page not found")
    return page


def _get_run(db_session: Session, run_uuid: str, user_id: int) -> LearningRun:
    """The learner's own run."""
    run = db_session.exec(select(LearningRun).where(
        LearningRun.run_uuid == access_rules._clean_uuid(run_uuid, "learning_run_"), LearningRun.user_id == user_id,
    )).first()
    if not run:
        raise HTTPException(status_code=404, detail="Learning run not found")
    return run


def _latest_attempts(
    db_session: Session, run_id: int
) -> dict[int, LearningResponseAttempt]:
    attempts = db_session.exec(
        select(LearningResponseAttempt)
        .where(LearningResponseAttempt.run_id == run_id)
        .order_by(LearningResponseAttempt.submitted_at.desc())  # type: ignore
    ).all()
    latest: dict[int, LearningResponseAttempt] = {}
    for attempt in attempts:
        if attempt.page_id not in latest:
            latest[attempt.page_id] = attempt
    return latest

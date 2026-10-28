"""Activity authoring: an activity's settings (sequence or flow, outcomes, grading, player). Pages are authored in page_authoring."""

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from src.db.learning import LearningActivityRead, LearningActivityUpdate, LearningPage
from src.db.users import AnonymousUser, PublicUser
from src.services.learning_content.models import Flow
from src.services.learning_content.recovery import content_issues
from src.services.learning_flow import FlowValidationError, validate_flow
from src.services.learning_sequence import sequence_changed_by, validate_player_settings, validate_sequence
from src.services.learning_portfolio_actions import PortfolioActionError, validate_outcomes
from src.services.learning import access_rules, lookups


async def update_activity(
    request: Request,
    activity_uuid: str,
    data: LearningActivityUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> LearningActivityRead:
    activity = lookups._get_activity(db_session, activity_uuid)
    lookups._require_activity_editor(db_session, current_user, activity)
    lookups._ensure_editable(db_session, activity)
    patch = data.model_dump(exclude_unset=True)
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore[union-attr]
    if "settings" in patch:
        patch["settings"] = sequence_changed_by(activity.settings, patch["settings"] or {})
        settings = patch["settings"]
        page_uuids = {page.page_uuid for page in pages}
        required = {page.page_uuid for page in pages if page.required}
        try:
            stored_flow = (activity.settings or {}).get("flow")
            # With a sequence the flow is only kept for rolling back, and isn't checked.
            validate_flow(
                None if settings.get("sequence") else settings.get("flow"),
                page_uuids,
                required,
                carried=content_issues(Flow, stored_flow) if stored_flow else (),
            )
            validate_sequence(settings.get("sequence"), page_uuids, required)
            validate_player_settings(settings)
            validate_outcomes(settings.get("outcomes"), lookups._is_system_activity(db_session, activity))
        except (FlowValidationError, PortfolioActionError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    for key, value in patch.items():
        setattr(activity, key, value)
    activity.update_date = access_rules._now()
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return lookups._serialize_activity(activity, list(pages))

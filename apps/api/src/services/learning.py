import hashlib
import re
from copy import deepcopy
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.learning import (
    BadgeCollection,
    BadgeCollectionCreate,
    BadgeCollectionRead,
    BadgeCollectionUpdate,
    BadgeIssuerAuthorization,
    BadgeIssuerAuthorizationStatus,
    BadgeIssuerLearnerLink,
    LearningActivity,
    LearningActivityCreate,
    LearningActivityRead,
    LearningActivityRun,
    LearningActivityUpdate,
    LearningAwardCreate,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeCreate,
    LearningBadgeNotificationSignup,
    LearningBadgeRead,
    LearningBadgeStatus,
    LearningBadgeUpdate,
    LearningPage,
    LearningPageComplete,
    LearningPageCreate,
    LearningPageProgress,
    LearningPageRead,
    LearningResponseGrade,
    LearningPageType,
    LearningPageUpdate,
    LearningPath,
    LearningPathRead,
    LearningResponseAttempt,
    LearningResponseSubmit,
    LearningRun,
    LearningRunRead,
    LearningRunStatus,
    LearningVariable,
    LearningVariableCreate,
    LearningVariableRead,
    LearningVariableUpdate,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.portfolio import JourneyEntry, Portfolio
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.security.superadmin import is_user_superadmin
from src.services.courses.openbadges import (
    OPEN_BADGES_CONTEXT,
    build_issuer_payload,
    get_org_badge_issuer_config,
    get_public_api_base_url,
    get_public_base_url,
)
from src.services.guest_sessions import LearningActor
from src.services.learning_page_convert import (
    STANDARD_CONTENT_VERSION,
    find_question_block,
    find_question_blocks,
    heading_node,
    iter_block_stacks,
    paragraph_node,
    question_block,
    text_block,
)
from src.services.learning_flow import FlowValidationError, resolve_flow, validate_flow
from src.services.learning_portfolio_actions import (
    PortfolioActionError,
    apply_portfolio_outcomes,
    validate_outcomes,
)
from src.services.utils.upload_content import upload_file

LEARNING_SYSTEM_TYPE_ONBOARDING = "onboarding"
ONBOARDING_COLLECTION_UUID = "badge_collection_system_onboarding"
ONBOARDING_BADGE_UUID = "badge_system_onboarding"
ONBOARDING_ACTIVITY_UUID = "learning_activity_system_onboarding_intro"
ONBOARDING_NAME_PAGE_UUID = "learning_page_system_onboarding_name"
ONBOARDING_GOAL_PAGE_UUID = "learning_page_system_onboarding_goal"
LAUNCH_READY_ACTIVITY_UUIDS = {
    "identity": ONBOARDING_ACTIVITY_UUID,
    "profile": "learning_activity_system_onboarding_profile",
    "journey": "learning_activity_system_onboarding_journey",
    "work": "learning_activity_system_onboarding_work",
    "traits": "learning_activity_system_onboarding_traits",
    "links": "learning_activity_system_onboarding_links",
    "theme": "learning_activity_system_onboarding_theme",
    "launch": "learning_activity_system_onboarding_launch",
}
LAUNCH_READY_DEFAULT_IMAGES = {
    key: f"/images/launch-ready/{key}.png" for key in LAUNCH_READY_ACTIVITY_UUIDS
}

_SYSTEM_FIELDS = {"protected", "system_type"}
_SAFE_CORE_VARIABLE_TARGETS = {"user.first_name", "user.last_name", "user.bio"}
_SAFE_IMAGE_VARIABLE_TARGETS = {"user.avatar_image"}
_SAFE_VARIABLE_PREFIXES = (
    "user.profile.onboarding.",
    "user.details.variables.",
    "user.details.onboarding.",
)
_BLOCKED_VARIABLE_SEGMENTS = {
    "",
    "id",
    "user_id",
    "user_uuid",
    "uuid",
    "password",
    "hashed_password",
    "roles",
    "role",
    "role_id",
    "is_superadmin",
    "superadmin",
    "permissions",
}


def _now() -> str:
    return str(datetime.now())


def _clean_uuid(value: str, prefix: str) -> str:
    return value if value.startswith(prefix) else f"{prefix}{value}"


def _actor_filters(model, actor: LearningActor):
    if actor.user_id is not None:
        return [model.user_id == actor.user_id]
    return [model.guest_session_id == actor.guest_session_id]


def _get_org(db_session: Session, org_id: int) -> Organization:
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _get_owner_org(db_session: Session) -> Organization:
    org = db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return org


def _strip_system_fields(payload: dict) -> dict:
    return {key: value for key, value in payload.items() if key not in _SYSTEM_FIELDS}


def _is_system_object(value) -> bool:
    system_type = getattr(value, "system_type", None)
    return bool(getattr(value, "protected", False) or (system_type and system_type != "legacy_badge_migration"))


def _is_locked_launch_ready_activity(activity: LearningActivity) -> bool:
    return bool(
        activity.activity_uuid in set(LAUNCH_READY_ACTIVITY_UUIDS.values())
        and (activity.settings or {}).get("system_required")
    )


def _ensure_onboarding_for_owner_org(db_session: Session, org_id: int) -> None:
    owner_org = db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if owner_org and owner_org.id == org_id:
        ensure_onboarding_learning_badge(db_session)


def _get_org_config(db_session: Session, org_id: int) -> OrganizationConfig | None:
    return db_session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()


def _require_user(current_user: PublicUser | AnonymousUser) -> PublicUser:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return current_user


def _require_org_admin(db_session: Session, current_user: PublicUser | AnonymousUser, org_id: int) -> PublicUser:
    user = _require_user(current_user)
    if is_user_superadmin(user.id, db_session):
        return user
    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user.id,
            UserOrganization.org_id == org_id,
            UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS),  # type: ignore
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization admin access required")
    return user


def _effective_issuing_org_id(run: LearningRun | None, fallback_org_id: int) -> int:
    """The org responsible for grading/issuing a run; a null issuing_org_id means the badge's creator org."""
    if run is not None and run.issuing_org_id is not None:
        return run.issuing_org_id
    return fallback_org_id


def _get_approved_issuer_authorization(db_session: Session, badge_id: int, issuer_org_id: int) -> BadgeIssuerAuthorization | None:
    return db_session.exec(
        select(BadgeIssuerAuthorization).where(
            BadgeIssuerAuthorization.badge_id == badge_id,
            BadgeIssuerAuthorization.issuer_org_id == issuer_org_id,
            BadgeIssuerAuthorization.status == BadgeIssuerAuthorizationStatus.APPROVED,
        )
    ).first()


def _validate_issuer_selection(db_session: Session, badge: LearningBadge, issuing_org_id: int, user_id: int | None) -> None:
    """Ensure a learner may run this badge under the selected issuing org."""
    if issuing_org_id == badge.org_id:
        return
    authorization = _get_approved_issuer_authorization(db_session, badge.id or 0, issuing_org_id)
    if not authorization:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization is not authorized to issue this badge")
    if authorization.open_to_all:
        return
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sign in to work with this issuing organization")
    link = db_session.exec(
        select(BadgeIssuerLearnerLink).where(
            BadgeIssuerLearnerLink.authorization_id == authorization.id,
            BadgeIssuerLearnerLink.user_id == user_id,
        )
    ).first()
    if not link:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This organization only supports invited learners for this badge")


def _get_badge(db_session: Session, badge_uuid: str) -> LearningBadge:
    badge = db_session.exec(
        select(LearningBadge).where(LearningBadge.badge_uuid == _clean_uuid(badge_uuid, "badge_"))
    ).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    return badge


def _get_path_for_badge(db_session: Session, badge: LearningBadge) -> LearningPath:
    path = db_session.exec(select(LearningPath).where(LearningPath.badge_id == badge.id)).first()
    if not path:
        path = LearningPath(
            path_uuid=f"path_{uuid4()}",
            badge_id=badge.id or 0,
            org_id=badge.org_id,
            title=f"{badge.name} Path",
            description=badge.description or "",
            creation_date=_now(),
            update_date=_now(),
        )
        db_session.add(path)
        db_session.commit()
        db_session.refresh(path)
    return path


def _serialize_page(page: LearningPage) -> LearningPageRead:
    return LearningPageRead(**page.model_dump())


def _serialize_activity(activity: LearningActivity, pages: list[LearningPage] | None = None) -> LearningActivityRead:
    return LearningActivityRead(
        **activity.model_dump(),
        pages=[_serialize_page(page) for page in (pages or [])],
    )


def _get_activity(db_session: Session, activity_uuid: str) -> LearningActivity:
    activity = db_session.exec(
        select(LearningActivity).where(LearningActivity.activity_uuid == _clean_uuid(activity_uuid, "learning_activity_"))
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    return activity


def _get_page(db_session: Session, page_uuid: str) -> LearningPage:
    page = db_session.exec(
        select(LearningPage).where(LearningPage.page_uuid == _clean_uuid(page_uuid, "learning_page_"))
    ).first()
    if not page:
        raise HTTPException(status_code=404, detail="Learning page not found")
    return page


def _get_run(db_session: Session, run_uuid: str, actor: LearningActor | None = None) -> LearningRun:
    statement = select(LearningRun).where(LearningRun.run_uuid == _clean_uuid(run_uuid, "learning_run_"))
    if actor:
        for owner_filter in _actor_filters(LearningRun, actor):
            statement = statement.where(owner_filter)
    run = db_session.exec(statement).first()
    if not run:
        raise HTTPException(status_code=404, detail="Learning run not found")
    return run


PUBLIC_BADGE_STATUSES = (LearningBadgeStatus.COMING_SOON, LearningBadgeStatus.PUBLISHED)


def _is_publicly_visible_badge(badge: LearningBadge) -> bool:
    return bool(badge.public and badge.status in PUBLIC_BADGE_STATUSES)


def _is_startable_badge(badge: LearningBadge) -> bool:
    return bool(badge.public and badge.status == LearningBadgeStatus.PUBLISHED)


def _public_badge_query(org_id: int | None = None):
    statement = select(LearningBadge).where(
        LearningBadge.public == True,
        LearningBadge.status.in_(PUBLIC_BADGE_STATUSES),
    )
    if org_id is not None:
        statement = statement.where(LearningBadge.org_id == org_id)
    return statement


def _can_read_badge(db_session: Session, badge: LearningBadge, current_user: PublicUser | AnonymousUser) -> bool:
    if _is_publicly_visible_badge(badge):
        return True
    if isinstance(current_user, AnonymousUser):
        return False
    try:
        _require_org_admin(db_session, current_user, badge.org_id)
        return True
    except HTTPException:
        return False


def _ensure_read_badge(db_session: Session, badge: LearningBadge, current_user: PublicUser | AnonymousUser) -> None:
    if not _can_read_badge(db_session, badge, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Badge is not available")


def _latest_attempts(db_session: Session, run_id: int) -> dict[int, LearningResponseAttempt]:
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


def _question_block(page: LearningPage) -> dict | None:
    return find_question_block(page.content)


def _question_blocks(page: LearningPage) -> list[dict]:
    return find_question_blocks(page.content)


def _flow_context(db_session: Session, run: LearningRun, activity_run: LearningActivityRun) -> dict:
    from src.db.portfolio import JourneyEntry, Portfolio, WorkItem

    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity_run.activity_id)).all()
    page_by_id = {page.id: page for page in pages}
    answers: dict = {}
    for attempt in db_session.exec(
        select(LearningResponseAttempt)
        .where(LearningResponseAttempt.run_id == run.id, LearningResponseAttempt.page_id.in_(set(page_by_id)))  # type: ignore
        .order_by(LearningResponseAttempt.submitted_at.asc())  # type: ignore
    ).all():
        page = page_by_id.get(attempt.page_id)
        if page:
            answers[page.page_uuid] = {"answer": attempt.answer, "result": attempt.result}
    facts = {"has_work": False, "has_journey": False, "work_count": 0, "journey_count": 0, "readiness_blockers": []}
    if run.user_id:
        portfolio = db_session.exec(select(Portfolio).where(Portfolio.user_id == run.user_id)).first()
        if portfolio:
            facts["work_count"] = len(db_session.exec(select(WorkItem).where(WorkItem.portfolio_id == portfolio.id, WorkItem.status != "archived")).all())
            facts["journey_count"] = len(db_session.exec(select(JourneyEntry).where(JourneyEntry.portfolio_id == portfolio.id, JourneyEntry.status != "archived")).all())
            facts["has_work"], facts["has_journey"] = facts["work_count"] > 0, facts["journey_count"] > 0
    data = activity_run.data or {}
    return {
        "answers": answers,
        "variables": data.get("variables") or {},
        "facts": facts,
        "context": {"mode": data.get("mode") or "create", "bindings": data.get("bindings") or {}},
        "bindings": data.get("bindings") or {},
    }


def _resolved_activity_flow(db_session: Session, run: LearningRun, activity_run: LearningActivityRun):
    activity = db_session.get(LearningActivity, activity_run.activity_id)
    definition = (activity_run.data or {}).get("definition") or {}
    flow = definition.get("flow") if "flow" in definition else (activity.settings or {}).get("flow") if activity else None
    return resolve_flow(flow, _flow_context(db_session, run, activity_run)) if flow else None


def _run_navigation(db_session: Session, run: LearningRun) -> dict:
    activities = []
    for activity_run in db_session.exec(select(LearningActivityRun).where(LearningActivityRun.run_id == run.id)).all():
        resolved = _resolved_activity_flow(db_session, run, activity_run)
        completed = {
            item.page_id for item in db_session.exec(
                select(LearningPageProgress).where(LearningPageProgress.run_id == run.id, LearningPageProgress.complete == True)
            ).all()
        }
        pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity_run.activity_id)).all()
        by_uuid = {page.page_uuid: page for page in pages}
        path = resolved.page_uuids if resolved else [page.page_uuid for page in sorted(pages, key=lambda page: page.order)]
        current = next((uuid for uuid in path if (by_uuid.get(uuid).id if by_uuid.get(uuid) else None) not in completed), None)
        activities.append({
            "activity_id": activity_run.activity_id,
            "path": path,
            "current_page_uuid": current,
            "terminal_reachable": bool(resolved.terminal) if resolved else True,
            "condition_trace": resolved.trace if resolved else [],
            "completed": len([uuid for uuid in path if by_uuid.get(uuid) and by_uuid[uuid].id in completed]),
            "total": len(path),
        })
    return {"activities": activities}


def _block_scoring(page: LearningPage, question: dict) -> dict:
    scoring = question.get("scoring")
    if isinstance(scoring, dict) and scoring:
        return scoring
    return page.scoring or {}


def _block_completion(page: LearningPage, question: dict) -> dict:
    completion = question.get("completion")
    if isinstance(completion, dict) and completion:
        return completion
    return page.completion or {}


def _serialize_run(db_session: Session, run: LearningRun) -> LearningRunRead:
    progress = db_session.exec(select(LearningPage).where(LearningPage.badge_id == run.badge_id)).all()
    progress_by_page = {
        item.page_id: item
        for item in db_session.exec(select(LearningPageProgress).where(LearningPageProgress.run_id == run.id)).all()
    }
    attempts = db_session.exec(select(LearningResponseAttempt).where(LearningResponseAttempt.run_id == run.id)).all()
    award = db_session.exec(select(LearningBadgeAward).where(LearningBadgeAward.run_id == run.id)).first()
    navigation = _run_navigation(db_session, run)
    render_context = {"answers": {}, "variables": {}}
    page_by_id = {page.id: page for page in progress}
    for attempt in sorted(attempts, key=lambda item: item.submitted_at):
        attempt_page = page_by_id.get(attempt.page_id)
        if attempt_page:
            render_context["answers"][attempt_page.page_uuid] = {
                "answer": attempt.answer or {},
                "result": attempt.result or {},
            }
    if run.user_id:
        user = db_session.get(User, run.user_id)
        if user:
            render_context["variables"] = {
                "user.first_name": user.first_name or "",
                "user.last_name": user.last_name or "",
                "user.avatar_image": user.avatar_image or "",
            }
            portfolio = db_session.exec(select(Portfolio).where(Portfolio.user_id == user.id)).first()
            if portfolio:
                journeys = db_session.exec(
                    select(JourneyEntry)
                    .where(JourneyEntry.portfolio_id == portfolio.id)
                    .order_by(JourneyEntry.is_current.desc(), JourneyEntry.start_date.desc())  # type: ignore
                ).all()
                render_context["variables"]["portfolio.journey_options"] = [
                    {"value": item.journey_uuid, "label": item.title} for item in journeys
                ]
    return LearningRunRead(
        id=run.id or 0,
        run_uuid=run.run_uuid,
        badge_id=run.badge_id,
        path_id=run.path_id,
        org_id=run.org_id,
        issuing_org_id=run.issuing_org_id,
        user_id=run.user_id,
        guest_session_id=run.guest_session_id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        page_progress=[
            {
                "page_uuid": page.page_uuid,
                "complete": bool(progress_by_page.get(page.id or 0) and progress_by_page[page.id or 0].complete),
                "data": progress_by_page.get(page.id or 0).data if progress_by_page.get(page.id or 0) else {},
            }
            for page in progress
        ],
        attempts=[{**attempt.model_dump(), "page_uuid": page_by_id.get(attempt.page_id).page_uuid if page_by_id.get(attempt.page_id) else None} for attempt in attempts],
        award=award.model_dump() if award else None,
        navigation=navigation,
        render_context=render_context,
    )


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _word_count(value: str) -> int:
    return len([word for word in str(value or "").strip().split() if word])


def _normalize_mcq_answer(answer: dict) -> list[str]:
    raw_options = answer.get("option_ids") or answer.get("optionIds")
    if raw_options is None:
        single = answer.get("option_id") or answer.get("optionId") or answer.get("value")
        raw_options = [single] if single else []
    if not isinstance(raw_options, list):
        raw_options = [raw_options]
    selected: list[str] = []
    for option_id in raw_options:
        if option_id is None:
            continue
        normalized = str(option_id)
        if normalized not in selected:
            selected.append(normalized)
    return selected


def _normalize_text_answer(question_content: dict, answer: dict) -> dict[str, dict]:
    raw_inputs = answer.get("inputs")
    if isinstance(raw_inputs, dict):
        return {
            str(input_id): value if isinstance(value, dict) else {"text": str(value or "")}
            for input_id, value in raw_inputs.items()
        }

    inputs = question_content.get("inputs") or []
    fallback_id = str(inputs[0].get("id") if inputs else "response")
    return {
        fallback_id: {
            "text": str(answer.get("text") or answer.get("value") or ""),
            **({"rich_text": answer.get("rich_text")} if answer.get("rich_text") is not None else {}),
        }
    }


def _validate_mcq_answer(question_content: dict, completion: dict, selected: list[str], answer: dict | None = None) -> None:
    options = question_content.get("options") or []
    option_ids = {str(option.get("id")) for option in options if option.get("id") is not None}
    completion = completion or {}
    min_selections = max(0, _as_int(completion.get("min_selections") or completion.get("minSelections"), 1))
    max_default = len(options) if options else max(1, len(selected))
    max_selections = max(1, _as_int(completion.get("max_selections") or completion.get("maxSelections"), max_default))
    if len(selected) < min_selections:
        raise HTTPException(status_code=422, detail=f"Select at least {min_selections} option(s)")
    if len(selected) > max_selections:
        raise HTTPException(status_code=422, detail=f"Select no more than {max_selections} option(s)")
    custom_options = (answer or {}).get("custom_options") or []
    custom_ids: set[str] = set()
    for option in custom_options:
        if not isinstance(option, dict):
            raise HTTPException(status_code=422, detail="Custom option is invalid")
        option_id, text = str(option.get("id") or "").strip(), str(option.get("text") or "").strip()
        if not text or len(text) > 80 or option_id != text:
            raise HTTPException(status_code=422, detail="Custom option must be between 1 and 80 characters")
        custom_ids.add(option_id)
    if option_ids:
        invalid = [option_id for option_id in selected if option_id not in option_ids and option_id not in custom_ids]
        if invalid:
            raise HTTPException(status_code=422, detail="Selected option is not available")


def _validate_text_answer(question_content: dict, completion: dict, inputs: dict[str, dict]) -> dict[str, dict]:
    configured_inputs = question_content.get("inputs") or [{"id": "response"}]
    completion_inputs = (completion or {}).get("inputs") or {}
    results: dict[str, dict] = {}

    for item in configured_inputs:
        input_id = str(item.get("id") or "response")
        rules = completion_inputs.get(input_id) or {}
        value = inputs.get(input_id) or {}
        text = str(value.get("text") or "").strip()
        words = _word_count(text)
        min_words = max(0, _as_int(rules.get("min_words") or rules.get("minWords"), 0))
        max_words = max(0, _as_int(rules.get("max_words") or rules.get("maxWords"), 0))
        required = rules.get("required", min_words > 0)

        if required and not text:
            raise HTTPException(status_code=422, detail="Required text response is missing")
        if text and words < min_words:
            raise HTTPException(status_code=422, detail=f"Response must be at least {min_words} word(s)")
        if max_words and words > max_words:
            raise HTTPException(status_code=422, detail=f"Response must be no more than {max_words} word(s)")

        results[input_id] = {
            "text": text,
            "word_count": words,
            "value_type": "text",
            **({"rich_text": value.get("rich_text")} if value.get("rich_text") is not None else {}),
        }
    return results


def _validate_image_answer(completion: dict, answer: dict) -> dict:
    image_url = str((answer or {}).get("url") or (answer or {}).get("image_url") or (answer or {}).get("imageUrl") or "").strip()
    required = (completion or {}).get("required", True)
    if required and not image_url:
        raise HTTPException(status_code=422, detail="Required image response is missing")
    return {
        "url": image_url,
        "name": str((answer or {}).get("name") or (answer or {}).get("filename") or "").strip(),
        "content_type": str((answer or {}).get("content_type") or (answer or {}).get("contentType") or "").strip(),
        "size": _as_int((answer or {}).get("size"), 0),
        "value_type": "image",
    }


def _normalize_bindings(value) -> list[dict]:
    if not value:
        return []
    if isinstance(value, list):
        items = value
    else:
        items = [value]
    return [item for item in items if isinstance(item, dict) and item.get("target")]


def _variable_bindings(page: LearningPage) -> dict:
    completion = page.completion or {}
    content = page.content or {}
    bindings = completion.get("variable_bindings") or completion.get("variableBindings")
    if not isinstance(bindings, dict):
        bindings = content.get("variable_bindings") or content.get("variableBindings") or {}
    return bindings if isinstance(bindings, dict) else {}


def _extract_learning_variables(page: LearningPage, result: dict) -> list[dict]:
    variables: list[dict] = []
    questions = _question_blocks(page)
    question_results = result.get("questions") if isinstance(result.get("questions"), dict) else {}

    for question in questions:
        block_id = str(question.get("id") or "")
        bindings = _question_variable_bindings(page, question)
        sub_result = question_results.get(block_id) or (result if len(questions) == 1 else {})
        kind = question.get("kind")

        if kind == "text_input":
            input_bindings = bindings.get("inputs") or {}
            if not isinstance(input_bindings, dict):
                continue
            inputs = sub_result.get("inputs") or {}
            for input_id, answer in inputs.items():
                value = str((answer or {}).get("text") or "").strip()
                for binding in _normalize_bindings(input_bindings.get(input_id)):
                    variables.append(
                        {
                            "target": str(binding.get("target") or ""),
                            "value": value,
                            "source": {"page_uuid": page.page_uuid, "block_id": block_id, "input_id": input_id},
                        }
                    )

        if kind == "image_upload":
            image_url = str(sub_result.get("url") or "").strip()
            for binding in _normalize_bindings(bindings.get("image")):
                variables.append(
                    {
                        "target": str(binding.get("target") or ""),
                        "value": image_url,
                        "value_type": "image",
                        "source": {"page_uuid": page.page_uuid, "block_id": block_id},
                    }
                )

        if kind in {"multiple_choice", "categorized_multi_select"}:
            option_bindings = bindings.get("options") or {}
            if not isinstance(option_bindings, dict):
                continue
            selected_options = [str(option_id) for option_id in sub_result.get("option_ids") or sub_result.get("selected") or []]
            if bindings.get("options_value_mode") == "selected_text_list":
                options = (question.get("content") or {}).get("options") or []
                option_labels = {
                    str(option.get("id")): str(option.get("text") or option.get("id") or "")
                    for option in options
                    if isinstance(option, dict) and option.get("id") is not None
                }
                values_by_target: dict[str, list] = {}
                for option_id in selected_options:
                    for binding in _normalize_bindings(option_bindings.get(option_id)):
                        target = str(binding.get("target") or "")
                        values_by_target.setdefault(target, []).append(option_labels.get(option_id, option_id))
                for target, values in values_by_target.items():
                    variables.append(
                        {
                            "target": target,
                            "value": values,
                            "source": {"page_uuid": page.page_uuid, "block_id": block_id, "option_ids": selected_options},
                        }
                    )
                continue

            for option_id in selected_options:
                for binding in _normalize_bindings(option_bindings.get(option_id)):
                    variables.append(
                        {
                            "target": str(binding.get("target") or ""),
                            "value": binding.get("value", option_id),
                            "source": {"page_uuid": page.page_uuid, "block_id": block_id, "option_id": option_id},
                        }
                    )

    return variables


def _question_variable_bindings(page: LearningPage, question: dict) -> dict:
    completion = question.get("completion")
    if isinstance(completion, dict):
        bindings = completion.get("variable_bindings") or completion.get("variableBindings")
        if isinstance(bindings, dict) and bindings:
            return bindings
    return _variable_bindings(page)


def _target_value_type(db_session: Session, org_id: int | None, target: str) -> str:
    if target in _SAFE_IMAGE_VARIABLE_TARGETS:
        return "image"
    if target in _SAFE_CORE_VARIABLE_TARGETS or target == "user.email":
        return "text"
    if target.startswith("user.details.variables.") and org_id is not None:
        variable_key = target[len("user.details.variables."):]
        variable = db_session.exec(
            select(LearningVariable).where(LearningVariable.org_id == org_id, LearningVariable.key == variable_key)
        ).first()
        if variable:
            return str(variable.value_type or "text")
    return "text"


def _is_variable_value_type_compatible(expected: str, actual: str, value) -> bool:
    if expected == "image":
        return actual == "image" and bool(str(value or "").strip())
    if actual == "image":
        return False
    return expected in ("text", "number", "boolean", "option")


def _is_safe_variable_target(target: str, value, user: User, db_session: Session, org_id: int | None = None, value_type: str = "text", allow_email_write: bool = False) -> tuple[bool, str | None]:
    expected_type = _target_value_type(db_session, org_id, target)
    if not _is_variable_value_type_compatible(expected_type, value_type, value):
        return False, f"{expected_type.title()} variables cannot store {value_type} responses"
    if target in _SAFE_IMAGE_VARIABLE_TARGETS:
        return True, None
    if target in _SAFE_CORE_VARIABLE_TARGETS:
        return True, None
    if target == "user.email":
        current_email = (user.email or "").strip().lower()
        next_email = str(value or "").strip().lower()
        if allow_email_write or (next_email and next_email == current_email):
            return True, None
        return False, "Email can only be confirmed, not overwritten here"
    for prefix in _SAFE_VARIABLE_PREFIXES:
        if target.startswith(prefix):
            tail = target[len(prefix):]
            segments = tail.split(".")
            if any(segment in _BLOCKED_VARIABLE_SEGMENTS or segment.startswith("_") for segment in segments):
                return False, "Variable target is not writable"
            return True, None
    return False, "Variable target is not writable"


def _set_nested_value(root: dict, segments: list[str], value) -> dict:
    next_root = deepcopy(root) if isinstance(root, dict) else {}
    cursor = next_root
    for segment in segments[:-1]:
        existing = cursor.get(segment)
        if not isinstance(existing, dict):
            existing = {}
            cursor[segment] = existing
        cursor = existing
    cursor[segments[-1]] = value
    return next_root


def _apply_learning_variables_to_user(
    db_session: Session,
    user: User,
    variables: list[dict],
    org_id: int | None = None,
    allow_email_write: bool = False,
) -> tuple[list[dict], list[dict]]:
    applied: list[dict] = []
    skipped: list[dict] = []

    for variable in variables:
        target = str(variable.get("target") or "")
        value = variable.get("value")
        value_type = str(variable.get("value_type") or "text")
        safe, reason = _is_safe_variable_target(target, value, user, db_session, org_id=org_id, value_type=value_type, allow_email_write=allow_email_write)
        if not safe:
            skipped.append({**variable, "reason": reason or "Target is not writable"})
            continue

        if target == "user.first_name":
            user.first_name = str(value or "").strip()
        elif target == "user.last_name":
            user.last_name = str(value or "").strip()
        elif target == "user.bio":
            user.bio = str(value or "").strip()
        elif target == "user.avatar_image":
            user.avatar_image = str(value or "").strip()
        elif target == "user.email":
            user.email = str(value or "").strip()
        elif target.startswith("user.profile."):
            segments = target[len("user.profile."):].split(".")
            user.profile = _set_nested_value(user.profile or {}, segments, value)
        elif target.startswith("user.details."):
            segments = target[len("user.details."):].split(".")
            user.details = _set_nested_value(user.details or {}, segments, value)
        else:
            skipped.append({**variable, "reason": "Target is not writable"})
            continue

        applied.append(variable)

    if applied:
        user.update_date = _now()
        db_session.add(user)
    return applied, skipped


def _normalize_question_answers(questions: list[dict], answer: dict) -> dict[str, dict]:
    """Split a page answer into per-question-block answers.

    New payloads carry `answer.questions[block_id]`; legacy payloads are the
    single question's answer at the top level.
    """
    raw = (answer or {}).get("questions")
    if isinstance(raw, dict):
        return {str(block_id): value if isinstance(value, dict) else {} for block_id, value in raw.items()}
    if len(questions) == 1:
        return {str(questions[0].get("id") or ""): answer or {}}
    return {}


def _grade_mcq_block(page: LearningPage, question: dict, answer: dict) -> dict:
    content = question.get("content") or {}
    selected = _normalize_mcq_answer(answer or {})
    _validate_mcq_answer(content, _block_completion(page, question), selected, answer)
    scoring = _block_scoring(page, question)
    correct_options = {str(value) for value in scoring.get("correct_option_ids") or scoring.get("correctOptionIds") or []}
    is_correct = set(selected) == correct_options if correct_options else None
    points = _as_float(scoring.get("points"), 1.0)
    score = points if is_correct else 0.0 if is_correct is not None else None
    return {
        "kind": "multiple_choice",
        "selected": selected,
        "option_ids": selected,
        "correct_option_ids": sorted(correct_options),
        "is_correct": is_correct,
        "score": score,
        "points": points,
        "max_score": points,
        "grading_status": "graded",
    }


def _grade_text_block(page: LearningPage, question: dict, answer: dict) -> dict:
    content = question.get("content") or {}
    completion = _block_completion(page, question)
    inputs = _validate_text_answer(content, completion, _normalize_text_answer(content, answer or {}))
    scoring = _block_scoring(page, question)
    mode = scoring.get("mode") or ("accepted_answers" if scoring.get("accepted_answers") else "off")
    completion_inputs = completion.get("inputs") or {}
    per_input_points = [
        _as_float((completion_inputs.get(input_id) or {}).get("points"), 0.0)
        for input_id in inputs.keys()
        if (completion_inputs.get(input_id) or {}).get("points") is not None
    ]
    points = sum(per_input_points) if per_input_points else _as_float(scoring.get("points"), 1.0)
    first_text = next((item.get("text", "") for item in inputs.values()), "")
    base = {
        "kind": "text_input",
        "inputs": inputs,
        "text": first_text,
        "points": points,
        "max_score": points,
    }

    if mode == "manual":
        return {**base, "is_correct": None, "score": None, "grading_status": "pending"}
    if mode == "completion":
        return {**base, "is_correct": True, "score": points, "grading_status": "graded"}

    expected = [str(value).strip().lower() for value in scoring.get("accepted_answers", [])]
    if mode == "accepted_answers" and expected:
        is_correct = first_text.lower() in expected
        return {**base, "is_correct": is_correct, "score": points if is_correct else 0.0, "grading_status": "graded"}

    return {**base, "is_correct": None, "score": None, "grading_status": "not_required"}


def _grade_image_block(page: LearningPage, question: dict, answer: dict) -> dict:
    completion = _block_completion(page, question)
    image = _validate_image_answer(completion, answer or {})
    scoring = _block_scoring(page, question)
    mode = scoring.get("mode") or "manual"
    points = _as_float(scoring.get("points"), 1.0)
    base = {
        "kind": "image_upload",
        **image,
        "points": points,
        "max_score": points,
    }
    if mode == "manual":
        return {**base, "is_correct": None, "score": None, "grading_status": "pending"}
    if mode == "completion":
        return {**base, "is_correct": True, "score": points, "grading_status": "graded"}
    return {**base, "is_correct": None, "score": None, "grading_status": "not_required"}


def _grade_answer(page: LearningPage, answer: dict) -> tuple[bool | None, float | None, str | None, dict]:
    questions = _question_blocks(page)
    if not questions:
        return None, None, None, {"page_uuid": page.page_uuid}

    answers = _normalize_question_answers(questions, answer)
    sub_results: dict[str, dict] = {}
    for question in questions:
        block_id = str(question.get("id") or "")
        sub_answer = answers.get(block_id) or {}
        if question.get("kind") in {"multiple_choice", "categorized_multi_select"}:
            sub_results[block_id] = _grade_mcq_block(page, question, sub_answer)
        elif question.get("kind") == "text_input":
            sub_results[block_id] = _grade_text_block(page, question, sub_answer)
        elif question.get("kind") == "image_upload":
            sub_results[block_id] = _grade_image_block(page, question, sub_answer)

    subs = list(sub_results.values())
    if not subs:
        return None, None, None, {"page_uuid": page.page_uuid}

    total_points = sum(_as_float(sub.get("points"), 0.0) for sub in subs)
    pending = any(sub.get("grading_status") == "pending" for sub in subs)
    correctness = [sub.get("is_correct") for sub in subs if sub.get("is_correct") is not None]
    is_correct = None if pending or not correctness else all(correctness)
    scores = [sub.get("score") for sub in subs]
    score = None if pending or all(value is None for value in scores) else sum(_as_float(value, 0.0) for value in scores if value is not None)
    grading_status = "pending" if pending else (
        "graded" if any(sub.get("grading_status") == "graded" for sub in subs) else "not_required"
    )

    result: dict = {
        "page_uuid": page.page_uuid,
        "questions": sub_results,
        "points": total_points,
        "max_score": total_points,
        "grading_status": grading_status,
    }

    if len(subs) == 1:
        only = subs[0]
        result = {
            **{key: value for key, value in only.items() if key not in ("kind", "is_correct", "score")},
            **result,
        }
        if pending:
            feedback_key = "pending"
        elif only.get("kind") in {"multiple_choice", "categorized_multi_select"}:
            selected = only.get("option_ids") or []
            feedback_key = selected[0] if len(selected) == 1 else ("correct" if is_correct else "incorrect")
        else:
            feedback_key = "correct" if is_correct is True else "incorrect" if is_correct is False else "complete"
        return is_correct, score, feedback_key, result

    feedback_key = "pending" if pending else "correct" if is_correct is True else "incorrect" if is_correct is False else "complete"
    return is_correct, score, feedback_key, result


def _ensure_activity_run(db_session: Session, run: LearningRun, activity_id: int) -> LearningActivityRun:
    activity_run = db_session.exec(
        select(LearningActivityRun).where(
            LearningActivityRun.run_id == run.id,
            LearningActivityRun.activity_id == activity_id,
        )
    ).first()
    if activity_run:
        return activity_run
    activity = db_session.get(LearningActivity, activity_id)
    settings = deepcopy(activity.settings or {}) if activity else {}
    activity_run = LearningActivityRun(
        run_id=run.id or 0,
        activity_id=activity_id,
        status=LearningRunStatus.IN_PROGRESS,
        data={"definition": {"version": 1, "flow": settings.get("flow"), "outcomes": settings.get("outcomes")}},
    )
    db_session.add(activity_run)
    db_session.commit()
    db_session.refresh(activity_run)
    return activity_run


def _activity_grading_settings(activity: LearningActivity) -> dict:
    settings = activity.settings or {}
    grading = settings.get("grading") or {}
    if not isinstance(grading, dict):
        grading = {}
    mode = grading.get("mode") or settings.get("grading_mode") or "completion"
    return {
        "mode": mode if mode in ("completion", "pass_fail") else "completion",
        "minimum_score_percent": max(0.0, min(100.0, _as_float(grading.get("minimum_score_percent"), 70.0))),
        "success_message": str(grading.get("success_message") or "Activity passed."),
        "failure_message": str(grading.get("failure_message") or "You need a higher score to complete this activity."),
    }


def _activity_score_summary(db_session: Session, run: LearningRun, activity: LearningActivity) -> dict:
    pages = db_session.exec(
        select(LearningPage).where(
            LearningPage.activity_id == activity.id,
            LearningPage.required == True,
        )
    ).all()
    latest_attempts = _latest_attempts(db_session, run.id or 0)
    earned = 0.0
    possible = 0.0
    pending_manual_grades = 0

    for page in pages:
        questions = _question_blocks(page)
        if not questions:
            continue
        attempt = latest_attempts.get(page.id or 0)
        configured_points = sum(_question_block_points(page, question) for question in questions)
        if configured_points <= 0:
            continue
        possible += configured_points
        if not attempt:
            continue
        if (attempt.result or {}).get("grading_status") == "pending":
            pending_manual_grades += 1
            continue
        earned += _as_float(attempt.score, 0.0)

    percent = round((earned / possible) * 100, 1) if possible > 0 else 100.0
    return {
        "score": earned,
        "max_score": possible,
        "score_percent": percent,
        "pending_manual_grades": pending_manual_grades,
    }


def _question_block_points(page: LearningPage, question: dict) -> float:
    scoring = _block_scoring(page, question)
    points = _as_float(scoring.get("points"), 1.0)
    if question.get("kind") == "text_input":
        completion_inputs = _block_completion(page, question).get("inputs") or {}
        input_points = [
            _as_float((rules or {}).get("points"), 0.0)
            for rules in completion_inputs.values()
            if isinstance(rules, dict) and (rules or {}).get("points") is not None
        ]
        if input_points:
            points = sum(input_points)
    return max(0.0, points)


def _activity_meets_completion_rules(db_session: Session, run: LearningRun, activity: LearningActivity) -> tuple[bool, dict]:
    grading = _activity_grading_settings(activity)
    summary = _activity_score_summary(db_session, run, activity)
    if summary["pending_manual_grades"] > 0:
        return False, {**summary, "grading": grading, "passed": False, "reason": "pending_manual_grades"}
    if grading["mode"] != "pass_fail":
        return True, {**summary, "grading": grading, "passed": True}
    if summary["max_score"] <= 0:
        return False, {**summary, "grading": grading, "passed": False, "reason": "no_scored_pages"}
    passed = summary["score_percent"] >= grading["minimum_score_percent"]
    return passed, {**summary, "grading": grading, "passed": passed}


def _has_pending_required_manual_grades(db_session: Session, run: LearningRun) -> bool:
    required_pages = db_session.exec(
        select(LearningPage).where(
            LearningPage.badge_id == run.badge_id,
            LearningPage.required == True,
        )
    ).all()
    manual_pages = [
        page
        for page in required_pages
        if any(
            question.get("kind") in ("text_input", "image_upload") and _block_scoring(page, question).get("mode") == "manual"
            for question in _question_blocks(page)
        )
    ]
    if not manual_pages:
        return False

    latest_attempts_by_page_id = _latest_attempts(db_session, run.id or 0)
    for page in manual_pages:
        progress = db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.page_id == page.id,
                LearningPageProgress.complete == True,
            )
        ).first()
        if not progress:
            continue
        attempt = latest_attempts_by_page_id.get(page.id or 0)
        if not attempt or (attempt.result or {}).get("grading_status") != "graded":
            return True
    return False


def _issue_award_if_complete(request: Request, db_session: Session, run: LearningRun) -> LearningBadgeAward | None:
    if run.user_id is None:
        return None
    required_activities = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.path_id == run.path_id,
            LearningActivity.required == True,
        )
    ).all()
    if not required_activities:
        return None
    completed_activity_ids = {
        item.activity_id
        for item in db_session.exec(
            select(LearningActivityRun).where(
                LearningActivityRun.run_id == run.id,
                LearningActivityRun.status == LearningRunStatus.COMPLETED,
            )
        ).all()
    }
    if not all((activity.id or 0) in completed_activity_ids for activity in required_activities):
        return None
    if _has_pending_required_manual_grades(db_session, run):
        return None

    award = db_session.exec(
        select(LearningBadgeAward).where(
            LearningBadgeAward.badge_id == run.badge_id,
            LearningBadgeAward.user_id == run.user_id,
        )
    ).first()
    if award:
        return award

    now = datetime.utcnow()
    award = LearningBadgeAward(
        award_uuid=f"award_{uuid4()}",
        badge_id=run.badge_id,
        run_id=run.id,
        org_id=run.org_id,
        issuing_org_id=run.issuing_org_id,
        user_id=run.user_id,
        source=LearningAwardSource.PATH_COMPLETION,
        issued_at=now,
        evidence={"run_uuid": run.run_uuid},
        creation_date=str(now),
        update_date=str(now),
    )
    run.status = LearningRunStatus.COMPLETED
    run.completed_at = now
    run.update_date = str(now)
    db_session.add(run)
    db_session.add(award)
    db_session.commit()
    db_session.refresh(award)
    return award


def _merge_onboarding_variable_bindings(page: LearningPage, defaults: dict) -> None:
    def merged_bindings(completion: dict) -> dict:
        existing = completion.get("variable_bindings") or {}
        if not isinstance(existing, dict):
            existing = {}
        for section, values in defaults.items():
            target_section = existing.get(section)
            if not isinstance(target_section, dict):
                target_section = {}
            for key, binding in values.items():
                if not target_section.get(key):
                    target_section[key] = binding
            existing[section] = target_section
        return existing

    question = _question_block(page)
    if question and isinstance(question.get("completion"), dict) and question.get("completion"):
        content = deepcopy(page.content or {})
        block = find_question_block(content)
        if block:
            completion = block.get("completion") or {}
            completion["variable_bindings"] = merged_bindings(completion)
            block["completion"] = completion
            page.content = content
            return

    completion = deepcopy(page.completion or {})
    completion["variable_bindings"] = merged_bindings(completion)
    page.completion = completion


def _ensure_launch_ready_activity(
    db_session: Session, *, path: LearningPath, badge: LearningBadge, org_id: int,
    key: str, order: int, title: str, description: str, pages: list[dict], outcomes: list[dict], flow: dict | None = None,
) -> LearningActivity:
    now, activity_uuid = _now(), LAUNCH_READY_ACTIVITY_UUIDS[key]
    if key == "traits":
        pages = deepcopy(pages)
        outcomes = deepcopy(outcomes)
        strength_page = pages[0]
        strength_page["kind"] = "categorized_multi_select"
        strength_categories = {"creative": "Creating", "curious": "Thinking", "reliable": "Execution", "collaborative": "Working With Others", "determined": "Execution", "empathetic": "Working With Others", "resourceful": "Thinking", "patient": "Working With Others", "bold": "Execution", "thoughtful": "Thinking"}
        for option in (strength_page.get("content") or {}).get("options") or []:
            option["category"] = strength_categories.get(option.get("id"), "Strengths")
        values_page_uuid, values_block_id = "learning_page_system_onboarding_values", "blk_launch_values"
        values = (("Personal Qualities", "Authenticity"), ("Personal Qualities", "Mindfulness"), ("Relationships", "Kindness"), ("Relationships", "Empathy"), ("Growth", "Learning"), ("Growth", "Courage"), ("Impact", "Service"), ("Impact", "Community"), ("Impact", "Justice"), ("Impact", "Leadership"))
        pages.insert(1, {"page_uuid": values_page_uuid, "block_id": values_block_id, "title": "What matters most to you?", "kind": "categorized_multi_select", "content": {"label": "Choose the values you want people to understand about you.", "options": [{"id": label.lower(), "text": label, "category": category} for category, label in values]}, "completion": {"min_selections": 2, "max_selections": 5}})
        outcomes.append({"id": "set-values", "type": "set_traits", "trait_type": "value", "values": {"$source": "answer", "path": f"{values_page_uuid}.answer.questions.{values_block_id}.option_ids", "default": []}})
    activity = db_session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).first()
    settings = {"system_required": True, "estimated_minutes": 3, "capability": key, "outcomes": {"version": 1, "actions": outcomes}}
    if flow: settings["flow"] = flow
    if not activity:
        activity = LearningActivity(path_id=path.id or 0, badge_id=badge.id or 0, org_id=org_id, title=title, description=description, thumbnail_image=LAUNCH_READY_DEFAULT_IMAGES[key], icon="sparkles", order=order, required=True, published=True, settings=settings, activity_uuid=activity_uuid, creation_date=now, update_date=now)
        db_session.add(activity); db_session.flush()
    else:
        activity.path_id, activity.badge_id, activity.org_id = path.id or 0, badge.id or 0, org_id
        activity.title, activity.description = title, description
        activity.thumbnail_image = activity.thumbnail_image or LAUNCH_READY_DEFAULT_IMAGES[key]
        activity.order = order
        activity.required, activity.published = True, True
        merged_settings = {**(activity.settings or {}), **settings}
        if flow is None:
            merged_settings.pop("flow", None)
        activity.settings = merged_settings
        activity.update_date = now
        db_session.add(activity); db_session.flush()
    if key == "links":
        activity.required = False
        activity.published = False
        activity.update_date = now
        db_session.add(activity)
        db_session.flush()
        return activity
    for page_order, spec in enumerate(pages, start=1):
        page = db_session.exec(select(LearningPage).where(LearningPage.page_uuid == spec["page_uuid"])).first()
        content = {"version": STANDARD_CONTENT_VERSION, "blocks": deepcopy(spec.get("blocks") or [text_block(heading_node(spec["title"]), block_id=f"{spec['block_id']}_heading")])}
        if spec.get("kind") and not spec.get("blocks"):
            content["blocks"].append(question_block(spec["kind"], spec["content"], block_id=spec["block_id"], scoring={"mode": "off", "points": 0}, completion=spec.get("completion") or {}))
        elif not spec.get("blocks"):
            content["blocks"].append(text_block(paragraph_node(spec.get("body") or "Continue when you're ready."), block_id=f"{spec['block_id']}_body"))
        if spec.get("action_label"):
            content["action_label"] = spec["action_label"]
        if not page:
            page = LearningPage(activity_id=activity.id or 0, badge_id=badge.id or 0, org_id=org_id, page_type=LearningPageType.STANDARD, title=spec["title"], order=page_order, required=spec.get("required", True), content=content, page_uuid=spec["page_uuid"], creation_date=now, update_date=now)
        else:
            page.activity_id, page.badge_id, page.org_id, page.order, page.required = activity.id or 0, badge.id or 0, org_id, page_order, spec.get("required", True)
            page.page_type, page.title, page.content = LearningPageType.STANDARD, spec["title"], content
            page.update_date = now
        db_session.add(page)
    desired_page_uuids = {spec["page_uuid"] for spec in pages}
    stale_system_pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all()
    for stale_page in stale_system_pages:
        if stale_page.page_uuid.startswith("learning_page_system_onboarding_") and stale_page.page_uuid not in desired_page_uuids:
            db_session.delete(stale_page)
    if stale_system_pages:
        db_session.flush()
    # Launch Ready is system-managed and can evolve between learner sessions. Keep
    # snapshots without applied outcomes aligned so a removed branch cannot strand
    # a learner or leave a prematurely completed run carrying obsolete actions.
    # Matching page progress and answers remain intact.
    for activity_run in db_session.exec(
        select(LearningActivityRun).where(LearningActivityRun.activity_id == activity.id)
    ).all():
        run_data = deepcopy(activity_run.data or {})
        if run_data.get("action_receipts"):
            continue
        was_completed = activity_run.status == LearningRunStatus.COMPLETED
        definition = deepcopy(run_data.get("definition") or {})
        definition.update({"version": 1, "flow": flow, "outcomes": settings["outcomes"]})
        run_data["definition"] = definition
        activity_run.data = run_data
        activity_run.status = LearningRunStatus.IN_PROGRESS
        activity_run.completed_at = None
        db_session.add(activity_run)
        if was_completed and pages:
            final_page_uuid = pages[-1]["page_uuid"]
            final_page = db_session.exec(select(LearningPage).where(LearningPage.page_uuid == final_page_uuid)).first()
            if final_page:
                final_progress = db_session.exec(select(LearningPageProgress).where(
                    LearningPageProgress.run_id == activity_run.run_id,
                    LearningPageProgress.page_id == final_page.id,
                )).first()
                if final_progress:
                    final_progress.complete = False
                    final_progress.completed_at = None
                    final_progress.data = {**(final_progress.data or {}), "invalidated_by_definition_update": True}
                    db_session.add(final_progress)
    db_session.flush()
    return activity


def ensure_onboarding_learning_badge(db_session: Session) -> tuple[Organization, BadgeCollection, LearningBadge, LearningActivity]:
    owner_org = _get_owner_org(db_session)
    now = _now()

    collection = db_session.exec(
        select(BadgeCollection).where(BadgeCollection.collection_uuid == ONBOARDING_COLLECTION_UUID)
    ).first()
    if not collection:
        collection = BadgeCollection(
            org_id=owner_org.id or 0,
            name="Onboarding",
            description="System collection for the editable onboarding badge.",
            public=True,
            hidden=False,
            protected=True,
            system_type=LEARNING_SYSTEM_TYPE_ONBOARDING,
            collection_uuid=ONBOARDING_COLLECTION_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(collection)
        db_session.commit()
        db_session.refresh(collection)
    else:
        collection.org_id = owner_org.id or collection.org_id
        collection.protected = True
        collection.system_type = LEARNING_SYSTEM_TYPE_ONBOARDING
        collection.public = True
        collection.hidden = False
        collection.update_date = now
        db_session.add(collection)

    badge = db_session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == ONBOARDING_BADGE_UUID)).first()
    if not badge:
        badge = LearningBadge(
            org_id=owner_org.id or 0,
            collection_id=collection.id,
            name="Welcome Onboarding",
            description="Set up your profile and goals.",
            about="A short onboarding path that helps personalize Launch.",
            criteria="Complete the onboarding activity.",
            public=True,
            status=LearningBadgeStatus.PUBLISHED,
            protected=True,
            system_type=LEARNING_SYSTEM_TYPE_ONBOARDING,
            direct_conferral_enabled=False,
            badge_uuid=ONBOARDING_BADGE_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(badge)
        db_session.commit()
        db_session.refresh(badge)
    else:
        badge.org_id = owner_org.id or badge.org_id
        badge.collection_id = collection.id
        badge.public = True
        badge.status = LearningBadgeStatus.PUBLISHED
        badge.protected = True
        badge.system_type = LEARNING_SYSTEM_TYPE_ONBOARDING
        badge.update_date = now
        db_session.add(badge)

    path = _get_path_for_badge(db_session, badge)
    path.org_id = owner_org.id or path.org_id
    path.update_date = now
    db_session.add(path)

    activity = db_session.exec(
        select(LearningActivity).where(LearningActivity.activity_uuid == ONBOARDING_ACTIVITY_UUID)
    ).first()
    if not activity:
        activity = LearningActivity(
            path_id=path.id or 0,
            badge_id=badge.id or 0,
            org_id=owner_org.id or 0,
            title="Welcome",
            description="Tell us a little about yourself.",
            thumbnail_image=LAUNCH_READY_DEFAULT_IMAGES["identity"],
            icon="sparkles",
            order=1,
            required=True,
            published=True,
            settings={"system_required": True},
            activity_uuid=ONBOARDING_ACTIVITY_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(activity)
        db_session.commit()
        db_session.refresh(activity)
    else:
        activity.path_id = path.id or activity.path_id
        activity.badge_id = badge.id or activity.badge_id
        activity.org_id = owner_org.id or activity.org_id
        activity.order = 1
        activity.required = True
        activity.published = True
        activity.thumbnail_image = activity.thumbnail_image or LAUNCH_READY_DEFAULT_IMAGES["identity"]
        activity.settings = {**(activity.settings or {}), "system_required": True}
        activity.update_date = now
        db_session.add(activity)

    name_bindings = {
        "inputs": {
            "first_name": {"target": "user.first_name"},
            "last_name": {"target": "user.last_name"},
        }
    }
    name_page = db_session.exec(select(LearningPage).where(LearningPage.page_uuid == ONBOARDING_NAME_PAGE_UUID)).first()
    if not name_page:
        name_page = LearningPage(
            activity_id=activity.id or 0,
            badge_id=badge.id or 0,
            org_id=owner_org.id or 0,
            page_type=LearningPageType.STANDARD,
            title="What should we call you?",
            order=1,
            required=True,
            content={
                "version": STANDARD_CONTENT_VERSION,
                "blocks": [
                    text_block(paragraph_node("Tell us your first and last name."), block_id="blk_onboarding_name_intro"),
                    question_block(
                        "text_input",
                        {
                            "inputs": [
                                {"id": "first_name", "section_id": "onboarding_name", "label": "First name", "placeholder": "First name", "variant": "single_line", "width": "half"},
                                {"id": "last_name", "section_id": "onboarding_name", "label": "Last name", "placeholder": "Last name", "variant": "single_line", "width": "half"},
                            ]
                        },
                        block_id="blk_onboarding_name_question",
                        scoring={"mode": "off", "points": 0},
                        completion={
                            "inputs": {
                                "first_name": {"required": True, "min_words": 1, "max_words": 3},
                                "last_name": {"required": True, "min_words": 1, "max_words": 4},
                            },
                            "variable_bindings": name_bindings,
                        },
                    ),
                ],
            },
            page_uuid=ONBOARDING_NAME_PAGE_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(name_page)
    else:
        name_page.activity_id = activity.id or name_page.activity_id
        name_page.badge_id = badge.id or name_page.badge_id
        name_page.org_id = owner_org.id or name_page.org_id
        name_page.order = 1
        name_page.required = True
        _merge_onboarding_variable_bindings(name_page, name_bindings)
        name_page.update_date = now
        db_session.add(name_page)

    goal_options = [
        {"id": "higher_education", "text": "Get into school or training"},
        {"id": "employment", "text": "Find work or an internship"},
        {"id": "self_starting", "text": "Grow something I’m building"},
        {"id": "show_people", "text": "Show people what I can do"},
        {"id": "not_sure", "text": "Figure out what comes next"},
    ]
    goal_bindings = {
        "options": {
            option["id"]: [
                {"target": "user.profile.onboarding.next_step", "value": option["id"]},
                {"target": "user.details.onboarding.next_step", "value": option["id"]},
            ]
            for option in goal_options
        }
    }
    goal_page = db_session.exec(select(LearningPage).where(LearningPage.page_uuid == ONBOARDING_GOAL_PAGE_UUID)).first()
    if not goal_page:
        goal_page = LearningPage(
            activity_id=activity.id or 0,
            badge_id=badge.id or 0,
            org_id=owner_org.id or 0,
            page_type=LearningPageType.STANDARD,
            title="What are you building toward?",
            order=2,
            required=True,
            content={
                "version": STANDARD_CONTENT_VERSION,
                "blocks": [
                    text_block(heading_node("What are you building toward?"), block_id="blk_onboarding_goal_heading"),
                    text_block(paragraph_node("This stays private. We use it to personalize your Launch Ready path and examples."), block_id="blk_onboarding_goal_private"),
                    question_block(
                        "multiple_choice",
                        {"options": goal_options},
                        block_id="blk_onboarding_goal_question",
                        scoring={"mode": "off", "points": 0, "correct_option_ids": [], "score_policy": "exact_match"},
                        completion={
                            "min_selections": 1,
                            "max_selections": 1,
                            "variable_bindings": goal_bindings,
                        },
                    ),
                ],
            },
            page_uuid=ONBOARDING_GOAL_PAGE_UUID,
            creation_date=now,
            update_date=now,
        )
        db_session.add(goal_page)
    else:
        goal_page.activity_id = activity.id or goal_page.activity_id
        goal_page.badge_id = badge.id or goal_page.badge_id
        goal_page.org_id = owner_org.id or goal_page.org_id
        goal_page.order = 2
        goal_page.required = True
        goal_page.title = "What are you building toward?"
        _merge_onboarding_variable_bindings(goal_page, goal_bindings)
        goal_page.update_date = now
        db_session.add(goal_page)

    def answer(page_uuid: str, block_id: str, suffix: str, default=None, transform=None) -> dict:
        value = {"$source": "answer", "path": f"{page_uuid}.answer.questions.{block_id}.{suffix}"}
        if default is not None: value["default"] = default
        if transform: value["transform"] = transform
        return value

    profile_photo_page, profile_photo_block = "learning_page_system_onboarding_profile_photo", "blk_launch_profile_photo"
    profile_details_page, profile_details_block = "learning_page_system_onboarding_profile_details", "blk_launch_profile_details"
    profile_review_page = "learning_page_system_onboarding_profile_review"
    stale_profile_activities = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.badge_id == badge.id,
            func.lower(LearningActivity.title).in_(("complete your profile", "complete your portfolio")),  # type: ignore
            LearningActivity.activity_uuid.notin_(set(LAUNCH_READY_ACTIVITY_UUIDS.values())),  # type: ignore
        )
    ).all()
    for stale_activity in stale_profile_activities:
        db_session.delete(stale_activity)
    if stale_profile_activities:
        db_session.flush()
    _ensure_launch_ready_activity(
        db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="profile", order=2,
        title="Make it feel like you", description="Build an introduction that feels like you and preview the real result.",
        pages=[
            {"page_uuid": profile_photo_page, "block_id": profile_photo_block, "title": "Choose how you show up", "kind": "image_upload", "content": {"label": "Add a profile photo if you want. You can skip this, and you can change it later."}, "completion": {"required": False, "variable_bindings": {"image": {"target": "user.avatar_image", "value_type": "image"}}}},
            {"page_uuid": profile_details_page, "block_id": profile_details_block, "title": "Write your introduction", "kind": "text_input", "content": {"inputs": [{"id": "display_name", "label": "Display name", "placeholder": "How you want people to know you", "variant": "single_line", "height": 48}, {"id": "tagline", "label": "Tagline", "placeholder": "Student, maker, and community builder", "variant": "single_line", "height": 48}, {"id": "bio", "label": "Bio", "placeholder": "Share what you’re interested in, what you’re working toward, and what you want people to know.", "variant": "short_answer", "height": 200}, {"id": "location", "label": "Location (optional)", "placeholder": "City or region", "variant": "single_line", "height": 48}]}, "completion": {"inputs": {"display_name": {"required": True, "min_words": 1}, "bio": {"required": True, "min_words": 2}, "tagline": {"required": True, "min_words": 1}, "location": {"required": False}}}},
            {"page_uuid": profile_review_page, "block_id": "blk_launch_profile_review", "title": "This is how you’ll show up", "action_label": "Add this to my portfolio", "blocks": [text_block(heading_node("This is how you’ll show up"), block_id="blk_profile_review_heading"), text_block(paragraph_node("This preview uses the same identity treatment as your portfolio."), block_id="blk_profile_review_intro"), {"id": "blk_profile_review_header", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "identity_header", "bindings": {"display_name": {"source": "answer", "path": f"{profile_details_page}.answer.questions.{profile_details_block}.inputs.display_name.text", "fallback": "Your name"}, "headline": {"source": "answer", "path": f"{profile_details_page}.answer.questions.{profile_details_block}.inputs.tagline.text", "fallback": "Your tagline"}, "short_bio": {"source": "answer", "path": f"{profile_details_page}.answer.questions.{profile_details_block}.inputs.bio.text", "fallback": "Your introduction"}, "location_label": {"source": "answer", "path": f"{profile_details_page}.answer.questions.{profile_details_block}.inputs.location.text", "fallback": ""}, "avatar_url": {"source": "answer", "path": f"{profile_photo_page}.answer.questions.{profile_photo_block}.url", "fallback_binding": {"source": "variable", "path": "user.avatar_image", "fallback": ""}}}}}, {"id": "blk_profile_review_details", "type": "button", "design": {"width": 48, "variant": "secondary", "group": "profile_review_actions"}, "content": {"label": "Change my introduction", "destination_page_uuid": profile_details_page}}, {"id": "blk_profile_review_photo", "type": "button", "design": {"width": 48, "variant": "secondary", "group": "profile_review_actions"}, "content": {"label": "Choose another photo", "destination_page_uuid": profile_photo_page}}]},
        ],
        outcomes=[{"id": "set-profile-details", "type": "set_portfolio_fields", "fields": {"display_name": answer(profile_details_page, profile_details_block, "inputs.display_name.text"), "short_bio": answer(profile_details_page, profile_details_block, "inputs.bio.text"), "headline": answer(profile_details_page, profile_details_block, "inputs.tagline.text"), "location_label": answer(profile_details_page, profile_details_block, "inputs.location.text")}}],
    )

    journey_kind_page, journey_kind_block = "learning_page_system_onboarding_journey_kind", "blk_launch_journey_kind"
    journey_page, journey_block = "learning_page_system_onboarding_journey", "blk_launch_journey"
    journey_photo_page, journey_photo_block = "learning_page_system_onboarding_journey_photo", "blk_launch_journey_photo"
    journey_review_page = "learning_page_system_onboarding_journey_review"
    journey_pages = [
        {"page_uuid": journey_kind_page, "block_id": journey_kind_block, "title": "Where are you growing right now?", "kind": "multiple_choice", "content": {"label": "Choose what fits best — there’s no wrong kind of experience.", "options": [
            {"id": "education", "text": "School or college"}, {"id": "employment", "text": "Job or internship"},
            {"id": "training", "text": "Program or training"}, {"id": "volunteering", "text": "Volunteering or community"},
            {"id": "experience", "text": "Building something"}, {"id": "other", "text": "Exploring what’s next"},
        ]}, "completion": {"min_selections": 1, "max_selections": 1}},
        {"page_uuid": journey_page, "block_id": journey_block, "title": "Make this chapter yours", "kind": "text_input", "content": {"inputs": [
            {"id": "title", "section_id": "title", "label": "What should we call this chapter?", "placeholder": "My current chapter", "variant": "single_line", "height": 48, "adaptive": {"binding": {"source": "answer", "path": f"{journey_kind_page}.answer.questions.{journey_kind_block}.option_ids.0"}, "values": {"education": {"placeholder": "My high school years"}, "employment": {"placeholder": "My first internship"}, "training": {"placeholder": "Learning a new skill"}, "volunteering": {"placeholder": "Showing up for my community"}, "experience": {"placeholder": "Building something that matters"}, "other": {"placeholder": "Exploring what’s next"}}}},
            {"id": "organization", "section_id": "place", "label": "Organization or place", "placeholder": "Name of the place", "variant": "single_line", "width": "half", "height": 48, "adaptive": {"binding": {"source": "answer", "path": f"{journey_kind_page}.answer.questions.{journey_kind_block}.option_ids.0"}, "values": {"education": {"label": "School or program", "placeholder": "Lincoln High School"}, "employment": {"label": "Company or organization", "placeholder": "Your workplace"}, "training": {"label": "Program or organization", "placeholder": "Your program"}, "volunteering": {"label": "Community or organization", "placeholder": "Where you volunteer"}, "experience": {"label": "Project, group, or place", "placeholder": "Where this is happening"}, "other": {"label": "Place or community (optional)", "placeholder": "Anywhere that matters"}}}},
            {"id": "location", "section_id": "place", "label": "Location", "placeholder": "Portland, Oregon", "variant": "single_line", "width": "half", "height": 48},
            {"id": "start_date", "section_id": "start_date", "label": "When did you start?", "placeholder": "", "input_type": "month", "variant": "single_line", "height": 48},
            {"id": "summary", "section_id": "summary", "label": "What are you learning, doing, or excited about?", "placeholder": "I’m learning about plants and environmental science.", "variant": "short_answer", "height": 150},
        ]}, "completion": {"inputs": {"title": {"required": True, "min_words": 1}, "organization": {"required": False}, "location": {"required": False}, "start_date": {"required": False}, "summary": {"required": True, "min_words": 2}}}},
        {"page_uuid": journey_photo_page, "block_id": journey_photo_block, "title": "Add a picture to this chapter", "kind": "image_upload", "content": {"label": "A school, workspace, team, event, creation, or anything that represents this moment."}, "completion": {"required": False}},
        {"page_uuid": journey_review_page, "block_id": "blk_launch_journey_review", "title": "Here’s your current chapter", "action_label": "Add to my Journey", "blocks": [
            text_block(heading_node("Here’s your current chapter"), block_id="blk_journey_review_heading"),
            text_block(paragraph_node("This is how it will appear in your Journey. You can always change it later."), block_id="blk_journey_review_intro"),
            {"id": "blk_journey_review_card", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "journey_card", "bindings": {
                "entry_type": {"source": "answer", "path": f"{journey_kind_page}.answer.questions.{journey_kind_block}.option_ids.0", "fallback": "experience"},
                "title": {"source": "answer", "path": f"{journey_page}.answer.questions.{journey_block}.inputs.title.text", "fallback": "Your current chapter"},
                "organization": {"source": "answer", "path": f"{journey_page}.answer.questions.{journey_block}.inputs.organization.text", "fallback": "A place where you’re growing"},
                "location_label": {"source": "answer", "path": f"{journey_page}.answer.questions.{journey_block}.inputs.location.text", "fallback": ""},
                "start_date": {"source": "answer", "path": f"{journey_page}.answer.questions.{journey_block}.inputs.start_date.text", "fallback": ""},
                "summary": {"source": "answer", "path": f"{journey_page}.answer.questions.{journey_block}.inputs.summary.text", "fallback": "Your story will appear here."},
                "cover_url": {"source": "answer", "path": f"{journey_photo_page}.answer.questions.{journey_photo_block}.url", "fallback_binding": {"source": "variable", "path": "user.avatar_image", "fallback": ""}},
            }}},
            {"id": "blk_journey_review_details_button", "type": "button", "design": {"width": 48, "align": "center", "variant": "secondary", "group": "journey_review_actions"}, "content": {"label": "Change the details", "destination_page_uuid": journey_page}},
            {"id": "blk_journey_review_photo_button", "type": "button", "design": {"width": 48, "align": "center", "variant": "secondary", "group": "journey_review_actions"}, "content": {"label": "Choose another photo", "destination_page_uuid": journey_photo_page}},
        ]},
    ]
    _ensure_launch_ready_activity(
        db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="journey", order=3,
        title="Add your current chapter", description="Show where you're learning, working, or growing now.",
        pages=journey_pages,
        outcomes=[{"id": "create-current-chapter", "type": "create_journey_entry", "store_as": "journey_entry_id", "fields": {
            "entry_type": answer(journey_kind_page, journey_kind_block, "option_ids", "experience", "first"),
            "title": answer(journey_page, journey_block, "inputs.title.text"), "organization": answer(journey_page, journey_block, "inputs.organization.text"),
            "location_label": answer(journey_page, journey_block, "inputs.location.text"), "start_date": answer(journey_page, journey_block, "inputs.start_date.text"),
            "summary": answer(journey_page, journey_block, "inputs.summary.text"), "cover_asset_uuid": answer(journey_photo_page, journey_photo_block, "media_asset_uuid"),
            "is_current": True,
        }}],
    )

    work_detail_page, work_detail_block = "learning_page_system_onboarding_work_detail", "blk_launch_work_detail"
    work_photo_page, work_photo_block = "learning_page_system_onboarding_work_photo", "blk_launch_work_photo"
    work_journey_page, work_journey_block = "learning_page_system_onboarding_work_journey", "blk_launch_work_journey"
    work_review_page = "learning_page_system_onboarding_work_review"
    work_pages = [{"page_uuid": work_detail_page, "block_id": work_detail_block, "title": "Tell the story of your work", "kind": "text_input", "content": {"inputs": [{"id": "title", "label": "Title", "placeholder": "Name this work", "variant": "single_line", "height": 48}, {"id": "tagline", "label": "Tagline", "placeholder": "A short line about this work", "variant": "single_line", "height": 48}, {"id": "start_date", "section_id": "work_dates", "label": "Start date (optional)", "input_type": "month", "variant": "single_line", "width": "half", "height": 48}, {"id": "end_date", "section_id": "work_dates", "label": "End date (optional)", "input_type": "month", "variant": "single_line", "width": "half", "height": 48}, {"id": "story", "label": "Story", "placeholder": "What did you set out to do? What did you contribute? What changed, or what did you learn?", "variant": "short_answer", "height": 240}]}, "completion": {"inputs": {"title": {"required": True, "min_words": 1}, "tagline": {"required": False}, "start_date": {"required": False}, "end_date": {"required": False}, "story": {"required": True, "min_words": 3}}}}, {"page_uuid": work_photo_page, "block_id": work_photo_block, "title": "Cover image", "kind": "image_upload", "content": {"label": "Choose the cover image that will appear on your Work card."}, "completion": {"required": False}}, {"page_uuid": work_journey_page, "block_id": work_journey_block, "title": "Connect this to your Journey", "kind": "text_input", "content": {"inputs": [{"id": "journey_uuid", "label": "Journey entry (optional)", "placeholder": "Don’t connect this yet", "input_type": "select", "variant": "single_line", "height": 48, "options_binding": {"source": "variable", "path": "portfolio.journey_options"}}]}, "completion": {"inputs": {"journey_uuid": {"required": False}}}}, {"page_uuid": work_review_page, "block_id": "blk_launch_work_review", "title": "Your work is ready to share", "action_label": "Add this to my Work", "blocks": [text_block(heading_node("Your work is ready to share"), block_id="blk_work_review_heading"), {"id": "blk_work_review_card", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "work_card", "bindings": {"title": {"source": "answer", "path": f"{work_detail_page}.answer.questions.{work_detail_block}.inputs.title.text", "fallback": "Your work"}, "subtitle": {"source": "answer", "path": f"{work_detail_page}.answer.questions.{work_detail_block}.inputs.tagline.text", "fallback": ""}, "summary": {"source": "answer", "path": f"{work_detail_page}.answer.questions.{work_detail_block}.inputs.story.text", "fallback": "Your story"}, "cover_url": {"source": "answer", "path": f"{work_photo_page}.answer.questions.{work_photo_block}.url", "fallback": ""}}}}, {"id": "blk_work_review_details", "type": "button", "design": {"width": 48, "variant": "secondary", "group": "work_review_actions"}, "content": {"label": "Change the story", "destination_page_uuid": work_detail_page}}, {"id": "blk_work_review_photo", "type": "button", "design": {"width": 48, "variant": "secondary", "group": "work_review_actions"}, "content": {"label": "Choose another cover", "destination_page_uuid": work_photo_page}}]}]
    _ensure_launch_ready_activity(
        db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="work", order=4,
        title="Show something you've done", description="Add a project, creation, achievement, or story.", pages=work_pages,
        outcomes=[{"id": "create-first-work", "type": "create_work_item", "store_as": "work_item_id", "fields": {"story_kind": "made", "title": answer(work_detail_page, work_detail_block, "inputs.title.text"), "subtitle": answer(work_detail_page, work_detail_block, "inputs.tagline.text"), "summary": answer(work_detail_page, work_detail_block, "inputs.story.text"), "start_date": answer(work_detail_page, work_detail_block, "inputs.start_date.text"), "end_date": answer(work_detail_page, work_detail_block, "inputs.end_date.text"), "featured": True}, "story": answer(work_detail_page, work_detail_block, "inputs.story.text"), "cover_asset_uuid": answer(work_photo_page, work_photo_block, "media_asset_uuid")}, {"id": "link-work-to-existing-journey", "type": "link_work_to_journey", "optional": True, "work": {"$source": "binding", "key": "work_item_id"}, "journey": answer(work_journey_page, work_journey_block, "inputs.journey_uuid.text"), "label": "Related work"}],
    )

    trait_page, trait_block = "learning_page_system_onboarding_traits", "blk_launch_traits"
    trait_review_page = "learning_page_system_onboarding_traits_review"
    trait_options = ("creative", "curious", "reliable", "collaborative", "determined", "empathetic", "resourceful", "patient", "bold", "thoughtful")
    _ensure_launch_ready_activity(db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="traits", order=5, title="What do you bring?", description="Choose the strengths that feel true now—you can change them as you grow.", pages=[{"page_uuid": trait_page, "block_id": trait_block, "title": "What feels true about you right now?", "kind": "multiple_choice", "content": {"label": "Pick two or three qualities you want people to understand about you.", "options": [{"id": item, "text": item.title()} for item in trait_options]}, "completion": {"min_selections": 2, "max_selections": 3}}, {"page_uuid": trait_review_page, "block_id": "blk_launch_traits_review", "title": "This is what you bring", "action_label": "Add what makes me, me", "blocks": [text_block(heading_node("This is what you bring"), block_id="blk_traits_review_heading"), text_block(paragraph_node("Choose what feels true now. This can change as you do."), block_id="blk_traits_review_intro"), {"id": "blk_traits_review_panel", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "traits_panel", "bindings": {"traits": {"source": "answer", "path": f"{trait_page}.answer.questions.{trait_block}.option_ids", "fallback": "Curious, Creative"}}}}, {"id": "blk_traits_review_change", "type": "button", "design": {"width": 100, "variant": "secondary"}, "content": {"label": "Change my choices", "destination_page_uuid": trait_page}}]}], outcomes=[{"id": "set-strengths", "type": "set_traits", "trait_type": "strength", "values": answer(trait_page, trait_block, "option_ids", [])}])

    links_platform_page, links_platform_block = "learning_page_system_onboarding_links_platform", "blk_launch_links_platform"
    links_page, links_block = "learning_page_system_onboarding_links", "blk_launch_links"
    links_review_page = "learning_page_system_onboarding_links_review"
    _ensure_launch_ready_activity(db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="links", order=6, title="Connect the places you show up", description="Connect a public profile or site—or confidently say not yet.", pages=[{"page_uuid": links_platform_page, "block_id": links_platform_block, "title": "Where do you show up online?", "kind": "multiple_choice", "content": {"label": "You do not need a personal website.", "options": [{"id": key, "text": label} for key, label in (("website", "Personal site"), ("github", "GitHub"), ("youtube", "YouTube"), ("linkedin", "LinkedIn"), ("instagram", "Instagram"), ("tiktok", "TikTok"), ("other", "Another link"), ("not_yet", "I don’t have anything to add yet"))]}, "completion": {"min_selections": 1, "max_selections": 1}}, {"page_uuid": links_page, "block_id": links_block, "title": "Make the destination clear", "kind": "text_input", "content": {"inputs": [{"id": "label", "label": "Public label", "placeholder": "My GitHub", "variant": "single_line"}, {"id": "url", "label": "Public URL", "placeholder": "https://…", "input_type": "url", "variant": "single_line"}]}, "completion": {"inputs": {"label": {"required": False}, "url": {"required": False}}}}, {"page_uuid": links_review_page, "block_id": "blk_launch_links_review", "title": "Here’s what people can explore", "action_label": "Connect this to my portfolio", "blocks": [text_block(heading_node("Here’s what people can explore"), block_id="blk_links_review_heading"), text_block(paragraph_node("This label and URL will be public. Contact information stays separate."), block_id="blk_links_review_intro"), {"id": "blk_links_review_strip", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "links_strip", "bindings": {"label": {"source": "answer", "path": f"{links_page}.answer.questions.{links_block}.inputs.label.text", "fallback": "My link"}, "url": {"source": "answer", "path": f"{links_page}.answer.questions.{links_block}.inputs.url.text", "fallback": "No link added yet"}}}}, {"id": "blk_links_review_change", "type": "button", "design": {"width": 100, "variant": "secondary"}, "content": {"label": "Change this link", "destination_page_uuid": links_page}}]}], outcomes=[{"id": "set-main-link", "type": "set_portfolio_links", "optional": True, "links": [{"link_type": "social", "platform": answer(links_platform_page, links_platform_block, "option_ids", "other", "first"), "label": answer(links_page, links_block, "inputs.label.text", "My link"), "url": answer(links_page, links_block, "inputs.url.text")}]}])

    theme_page, theme_block = "learning_page_system_onboarding_theme", "blk_launch_theme"
    theme_review_page = "learning_page_system_onboarding_theme_review"
    _ensure_launch_ready_activity(db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="theme", order=7, title="Choose how your story feels", description="Compare real looks using your portfolio content; themes stay reversible.", pages=[{"page_uuid": theme_page, "block_id": theme_block, "title": "Choose a look that feels like you", "kind": "multiple_choice", "content": {"label": "Your choice updates the preview on the next screen.", "options": [{"id": item, "text": label} for item, label in (("default", "Classic — balanced and familiar"), ("electric", "Electric — bold and energetic"), ("minimal", "Minimal — quiet and focused"), ("creative", "Creative — warm and expressive"))]}, "completion": {"min_selections": 1, "max_selections": 1}}, {"page_uuid": theme_review_page, "block_id": "blk_launch_theme_review", "title": "Preview your new look", "action_label": "Use this look", "blocks": [text_block(heading_node("Preview your new look"), block_id="blk_theme_review_heading"), text_block(paragraph_node("Themes remain reversible—you are choosing a starting point, not locking it forever."), block_id="blk_theme_review_intro"), {"id": "blk_theme_review_frame", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "portfolio_frame", "bindings": {"theme_id": {"source": "answer", "path": f"{theme_page}.answer.questions.{theme_block}.option_ids.0", "fallback": "default"}, "display_name": {"source": "variable", "path": "user.display_name", "fallback": "Your portfolio"}, "headline": {"source": "variable", "path": "portfolio.headline", "fallback": "Your story, work, and journey"}}}}, {"id": "blk_theme_review_change", "type": "button", "design": {"width": 100, "variant": "secondary"}, "content": {"label": "Compare another look", "destination_page_uuid": theme_page}}]}], outcomes=[{"id": "set-theme", "type": "set_theme", "theme_id": answer(theme_page, theme_block, "option_ids", "default", "first")}])

    launch_preview_page = "learning_page_system_onboarding_launch_preview"
    launch_page, launch_block = "learning_page_system_onboarding_launch", "blk_launch_confirm"
    _ensure_launch_ready_activity(db_session, path=path, badge=badge, org_id=owner_org.id or 0, key="launch", order=8, title="See exactly what others will see", description="Review the public result and privacy choices before publishing.", pages=[{"page_uuid": launch_preview_page, "block_id": "blk_launch_preview", "title": "Review your public portfolio", "blocks": [text_block(heading_node("Review your public portfolio"), block_id="blk_launch_preview_heading"), text_block(paragraph_node("This is the information other people will see. Check your introduction, Journey, Work, links, and overall look."), block_id="blk_launch_preview_intro"), {"id": "blk_launch_preview_frame", "type": "portfolio_preview", "design": {"width": 100}, "content": {"variant": "portfolio_frame", "bindings": {"display_name": {"source": "variable", "path": "user.display_name", "fallback": "Your portfolio"}, "headline": {"source": "variable", "path": "portfolio.headline", "fallback": "Your public story"}, "theme_id": {"source": "variable", "path": "portfolio.theme_id", "fallback": "default"}}}}]}, {"page_uuid": launch_page, "block_id": launch_block, "title": "Confirm your privacy choices", "action_label": "Complete my launch review", "kind": "multiple_choice", "content": {"label": "Your portfolio can be viewed by anyone with its public address. Only publish information you are comfortable sharing.", "options": [{"id": "public_info", "text": "I understand which information will be public"}, {"id": "permission", "text": "I have permission to share the images and details I added"}, {"id": "reviewed", "text": "I reviewed the public preview and want to continue"}]}, "completion": {"min_selections": 3, "max_selections": 3}}], outcomes=[{"id": "confirm-privacy", "type": "confirm_privacy"}])

    badge.name = "Launch Ready"
    badge.description = "Build and launch your portfolio one useful step at a time."
    badge.about = "A guided path for introducing yourself, sharing your journey and work, and preparing your portfolio to publish."
    badge.criteria = "Complete all Launch Ready activities."
    db_session.add(badge)

    db_session.commit()
    db_session.refresh(collection)
    db_session.refresh(badge)
    db_session.refresh(activity)
    return owner_org, collection, badge, activity


async def create_badge(request: Request, data: LearningBadgeCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningBadgeRead:
    _require_org_admin(db_session, current_user, data.org_id)
    now = _now()
    badge = LearningBadge(**_strip_system_fields(data.model_dump()), badge_uuid=f"badge_{uuid4()}", creation_date=now, update_date=now)
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    _get_path_for_badge(db_session, badge)
    return LearningBadgeRead(**badge.model_dump())


async def update_badge(request: Request, badge_uuid: str, data: LearningBadgeUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningBadgeRead:
    badge = _get_badge(db_session, badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    for key, value in _strip_system_fields(data.model_dump(exclude_unset=True)).items():
        setattr(badge, key, value)
    badge.update_date = _now()
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    return LearningBadgeRead(**badge.model_dump())


async def update_badge_thumbnail(
    request: Request,
    badge_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    thumbnail_file: UploadFile | None = None,
) -> LearningBadgeRead:
    badge = _get_badge(db_session, badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    org = _get_org(db_session, badge.org_id)

    if not thumbnail_file or not thumbnail_file.filename:
        raise HTTPException(status_code=400, detail="Thumbnail file is required")

    filename = await upload_file(
        file=thumbnail_file,
        directory=f"badges/{badge.badge_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
    )
    badge.thumbnail_image = f"/content/orgs/{org.org_uuid}/badges/{badge.badge_uuid}/thumbnails/{filename}"
    badge.update_date = _now()

    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    return LearningBadgeRead(**badge.model_dump())


async def create_badge_notification_signup(request: Request, badge_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to get notified")
    badge = _get_badge(db_session, badge_uuid)
    _ensure_read_badge(db_session, badge, current_user)
    existing = db_session.exec(
        select(LearningBadgeNotificationSignup).where(
            LearningBadgeNotificationSignup.badge_id == badge.id,
            LearningBadgeNotificationSignup.user_id == current_user.id,
        )
    ).first()
    if existing:
        return {"detail": "Notification signup already exists", "signup_uuid": existing.signup_uuid}
    now = _now()
    signup = LearningBadgeNotificationSignup(
        signup_uuid=f"badge_notification_{uuid4()}",
        badge_id=badge.id or 0,
        org_id=badge.org_id,
        user_id=current_user.id,
        creation_date=now,
        update_date=now,
    )
    db_session.add(signup)
    db_session.commit()
    db_session.refresh(signup)
    return {"detail": "Notification signup created", "signup_uuid": signup.signup_uuid}


async def get_badge(request: Request, badge_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningBadgeRead:
    badge = _get_badge(db_session, badge_uuid)
    _ensure_read_badge(db_session, badge, current_user)
    return LearningBadgeRead(**badge.model_dump())


async def list_badges(request: Request, org_id: int | None, current_user: PublicUser | AnonymousUser, db_session: Session, admin: bool = False) -> list[LearningBadgeRead]:
    if org_id is not None:
        _ensure_onboarding_for_owner_org(db_session, org_id)
    if admin:
        if org_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="org_id is required for admin badge listing")
        _require_org_admin(db_session, current_user, org_id)
        statement = select(LearningBadge).where(LearningBadge.org_id == org_id)
    else:
        statement = _public_badge_query(org_id)
    badges = db_session.exec(statement.order_by(LearningBadge.creation_date.desc())).all()  # type: ignore
    return [LearningBadgeRead(**badge.model_dump()) for badge in badges]


async def delete_badge(request: Request, badge_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    badge = _get_badge(db_session, badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    if _is_system_object(badge):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System badges cannot be deleted")
    db_session.delete(badge)
    db_session.commit()
    return {"detail": "Badge deleted"}


async def create_collection(request: Request, data: BadgeCollectionCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> BadgeCollectionRead:
    _require_org_admin(db_session, current_user, data.org_id)
    now = _now()
    collection = BadgeCollection(**_strip_system_fields(data.model_dump()), collection_uuid=f"badge_collection_{uuid4()}", creation_date=now, update_date=now)
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    return BadgeCollectionRead(**collection.model_dump(), badges=[])


async def update_collection(request: Request, collection_uuid: str, data: BadgeCollectionUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> BadgeCollectionRead:
    collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == _clean_uuid(collection_uuid, "badge_collection_"))).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    _require_org_admin(db_session, current_user, collection.org_id)
    for key, value in _strip_system_fields(data.model_dump(exclude_unset=True)).items():
        setattr(collection, key, value)
    collection.update_date = _now()
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    badges = db_session.exec(select(LearningBadge).where(LearningBadge.collection_id == collection.id)).all()
    return BadgeCollectionRead(**collection.model_dump(), badges=[LearningBadgeRead(**badge.model_dump()) for badge in badges])


async def update_collection_thumbnail(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    thumbnail_file: UploadFile | None = None,
) -> BadgeCollectionRead:
    collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == _clean_uuid(collection_uuid, "badge_collection_"))).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    _require_org_admin(db_session, current_user, collection.org_id)
    org = _get_org(db_session, collection.org_id)

    if not thumbnail_file or not thumbnail_file.filename:
        raise HTTPException(status_code=400, detail="Thumbnail file is required")

    filename = await upload_file(
        file=thumbnail_file,
        directory=f"badge_collections/{collection.collection_uuid}/thumbnails",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="thumbnail",
    )
    collection.thumbnail_image = f"/content/orgs/{org.org_uuid}/badge_collections/{collection.collection_uuid}/thumbnails/{filename}"
    collection.update_date = _now()

    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    badges = db_session.exec(select(LearningBadge).where(LearningBadge.collection_id == collection.id)).all()
    return BadgeCollectionRead(**collection.model_dump(), badges=[LearningBadgeRead(**badge.model_dump()) for badge in badges])


async def delete_collection(request: Request, collection_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == _clean_uuid(collection_uuid, "badge_collection_"))).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    _require_org_admin(db_session, current_user, collection.org_id)
    if _is_system_object(collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System badge collections cannot be deleted")
    badges = db_session.exec(select(LearningBadge).where(LearningBadge.collection_id == collection.id)).all()
    for badge in badges:
        db_session.delete(badge)
    db_session.delete(collection)
    db_session.commit()
    return {"detail": "Badge collection deleted"}


async def list_collections(request: Request, org_id: int | None, current_user: PublicUser | AnonymousUser, db_session: Session, admin: bool = False) -> list[BadgeCollectionRead]:
    if org_id is not None:
        _ensure_onboarding_for_owner_org(db_session, org_id)
    if admin:
        if org_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="org_id is required for admin badge collection listing")
        _require_org_admin(db_session, current_user, org_id)
        collections = db_session.exec(select(BadgeCollection).where(BadgeCollection.org_id == org_id)).all()
        badges = db_session.exec(select(LearningBadge).where(LearningBadge.org_id == org_id)).all()
    else:
        collection_statement = select(BadgeCollection).where(BadgeCollection.public == True, BadgeCollection.hidden == False)
        if org_id is not None:
            collection_statement = collection_statement.where(BadgeCollection.org_id == org_id)
        collections = db_session.exec(collection_statement).all()
        badges = db_session.exec(_public_badge_query(org_id)).all()
    badges_by_collection: dict[int, list[LearningBadge]] = {}
    for badge in badges:
        if badge.collection_id is not None:
            badges_by_collection.setdefault(badge.collection_id, []).append(badge)
    return [
        BadgeCollectionRead(
            **collection.model_dump(),
            badges=[LearningBadgeRead(**badge.model_dump()) for badge in badges_by_collection.get(collection.id or 0, [])],
        )
        for collection in collections
    ]


async def get_path(request: Request, badge_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session, actor: LearningActor | None = None) -> LearningPathRead:
    badge = _get_badge(db_session, badge_uuid)
    _ensure_read_badge(db_session, badge, current_user)
    path = _get_path_for_badge(db_session, badge)
    activities = db_session.exec(select(LearningActivity).where(LearningActivity.path_id == path.id).order_by(LearningActivity.order.asc())).all()  # type: ignore
    pages = db_session.exec(select(LearningPage).where(LearningPage.badge_id == badge.id).order_by(LearningPage.order.asc())).all()  # type: ignore
    pages_by_activity: dict[int, list[LearningPage]] = {}
    for page in pages:
        pages_by_activity.setdefault(page.activity_id, []).append(page)
    run = None
    if actor:
        statement = select(LearningRun).where(LearningRun.path_id == path.id)
        for owner_filter in _actor_filters(LearningRun, actor):
            statement = statement.where(owner_filter)
        run_obj = db_session.exec(statement).first()
        if run_obj:
            run = _serialize_run(db_session, run_obj)
    return LearningPathRead(
        path=path.model_dump(),
        badge=LearningBadgeRead(**badge.model_dump()),
        activities=[_serialize_activity(activity, pages_by_activity.get(activity.id or 0, [])) for activity in activities],
        run=run,
    )


async def create_activity(request: Request, data: LearningActivityCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningActivityRead:
    badge = _get_badge(db_session, data.badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    path = _get_path_for_badge(db_session, badge)
    existing = db_session.exec(select(LearningActivity).where(LearningActivity.path_id == path.id).order_by(LearningActivity.order.asc())).all()  # type: ignore
    now = _now()
    payload = data.model_dump(exclude={"badge_uuid"})
    activity = LearningActivity(
        **payload,
        path_id=path.id or 0,
        badge_id=badge.id or 0,
        org_id=badge.org_id,
        order=(existing[-1].order + 1) if existing else 1,
        activity_uuid=f"learning_activity_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.flush()

    page = LearningPage(
        activity_id=activity.id or 0,
        badge_id=badge.id or 0,
        org_id=badge.org_id,
        page_type=LearningPageType.STANDARD,
        title="Untitled page",
        order=1,
        content={"version": STANDARD_CONTENT_VERSION, "blocks": [text_block(paragraph_node(""))]},
        page_uuid=f"learning_page_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(page)
    db_session.commit()
    db_session.refresh(activity)
    db_session.refresh(page)
    return _serialize_activity(activity, [page])


async def update_activity(request: Request, activity_uuid: str, data: LearningActivityUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningActivityRead:
    activity = _get_activity(db_session, activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    patch = data.model_dump(exclude_unset=True)
    if _is_locked_launch_ready_activity(activity) and patch.get("published") is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Required Launch Ready activities cannot be unpublished")
    if "settings" in patch:
        pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).all()
        badge = db_session.get(LearningBadge, activity.badge_id)
        try:
            validate_flow(
                (patch["settings"] or {}).get("flow"),
                {page.page_uuid for page in pages},
                {page.page_uuid for page in pages if page.required},
            )
            validate_outcomes((patch["settings"] or {}).get("outcomes"), bool(badge and _is_system_object(badge)))
        except (FlowValidationError, PortfolioActionError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    for key, value in patch.items():
        setattr(activity, key, value)
    activity.update_date = _now()
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore
    return _serialize_activity(activity, pages)


async def delete_activity(request: Request, activity_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    activity = _get_activity(db_session, activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    if _is_locked_launch_ready_activity(activity):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Required Launch Ready activities cannot be deleted")
    badge = db_session.get(LearningBadge, activity.badge_id)
    if badge and _is_system_object(badge):
        sibling_count = db_session.exec(
            select(func.count(LearningActivity.id)).where(LearningActivity.badge_id == badge.id)
        ).one()
        if sibling_count <= 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Badges must keep at least one activity")
    db_session.delete(activity)
    db_session.commit()
    return {"detail": "Learning activity deleted"}


async def duplicate_activity(request: Request, activity_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningActivityRead:
    activity = _get_activity(db_session, activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    if _is_locked_launch_ready_activity(activity):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Required Launch Ready activities cannot be duplicated")
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore
    siblings = db_session.exec(select(LearningActivity).where(LearningActivity.path_id == activity.path_id).order_by(LearningActivity.order.asc())).all()  # type: ignore
    now = _now()
    clone = LearningActivity(
        path_id=activity.path_id,
        badge_id=activity.badge_id,
        org_id=activity.org_id,
        title=f"{activity.title} Copy",
        description=activity.description,
        thumbnail_image=activity.thumbnail_image,
        icon=activity.icon,
        order=(siblings[-1].order + 1) if siblings else 1,
        required=activity.required,
        published=False,
        settings=activity.settings,
        activity_uuid=f"learning_activity_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(clone)
    db_session.flush()
    cloned_pages = []
    for page in pages:
        cloned_page = LearningPage(
            activity_id=clone.id or 0,
            badge_id=page.badge_id,
            org_id=page.org_id,
            page_type=page.page_type,
            title=page.title,
            order=page.order,
            required=page.required,
            content=page.content,
            design=page.design,
            scoring=page.scoring,
            completion=page.completion,
            page_uuid=f"learning_page_{uuid4()}",
            creation_date=now,
            update_date=now,
        )
        db_session.add(cloned_page)
        cloned_pages.append(cloned_page)
    db_session.commit()
    db_session.refresh(clone)
    for page in cloned_pages:
        db_session.refresh(page)
    return _serialize_activity(clone, cloned_pages)


async def convert_page_variants_to_flow(request: Request, activity_uuid: str, page_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningActivityRead:
    activity = _get_activity(db_session, activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    pages = list(db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all())  # type: ignore
    page = next((item for item in pages if item.page_uuid == _clean_uuid(page_uuid, "learning_page_")), None)
    variants = (page.content or {}).get("variants") if page else None
    if not page or not isinstance(variants, dict) or not (variants.get("overrides") or {}):
        raise HTTPException(status_code=422, detail="Page does not contain convertible variants")
    source_uuid = (variants.get("source") or {}).get("page_uuid")
    source_block_id = (variants.get("source") or {}).get("block_id")
    source_page = next((item for item in pages if item.page_uuid == source_uuid), None)
    if not source_page or source_page.order >= page.order:
        raise HTTPException(status_code=422, detail="Variant source must be an earlier question page")
    now, created = _now(), []
    for key, override in (variants.get("overrides") or {}).items():
        clone = LearningPage(
            activity_id=page.activity_id, badge_id=page.badge_id, org_id=page.org_id,
            page_type=page.page_type, title=f"{page.title} — {key}", order=page.order,
            required=page.required, content={"version": (page.content or {}).get("version", STANDARD_CONTENT_VERSION), "blocks": deepcopy((override or {}).get("blocks") or [])},
            design=deepcopy(page.design), scoring=deepcopy(page.scoring), completion=deepcopy(page.completion),
            page_uuid=f"learning_page_{uuid4()}", creation_date=now, update_date=now,
        )
        db_session.add(clone); db_session.flush(); created.append((str(key), clone))
    page.content = {key: deepcopy(value) for key, value in (page.content or {}).items() if key != "variants"}
    db_session.add(page)
    nodes = [{"id": f"page:{item.page_uuid}", "type": "page", "page_uuid": item.page_uuid} for item in pages]
    nodes.extend({"id": f"page:{item.page_uuid}", "type": "page", "page_uuid": item.page_uuid} for _, item in created)
    nodes.append({"id": "complete", "type": "complete"})
    edges = []
    page_index = pages.index(page)
    branch_from = pages[page_index - 1] if page_index > 0 else source_page
    for index, item in enumerate(pages):
        source = f"page:{item.page_uuid}"
        target = f"page:{pages[index + 1].page_uuid}" if index + 1 < len(pages) else "complete"
        if item.id == branch_from.id:
            continue
        if item.id == page.id:
            edges.append({"from": source, "to": target, "priority": 0})
            for _, branch in created: edges.append({"from": f"page:{branch.page_uuid}", "to": target, "priority": 0})
        else:
            edges.append({"from": source, "to": target, "priority": 0})
    default_target = f"page:{page.page_uuid}"
    edges.append({"from": f"page:{branch_from.page_uuid}", "to": default_target, "priority": -100})
    for priority, (key, branch) in enumerate(created, start=1):
        answer_key = f"{source_page.page_uuid}.result.questions.{source_block_id}.option_ids" if source_block_id else f"{source_page.page_uuid}.result.option_ids"
        edges.append({
            "from": f"page:{branch_from.page_uuid}", "to": f"page:{branch.page_uuid}", "priority": 100 - priority,
            "condition": {"op": "contains", "left": {"source": "answer", "key": answer_key}, "right": key},
        })
    flow = {"version": 1, "entry": f"page:{pages[0].page_uuid}", "nodes": nodes, "edges": edges}
    try:
        validate_flow(flow, {node["page_uuid"] for node in nodes if node["type"] == "page"}, {item.page_uuid for item in pages if item.required})
    except FlowValidationError as exc:
        db_session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    activity.settings = {**(activity.settings or {}), "flow": flow}
    activity.update_date = now; db_session.add(activity); db_session.commit()
    all_pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore
    return _serialize_activity(activity, all_pages)


def _validate_page_payload(page_type: LearningPageType, content: dict | None) -> None:
    if page_type != LearningPageType.STANDARD or not isinstance(content, dict):
        return

    stacks = list(iter_block_stacks(content))
    question_count = 0
    seen_ids: set[str] = set()
    def validate_display_binding(binding: dict) -> None:
        if binding.get("source") not in {"answer", "variable"} or not re.fullmatch(r"[A-Za-z0-9_.-]+", str(binding.get("path") or "")):
            raise HTTPException(status_code=422, detail="Display binding uses an unsupported source or path")
        if isinstance(binding.get("fallback_binding"), dict):
            validate_display_binding(binding["fallback_binding"])
    def validate_nodes(nodes) -> None:
        for node in nodes or []:
            if not isinstance(node, dict):
                continue
            if node.get("type") == "displayBinding":
                validate_display_binding(((node.get("attrs") or {}).get("binding") or {}))
            validate_nodes(node.get("content"))
    for stack in stacks:
        for block in stack:
            if not isinstance(block, dict):
                raise HTTPException(status_code=422, detail="Page blocks must be objects")
            block_id = str(block.get("id") or "")
            if not block_id:
                raise HTTPException(status_code=422, detail="Every block needs an id")
            if block_id in seen_ids:
                raise HTTPException(status_code=422, detail="Block ids must be unique within a page")
            seen_ids.add(block_id)
            block_type = block.get("type")
            if block_type not in {"text", "image", "question", "button", "portfolio_preview"}:
                raise HTTPException(status_code=422, detail=f"Unsupported block type: {block_type}")
            destination = str((block.get("content") or {}).get("destination_page_uuid") or "")
            if block_type == "button" and destination and not destination.startswith("learning_page_"):
                raise HTTPException(status_code=422, detail="Page buttons need an internal destination page")
            if block_type == "image" and (block.get("content") or {}).get("binding"):
                binding = (block.get("content") or {}).get("binding") or {}
                validate_display_binding(binding)
            if block_type == "text":
                validate_nodes((block.get("content") or {}).get("nodes") or [(block.get("content") or {}).get("node")])
            if block_type == "portfolio_preview":
                preview = block.get("content") or {}
                if preview.get("variant") not in {"journey_card", "work_card", "identity_header", "traits_panel", "links_strip", "portfolio_frame"}:
                    raise HTTPException(status_code=422, detail="Unsupported portfolio preview variant")
                for binding in (preview.get("bindings") or {}).values():
                    if not isinstance(binding, dict):
                        raise HTTPException(status_code=422, detail="Portfolio preview bindings must be objects")
                    validate_display_binding(binding)
            if block.get("type") == "question":
                question_count += 1

    variants = content.get("variants")
    if isinstance(variants, dict):
        if question_count:
            raise HTTPException(status_code=422, detail="Pages with variants cannot contain a question block")
        overrides = variants.get("overrides") or {}
        source_uuid = (variants.get("source") or {}).get("page_uuid")
        if overrides and not source_uuid:
            raise HTTPException(status_code=422, detail="Variants need a source question page")


def _validate_page_button_destinations(content: dict | None, page_uuids: set[str]) -> None:
    for stack in iter_block_stacks(content or {}):
        for block in stack:
            if isinstance(block, dict) and block.get("type") == "button":
                destination = str((block.get("content") or {}).get("destination_page_uuid") or "")
                if destination and destination not in page_uuids:
                    raise HTTPException(status_code=422, detail="Page button destination must belong to the same activity")


async def create_page(request: Request, data: LearningPageCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningPageRead:
    activity = _get_activity(db_session, data.activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    _validate_page_payload(data.page_type, data.content)
    if any(block.get("type") == "portfolio_preview" for stack in iter_block_stacks(data.content or {}) for block in stack if isinstance(block, dict)):
        badge = db_session.get(LearningBadge, activity.badge_id)
        if not badge or not _is_system_object(badge):
            raise HTTPException(status_code=403, detail="Portfolio preview blocks are limited to trusted system activities")
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore
    _validate_page_button_destinations(data.content, {page.page_uuid for page in pages})
    now = _now()
    payload = data.model_dump(exclude={"activity_uuid"})
    page = LearningPage(
        **payload,
        activity_id=activity.id or 0,
        badge_id=activity.badge_id,
        org_id=activity.org_id,
        order=(pages[-1].order + 1) if pages else 1,
        page_uuid=f"learning_page_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(page)
    db_session.commit()
    db_session.refresh(page)
    return _serialize_page(page)


async def update_page(request: Request, page_uuid: str, data: LearningPageUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningPageRead:
    page = _get_page(db_session, page_uuid)
    _require_org_admin(db_session, current_user, page.org_id)
    patch = data.model_dump(exclude_unset=True)
    if "content" in patch or "page_type" in patch:
        _validate_page_payload(patch.get("page_type") or page.page_type, patch.get("content", page.content))
        if any(block.get("type") == "portfolio_preview" for stack in iter_block_stacks(patch.get("content", page.content) or {}) for block in stack if isinstance(block, dict)):
            badge = db_session.get(LearningBadge, page.badge_id)
            if not badge or not _is_system_object(badge):
                raise HTTPException(status_code=403, detail="Portfolio preview blocks are limited to trusted system activities")
        siblings = db_session.exec(select(LearningPage).where(LearningPage.activity_id == page.activity_id)).all()
        _validate_page_button_destinations(patch.get("content", page.content), {item.page_uuid for item in siblings})
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(page, key, value)
    page.update_date = _now()
    db_session.add(page)
    db_session.commit()
    db_session.refresh(page)
    return _serialize_page(page)


async def delete_page(request: Request, page_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    page = _get_page(db_session, page_uuid)
    _require_org_admin(db_session, current_user, page.org_id)
    badge = db_session.get(LearningBadge, page.badge_id)
    if badge and _is_system_object(badge):
        sibling_count = db_session.exec(
            select(func.count(LearningPage.id)).where(LearningPage.activity_id == page.activity_id)
        ).one()
        if sibling_count <= 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Activities must keep at least one page")
    db_session.delete(page)
    db_session.commit()
    return {"detail": "Learning page deleted"}


async def upload_page_media(
    request: Request,
    page_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    media_file: UploadFile | None = None,
) -> dict:
    page = _get_page(db_session, page_uuid)
    _require_org_admin(db_session, current_user, page.org_id)
    org = _get_org(db_session, page.org_id)

    if not media_file or not media_file.filename:
        raise HTTPException(status_code=400, detail="Media file is required")

    filename = await upload_file(
        file=media_file,
        directory=f"learning_pages/{page.page_uuid}/media",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="media",
    )
    return {"url": f"/content/orgs/{org.org_uuid}/learning_pages/{page.page_uuid}/media/{filename}"}


async def upload_response_media(
    request: Request,
    page_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    media_file: UploadFile | None = None,
) -> dict:
    user = _require_user(current_user)
    page = _get_page(db_session, page_uuid)
    badge = db_session.get(LearningBadge, page.badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    _ensure_read_badge(db_session, badge, current_user)
    org = _get_org(db_session, page.org_id)

    if not media_file or not media_file.filename:
        raise HTTPException(status_code=400, detail="Media file is required")

    filename = await upload_file(
        file=media_file,
        directory=f"learning_responses/{page.page_uuid}/{user.user_uuid}",
        type_of_dir="orgs",
        uuid=org.org_uuid,
        allowed_types=["image"],
        filename_prefix="response",
    )
    return {"url": f"/content/orgs/{org.org_uuid}/learning_responses/{page.page_uuid}/{user.user_uuid}/{filename}"}


_VARIABLE_SEGMENT_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


def _validate_variable_key(key: str) -> str:
    normalized = str(key or "").strip().lower()
    segments = normalized.split(".")
    if not normalized or any(
        not _VARIABLE_SEGMENT_PATTERN.fullmatch(segment) or segment in _BLOCKED_VARIABLE_SEGMENTS
        for segment in segments
    ):
        raise HTTPException(
            status_code=422,
            detail="Variable keys must be dot-separated segments of lowercase letters, digits and underscores",
        )
    return normalized


def _get_variable(db_session: Session, variable_uuid: str) -> LearningVariable:
    variable = db_session.exec(
        select(LearningVariable).where(LearningVariable.variable_uuid == _clean_uuid(variable_uuid, "learning_variable_"))
    ).first()
    if not variable:
        raise HTTPException(status_code=404, detail="Learning variable not found")
    return variable


async def list_learning_variables(request: Request, org_id: int, current_user: PublicUser | AnonymousUser, db_session: Session) -> list[LearningVariableRead]:
    _require_org_admin(db_session, current_user, org_id)
    variables = db_session.exec(
        select(LearningVariable).where(LearningVariable.org_id == org_id).order_by(LearningVariable.key.asc())  # type: ignore
    ).all()
    return [LearningVariableRead(**variable.model_dump()) for variable in variables]


async def create_learning_variable(request: Request, data: LearningVariableCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningVariableRead:
    _require_org_admin(db_session, current_user, data.org_id)
    key = _validate_variable_key(data.key)
    existing = db_session.exec(
        select(LearningVariable).where(LearningVariable.org_id == data.org_id, LearningVariable.key == key)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A variable with this key already exists")
    now = _now()
    variable = LearningVariable(
        **{**data.model_dump(), "key": key},
        variable_uuid=f"learning_variable_{uuid4()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(variable)
    db_session.commit()
    db_session.refresh(variable)
    return LearningVariableRead(**variable.model_dump())


async def update_learning_variable(request: Request, variable_uuid: str, data: LearningVariableUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningVariableRead:
    variable = _get_variable(db_session, variable_uuid)
    _require_org_admin(db_session, current_user, variable.org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(variable, key, value)
    variable.update_date = _now()
    db_session.add(variable)
    db_session.commit()
    db_session.refresh(variable)
    return LearningVariableRead(**variable.model_dump())


async def delete_learning_variable(request: Request, variable_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    variable = _get_variable(db_session, variable_uuid)
    _require_org_admin(db_session, current_user, variable.org_id)
    db_session.delete(variable)
    db_session.commit()
    return {"detail": "Learning variable deleted"}


async def start_or_resume_run(request: Request, badge_uuid: str, actor: LearningActor, db_session: Session, issuing_org_id: int | None = None) -> LearningRunRead:
    badge = _get_badge(db_session, badge_uuid)
    if not _is_startable_badge(badge):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Badge is not available")
    if issuing_org_id is not None:
        _validate_issuer_selection(db_session, badge, issuing_org_id, actor.user_id)
        if issuing_org_id == badge.org_id:
            issuing_org_id = None
    path = _get_path_for_badge(db_session, badge)
    statement = select(LearningRun).where(LearningRun.path_id == path.id)
    for owner_filter in _actor_filters(LearningRun, actor):
        statement = statement.where(owner_filter)
    run = db_session.exec(statement).first()
    if not run:
        now = _now()
        run = LearningRun(
            run_uuid=f"learning_run_{uuid4()}",
            badge_id=badge.id or 0,
            path_id=path.id or 0,
            org_id=badge.org_id,
            issuing_org_id=issuing_org_id,
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            creation_date=now,
            update_date=now,
        )
        db_session.add(run)
        db_session.commit()
        db_session.refresh(run)
    elif (
        issuing_org_id is not None
        and run.issuing_org_id != issuing_org_id
        and run.status != LearningRunStatus.COMPLETED
    ):
        # Learner picked (or switched) an issuer after starting; future grading goes to them
        run.issuing_org_id = issuing_org_id
        run.update_date = _now()
        db_session.add(run)
        db_session.commit()
        db_session.refresh(run)
    return _serialize_run(db_session, run)


async def complete_page(request: Request, data: LearningPageComplete, actor: LearningActor, db_session: Session) -> LearningRunRead:
    run = _get_run(db_session, data.run_uuid, actor)
    page = _get_page(db_session, data.page_uuid)
    activity = db_session.get(LearningActivity, page.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    activity_run = _ensure_activity_run(db_session, run, page.activity_id)

    progress = db_session.exec(
        select(LearningPageProgress).where(
            LearningPageProgress.run_id == run.id,
            LearningPageProgress.page_id == page.id,
        )
    ).first()
    now = datetime.utcnow()
    if not progress:
        progress = LearningPageProgress(
            run_id=run.id or 0,
            activity_run_id=activity_run.id,
            page_id=page.id or 0,
            creation_date=str(now),
            update_date=str(now),
        )
    progress.complete = True
    progress.completed_at = now
    progress.data = data.data
    progress.update_date = str(now)
    db_session.add(progress)

    all_activity_pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == page.activity_id)).all()
    resolved_flow = _resolved_activity_flow(db_session, run, activity_run)
    reachable_uuids = set(resolved_flow.page_uuids) if resolved_flow else {item.page_uuid for item in all_activity_pages}
    page_uuid_by_id = {item.id: item.page_uuid for item in all_activity_pages}
    if resolved_flow:
        for old_progress in db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.activity_run_id == activity_run.id,
                LearningPageProgress.complete == True,
            )
        ).all():
            if page_uuid_by_id.get(old_progress.page_id) not in reachable_uuids:
                old_progress.complete = False
                old_progress.completed_at = None
                old_progress.data = {**(old_progress.data or {}), "invalidated_by_routing": True}
                db_session.add(old_progress)
    activity_run.data = {
        **(activity_run.data or {}),
        "route": {
            "page_uuids": list(resolved_flow.page_uuids) if resolved_flow else [item.page_uuid for item in sorted(all_activity_pages, key=lambda item: item.order)],
            "node_ids": list(resolved_flow.node_ids) if resolved_flow else [],
            "terminal": bool(resolved_flow.terminal) if resolved_flow else True,
            "condition_trace": list(resolved_flow.trace) if resolved_flow else [],
        },
    }
    required_pages = [item for item in all_activity_pages if item.required and item.page_uuid in reachable_uuids]
    completed_page_ids = {
        item.page_id
        for item in db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.complete == True,
            )
        ).all()
    } | {page.id or 0}
    path_can_finish = not resolved_flow or resolved_flow.terminal
    if path_can_finish and required_pages and all((required_page.id or 0) in completed_page_ids for required_page in required_pages):
        can_complete, completion_result = _activity_meets_completion_rules(db_session, run, activity)
        activity_run.data = {
            **(activity_run.data or {}),
            "completion_result": completion_result,
            "last_checked_at": now.isoformat(),
        }
        if can_complete:
            definition = (activity_run.data or {}).get("definition") or {}
            outcomes = definition.get("outcomes") if "outcomes" in definition else (activity.settings or {}).get("outcomes")
            if (activity.settings or {}).get("system_required") and (activity.settings or {}).get("outcomes"):
                outcomes = (activity.settings or {}).get("outcomes")
            if outcomes:
                if run.user_id is None:
                    raise HTTPException(status_code=422, detail="Portfolio outcomes require an authenticated learner")
                user = db_session.get(User, run.user_id)
                if not user:
                    raise HTTPException(status_code=404, detail="Learner not found")
                try:
                    receipts, bindings = apply_portfolio_outcomes(
                        db_session, user, activity_run.id or 0, outcomes,
                        _flow_context(db_session, run, activity_run),
                        (activity_run.data or {}).get("action_receipts") or {},
                    )
                except PortfolioActionError as exc:
                    db_session.rollback()
                    raise HTTPException(status_code=422, detail={"action_id": exc.action_id, "field": exc.field, "message": exc.message}) from exc
                activity_run.data = {**(activity_run.data or {}), "action_receipts": receipts, "bindings": bindings}
            activity_run.status = LearningRunStatus.COMPLETED
            activity_run.completed_at = now
        else:
            activity_run.status = LearningRunStatus.IN_PROGRESS
            activity_run.completed_at = None
        db_session.add(activity_run)
    run.update_date = str(now)
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    _issue_award_if_complete(request, db_session, run)
    if path_can_finish and required_pages and all((required_page.id or 0) in completed_page_ids for required_page in required_pages):
        result = (activity_run.data or {}).get("completion_result") or {}
        if not result.get("passed", True):
            grading = result.get("grading") or {}
            detail = grading.get("failure_message") or "You need a higher score to complete this activity."
            if result.get("reason") == "pending_manual_grades":
                detail = "This activity is waiting for manual grading."
            raise HTTPException(status_code=422, detail=detail)
    db_session.refresh(run)
    return _serialize_run(db_session, run)


async def submit_response(request: Request, data: LearningResponseSubmit, actor: LearningActor, db_session: Session) -> LearningRunRead:
    run = _get_run(db_session, data.run_uuid, actor)
    page = _get_page(db_session, data.page_uuid)
    if _question_block(page) is None:
        raise HTTPException(status_code=422, detail="Responses can only be submitted for pages with a question")
    is_correct, score, feedback_key, result = _grade_answer(page, data.answer)
    variables = _extract_learning_variables(page, result)
    if variables:
        result = {**result, "variables": variables}
        if actor.user_id is not None:
            user = db_session.get(User, actor.user_id)
            if user:
                applied, skipped = _apply_learning_variables_to_user(db_session, user, variables, org_id=page.org_id)
                result = {
                    **result,
                    "variables_applied": applied,
                    "variables_skipped": skipped,
                }
    now = datetime.utcnow()
    attempt = LearningResponseAttempt(
        attempt_uuid=f"learning_attempt_{uuid4()}",
        run_id=run.id or 0,
        page_id=page.id or 0,
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        answer=data.answer,
        is_correct=is_correct,
        score=score,
        feedback_key=feedback_key,
        submitted_at=now,
        graded_at=now if (result or {}).get("grading_status") != "pending" else None,
        result=result,
    )
    db_session.add(attempt)
    db_session.commit()
    await complete_page(request, LearningPageComplete(run_uuid=run.run_uuid, page_uuid=page.page_uuid, data={"attempt_uuid": attempt.attempt_uuid}), actor, db_session)
    db_session.refresh(run)
    return _serialize_run(db_session, run)


async def list_learning_responses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    org_id: int,
    badge_uuid: str | None = None,
    activity_uuid: str | None = None,
    page_uuid: str | None = None,
    grading_status: str | None = "pending",
) -> list[dict]:
    _require_org_admin(db_session, current_user, org_id)
    # The perspective org sees attempts for runs it is responsible for grading:
    # runs explicitly issued under it, plus (for creator orgs) runs with no issuer set.
    statement = (
        select(LearningResponseAttempt)
        .join(LearningPage, LearningResponseAttempt.page_id == LearningPage.id)  # type: ignore
        .join(LearningRun, LearningResponseAttempt.run_id == LearningRun.id)  # type: ignore
        .where(func.coalesce(LearningRun.issuing_org_id, LearningPage.org_id) == org_id)
        .order_by(LearningResponseAttempt.submitted_at.desc())  # type: ignore
    )
    if badge_uuid:
        badge = _get_badge(db_session, badge_uuid)
        statement = statement.where(LearningPage.badge_id == badge.id)
    if activity_uuid:
        activity = _get_activity(db_session, activity_uuid)
        statement = statement.where(LearningPage.activity_id == activity.id)
    if page_uuid:
        statement = statement.where(LearningPage.page_uuid == _clean_uuid(page_uuid, "learning_page_"))

    attempts = db_session.exec(statement).all()
    if grading_status and grading_status != "all":
        attempts = [attempt for attempt in attempts if (attempt.result or {}).get("grading_status") == grading_status]

    page_ids = {attempt.page_id for attempt in attempts}
    page_by_id = {
        page.id or 0: page
        for page in db_session.exec(select(LearningPage).where(LearningPage.id.in_(page_ids))).all()  # type: ignore
    } if page_ids else {}
    badge_ids = {page.badge_id for page in page_by_id.values()}
    badge_by_id = {
        item.id or 0: item
        for item in db_session.exec(select(LearningBadge).where(LearningBadge.id.in_(badge_ids))).all()  # type: ignore
    } if badge_ids else {}
    run_ids = {attempt.run_id for attempt in attempts}
    user_ids = {attempt.user_id for attempt in attempts if attempt.user_id is not None}
    runs = {
        run.id or 0: run
        for run in db_session.exec(select(LearningRun).where(LearningRun.id.in_(run_ids))).all()  # type: ignore
    } if run_ids else {}
    users = {
        user.id or 0: user
        for user in db_session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore
    } if user_ids else {}

    def badge_summary(page: LearningPage | None) -> dict | None:
        badge = badge_by_id.get(page.badge_id) if page else None
        if not badge:
            return None
        return {"id": badge.id, "badge_uuid": badge.badge_uuid, "name": badge.name, "org_id": badge.org_id}

    return [
        {
            **attempt.model_dump(),
            "page": page_by_id.get(attempt.page_id).model_dump() if page_by_id.get(attempt.page_id) else None,
            "badge": badge_summary(page_by_id.get(attempt.page_id)),
            "run": runs.get(attempt.run_id).model_dump() if runs.get(attempt.run_id) else None,
            "user": {
                "id": users[attempt.user_id].id,
                "username": users[attempt.user_id].username,
                "email": users[attempt.user_id].email,
                "first_name": users[attempt.user_id].first_name,
                "last_name": users[attempt.user_id].last_name,
            } if attempt.user_id in users else None,
        }
        for attempt in attempts
    ]


async def grade_learning_response(
    request: Request,
    attempt_uuid: str,
    data: LearningResponseGrade,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    attempt = db_session.exec(
        select(LearningResponseAttempt).where(
            LearningResponseAttempt.attempt_uuid == _clean_uuid(attempt_uuid, "learning_attempt_")
        )
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Learning response not found")
    page = db_session.get(LearningPage, attempt.page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Learning page not found")
    grading_run = db_session.get(LearningRun, attempt.run_id)
    admin = _require_org_admin(db_session, current_user, _effective_issuing_org_id(grading_run, page.org_id))

    max_score = _as_float((attempt.result or {}).get("max_score"), 0.0) \
        or sum(_question_block_points(page, question) for question in _question_blocks(page)) \
        or _as_float((page.scoring or {}).get("points"), 1.0)
    score = max(0.0, min(max_score, float(data.score)))
    now = datetime.utcnow()
    attempt.score = score
    attempt.graded_at = now
    attempt.is_correct = score >= max_score if max_score > 0 else None
    attempt.feedback_key = "correct" if attempt.is_correct else "incorrect" if attempt.is_correct is False else "graded"
    attempt.result = {
        **(attempt.result or {}),
        "grading_status": "graded",
        "score": score,
        "max_score": max_score,
        "feedback": data.feedback or "",
        "graded_by_user_id": admin.id,
        "graded_at": now.isoformat(),
    }
    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

    run = db_session.get(LearningRun, attempt.run_id)
    activity = db_session.get(LearningActivity, page.activity_id)
    if run and activity:
        activity_run = _ensure_activity_run(db_session, run, page.activity_id)
        required_pages = db_session.exec(
            select(LearningPage).where(
                LearningPage.activity_id == page.activity_id,
                LearningPage.required == True,
            )
        ).all()
        completed_page_ids = {
            item.page_id
            for item in db_session.exec(
                select(LearningPageProgress).where(
                    LearningPageProgress.run_id == run.id,
                    LearningPageProgress.complete == True,
                )
            ).all()
        }
        if required_pages and all((required_page.id or 0) in completed_page_ids for required_page in required_pages):
            can_complete, completion_result = _activity_meets_completion_rules(db_session, run, activity)
            activity_run.data = {
                **(activity_run.data or {}),
                "completion_result": completion_result,
                "last_checked_at": now.isoformat(),
            }
            if can_complete:
                activity_run.status = LearningRunStatus.COMPLETED
                activity_run.completed_at = now
            else:
                activity_run.status = LearningRunStatus.IN_PROGRESS
                activity_run.completed_at = None
            db_session.add(activity_run)
            db_session.commit()
            if run:
                db_session.refresh(run)
    award = _issue_award_if_complete(request, db_session, run) if run else None
    # Later commits (activity run updates, award issuance) expire the attempt instance
    db_session.refresh(attempt)
    return {
        **attempt.model_dump(),
        "award": award.model_dump() if award else None,
    }


async def confer_award(request: Request, data: LearningAwardCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    badge = _get_badge(db_session, data.badge_uuid)
    issuing_org_id = data.issuing_org_id if data.issuing_org_id != badge.org_id else None
    if issuing_org_id is not None:
        admin = _require_org_admin(db_session, current_user, issuing_org_id)
        if not _get_approved_issuer_authorization(db_session, badge.id or 0, issuing_org_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your organization is not authorized to issue this badge")
    else:
        admin = _require_org_admin(db_session, current_user, badge.org_id)
    if not badge.direct_conferral_enabled:
        raise HTTPException(status_code=422, detail="Direct conferral is disabled for this badge")
    user = db_session.exec(select(User).where(User.id == data.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db_session.exec(select(LearningBadgeAward).where(LearningBadgeAward.badge_id == badge.id, LearningBadgeAward.user_id == user.id)).first()
    if existing:
        return build_award_response(request, db_session, existing)
    now = datetime.utcnow()
    award = LearningBadgeAward(
        award_uuid=f"award_{uuid4()}",
        badge_id=badge.id or 0,
        org_id=badge.org_id,
        issuing_org_id=issuing_org_id,
        user_id=user.id or 0,
        source=LearningAwardSource.DIRECT_CONFERRAL,
        conferred_by_user_id=admin.id,
        issued_at=now,
        evidence=data.evidence,
        creation_date=str(now),
        update_date=str(now),
    )
    db_session.add(award)
    db_session.commit()
    db_session.refresh(award)
    return build_award_response(request, db_session, award)


def build_learning_badge_class_payload(request: Request, org: Organization, badge: LearningBadge, org_config: OrganizationConfig | None) -> dict:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    issuer = build_issuer_payload(request, org, org_config)
    criteria_url = (badge.badge_metadata or {}).get("criteria_url") or f"{base_url}/orgs/{org.slug}/badges/{badge.badge_uuid.replace('badge_', '')}"
    image_url = (badge.badge_metadata or {}).get("badge_image_url") or badge.thumbnail_image or issuer.get("image") or f"{base_url}/logo-icon.svg"
    return {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "BadgeClass",
        "id": f"{api_base}/badge-awards/badge-class/{badge.badge_uuid}",
        "issuer": issuer["id"],
        "name": (badge.badge_metadata or {}).get("badge_name") or badge.name,
        "description": (badge.badge_metadata or {}).get("badge_description") or badge.description or "",
        "image": image_url,
        "criteria": {
            "id": criteria_url,
            "narrative": badge.criteria or "Complete the required badge learning path.",
        },
    }


def build_learning_assertion_payload(request: Request, org: Organization, badge: LearningBadge, award: LearningBadgeAward, user: User, org_config: OrganizationConfig | None) -> dict:
    api_base = get_public_api_base_url(request)
    badge_class = build_learning_badge_class_payload(request, org, badge, org_config)
    recipient_email = (user.email or "").strip().lower()
    salt = f"launchlms-{award.award_uuid[-12:]}"
    identity_hash = hashlib.sha256(f"{recipient_email}{salt}".encode("utf-8")).hexdigest()
    payload = {
        "@context": OPEN_BADGES_CONTEXT,
        "type": "Assertion",
        "id": f"{api_base}/badge-awards/assertion/{award.award_uuid}",
        "badge": badge_class["id"],
        "verification": {"type": "HostedBadge"},
        "issuedOn": award.issued_at.isoformat() if hasattr(award.issued_at, "isoformat") else str(award.issued_at),
        "recipient": {
            "type": "email",
            "hashed": True,
            "salt": salt,
            "identity": f"sha256${identity_hash}",
        },
    }
    if award.evidence:
        payload["evidence"] = [award.evidence]
    return payload


# ---------------------------------------------------------------------------
# Open Badges 3.0 (Verifiable Credentials data model)
#
# The issuing org is the authoritative `issuer` of the AchievementCredential;
# the org that designed the badge is the `creator` of the Achievement.
# ---------------------------------------------------------------------------

OPEN_BADGES_V3_CONTEXTS = [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
]


def build_ob3_profile(request: Request, org: Organization, org_config: OrganizationConfig | None) -> dict:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    issuer_config = get_org_badge_issuer_config(org, org_config)
    image_url = issuer_config["image_url"] or (
        f"{base_url}/content/orgs/{org.org_uuid}/logos/{org.logo_image}"
        if org.logo_image else f"{base_url}/logo-icon.svg"
    )
    profile: dict = {
        "id": f"{api_base}/badge-awards/issuer/{org.org_uuid}",
        "type": ["Profile"],
        "name": issuer_config["name"] or org.name,
        "url": issuer_config["url"] or f"{base_url}/orgs/{org.slug}",
        "image": {"id": image_url, "type": "Image"},
    }
    if issuer_config["email"] or org.email:
        profile["email"] = issuer_config["email"] or org.email
    if issuer_config["description"]:
        profile["description"] = issuer_config["description"]
    return profile


def build_ob3_achievement(request: Request, creator_org: Organization, badge: LearningBadge, creator_org_config: OrganizationConfig | None) -> dict:
    base_url = get_public_base_url(request)
    api_base = get_public_api_base_url(request)
    creator_profile = build_ob3_profile(request, creator_org, creator_org_config)
    criteria_url = (badge.badge_metadata or {}).get("criteria_url") or f"{base_url}/orgs/{creator_org.slug}/badges/{badge.badge_uuid.replace('badge_', '')}"
    image_url = (badge.badge_metadata or {}).get("badge_image_url") or badge.thumbnail_image or f"{base_url}/logo-icon.svg"
    return {
        "id": f"{api_base}/badge-awards/achievement/{badge.badge_uuid}",
        "type": ["Achievement"],
        "creator": creator_profile,
        "name": (badge.badge_metadata or {}).get("badge_name") or badge.name,
        "description": (badge.badge_metadata or {}).get("badge_description") or badge.description or "",
        "criteria": {
            "id": criteria_url,
            "narrative": badge.criteria or "Complete the required badge learning path.",
        },
        "image": {"id": image_url, "type": "Image"},
    }


def build_ob3_credential(
    request: Request,
    issuing_org: Organization,
    issuing_org_config: OrganizationConfig | None,
    creator_org: Organization,
    creator_org_config: OrganizationConfig | None,
    badge: LearningBadge,
    award: LearningBadgeAward,
    user: User,
) -> dict:
    api_base = get_public_api_base_url(request)
    achievement = build_ob3_achievement(request, creator_org, badge, creator_org_config)
    recipient_email = (user.email or "").strip().lower()
    salt = f"launchlms-{award.award_uuid[-12:]}"
    identity_hash = hashlib.sha256(f"{recipient_email}{salt}".encode("utf-8")).hexdigest()
    issued_at = award.issued_at.isoformat() if hasattr(award.issued_at, "isoformat") else str(award.issued_at)
    if not issued_at.endswith("Z") and "+" not in issued_at:
        issued_at = f"{issued_at}Z"
    credential: dict = {
        "@context": OPEN_BADGES_V3_CONTEXTS,
        "id": f"{api_base}/badge-awards/credential/{award.award_uuid}",
        "type": ["VerifiableCredential", "OpenBadgeCredential"],
        "issuer": build_ob3_profile(request, issuing_org, issuing_org_config),
        "validFrom": issued_at,
        "name": achievement["name"],
        "credentialSubject": {
            "type": ["AchievementSubject"],
            "identifier": [{
                "type": "IdentityObject",
                "hashed": True,
                "identityHash": f"sha256${identity_hash}",
                "identityType": "emailAddress",
                "salt": salt,
            }],
            "achievement": achievement,
        },
    }
    if award.evidence:
        evidence = {"type": ["Evidence"], **{k: v for k, v in award.evidence.items() if isinstance(k, str)}}
        credential["evidence"] = [evidence]
    return credential


def build_award_response(request: Request, db_session: Session, award: LearningBadgeAward) -> dict:
    badge = db_session.exec(select(LearningBadge).where(LearningBadge.id == award.badge_id)).first()
    user = db_session.exec(select(User).where(User.id == award.user_id)).first()
    if not badge or not user:
        raise HTTPException(status_code=404, detail="Badge award data not found")
    org = _get_org(db_session, badge.org_id)
    org_config = _get_org_config(db_session, badge.org_id)
    if award.issuing_org_id is not None and award.issuing_org_id != badge.org_id:
        issuing_org = _get_org(db_session, award.issuing_org_id)
        issuing_org_config = _get_org_config(db_session, award.issuing_org_id)
    else:
        issuing_org = org
        issuing_org_config = org_config
    issuer = build_issuer_payload(request, issuing_org, issuing_org_config)
    badge_class = build_learning_badge_class_payload(request, org, badge, org_config)
    assertion = build_learning_assertion_payload(request, org, badge, award, user, org_config)
    credential = build_ob3_credential(request, issuing_org, issuing_org_config, org, org_config, badge, award, user)
    return {
        "award": award.model_dump(),
        "badge": LearningBadgeRead(**badge.model_dump()).model_dump(),
        "badge_assertion": assertion,
        "badge_class": badge_class,
        "issuer": issuer,
        "open_badges": {
            "assertion": assertion,
            "badge_class": badge_class,
            "issuer": issuer,
            "credential": credential,
        },
        "user": {
            "id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        },
        "org": {
            "id": org.id,
            "org_uuid": org.org_uuid,
            "slug": org.slug,
            "name": org.name,
            "logo_image": org.logo_image,
        },
        "issuing_org": {
            "id": issuing_org.id,
            "org_uuid": issuing_org.org_uuid,
            "slug": issuing_org.slug,
            "name": issuing_org.name,
            "logo_image": issuing_org.logo_image,
        },
    }


async def get_award(request: Request, award_uuid: str, db_session: Session) -> dict:
    award = db_session.exec(select(LearningBadgeAward).where(LearningBadgeAward.award_uuid == _clean_uuid(award_uuid, "award_"))).first()
    if not award:
        raise HTTPException(status_code=404, detail="Badge award not found")
    return build_award_response(request, db_session, award)


async def list_user_awards(request: Request, current_user: PublicUser | AnonymousUser, db_session: Session, org_id: int | None = None) -> list[dict]:
    user = _require_user(current_user)
    statement = select(LearningBadgeAward).where(LearningBadgeAward.user_id == user.id)
    if org_id is not None:
        statement = statement.where(LearningBadgeAward.org_id == org_id)
    awards = db_session.exec(statement).all()
    return [build_award_response(request, db_session, award) for award in awards]

import hashlib
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select

from src.db.learning import (
    BadgeCollection,
    BadgeCollectionCreate,
    BadgeCollectionRead,
    BadgeCollectionUpdate,
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
    LearningBadgeRead,
    LearningBadgeUpdate,
    LearningPage,
    LearningPageComplete,
    LearningPageCreate,
    LearningPageProgress,
    LearningPageRead,
    LearningPageType,
    LearningPageUpdate,
    LearningPath,
    LearningPathRead,
    LearningResponseAttempt,
    LearningResponseSubmit,
    LearningRun,
    LearningRunRead,
    LearningRunStatus,
)
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.security.superadmin import is_user_superadmin
from src.services.courses.openbadges import (
    OPEN_BADGES_CONTEXT,
    build_issuer_payload,
    get_public_api_base_url,
    get_public_base_url,
)
from src.services.guest_sessions import LearningActor


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


def _public_badge_query(org_id: int | None = None):
    statement = select(LearningBadge).where(LearningBadge.public == True, LearningBadge.published == True)
    if org_id is not None:
        statement = statement.where(LearningBadge.org_id == org_id)
    return statement


def _can_read_badge(db_session: Session, badge: LearningBadge, current_user: PublicUser | AnonymousUser) -> bool:
    if badge.public and badge.published:
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


def _select_response_variant(page: LearningPage, latest_attempts_by_page_id: dict[int, LearningResponseAttempt]) -> dict:
    content = page.content or {}
    linked_page_uuid = content.get("linked_page_uuid") or content.get("linkedPageUuid")
    variants = content.get("variants") or {}
    default_variant = variants.get("default") or content.get("default") or {}
    if not linked_page_uuid:
        return default_variant

    linked_attempt = None
    for attempt in latest_attempts_by_page_id.values():
        if attempt.result.get("page_uuid") == _clean_uuid(str(linked_page_uuid), "learning_page_"):
            linked_attempt = attempt
            break
    if not linked_attempt:
        return default_variant

    if linked_attempt.feedback_key and linked_attempt.feedback_key in variants:
        return variants[linked_attempt.feedback_key]
    correctness_key = "correct" if linked_attempt.is_correct else "incorrect"
    return variants.get(correctness_key) or default_variant


def _serialize_run(db_session: Session, run: LearningRun) -> LearningRunRead:
    progress = db_session.exec(select(LearningPage).where(LearningPage.badge_id == run.badge_id)).all()
    progress_by_page = {
        item.page_id: item
        for item in db_session.exec(select(LearningPageProgress).where(LearningPageProgress.run_id == run.id)).all()
    }
    attempts = db_session.exec(select(LearningResponseAttempt).where(LearningResponseAttempt.run_id == run.id)).all()
    award = db_session.exec(select(LearningBadgeAward).where(LearningBadgeAward.run_id == run.id)).first()
    return LearningRunRead(
        id=run.id or 0,
        run_uuid=run.run_uuid,
        badge_id=run.badge_id,
        path_id=run.path_id,
        org_id=run.org_id,
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
        attempts=[attempt.model_dump() for attempt in attempts],
        award=award.model_dump() if award else None,
    )


def _grade_answer(page: LearningPage, answer: dict) -> tuple[bool | None, float | None, str | None, dict]:
    if page.page_type == LearningPageType.MULTIPLE_CHOICE:
        selected = answer.get("option_id") or answer.get("optionId") or answer.get("value")
        correct_options = set((page.scoring or {}).get("correct_option_ids") or (page.scoring or {}).get("correctOptionIds") or [])
        is_correct = selected in correct_options if correct_options else None
        score = 1.0 if is_correct else 0.0 if is_correct is not None else None
        feedback_key = str(selected) if selected else ("correct" if is_correct else "incorrect")
        return is_correct, score, feedback_key, {"selected": selected, "page_uuid": page.page_uuid}
    if page.page_type == LearningPageType.TEXT_INPUT:
        text = str(answer.get("text") or answer.get("value") or "").strip()
        expected = [str(value).strip().lower() for value in (page.scoring or {}).get("accepted_answers", [])]
        is_correct = text.lower() in expected if expected else None
        score = 1.0 if is_correct else 0.0 if is_correct is not None else None
        return is_correct, score, "correct" if is_correct else "incorrect", {"text": text, "page_uuid": page.page_uuid}
    return None, None, None, {"page_uuid": page.page_uuid}


def _ensure_activity_run(db_session: Session, run: LearningRun, activity_id: int) -> LearningActivityRun:
    activity_run = db_session.exec(
        select(LearningActivityRun).where(
            LearningActivityRun.run_id == run.id,
            LearningActivityRun.activity_id == activity_id,
        )
    ).first()
    if activity_run:
        return activity_run
    activity_run = LearningActivityRun(run_id=run.id or 0, activity_id=activity_id, status=LearningRunStatus.IN_PROGRESS)
    db_session.add(activity_run)
    db_session.commit()
    db_session.refresh(activity_run)
    return activity_run


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


async def create_badge(request: Request, data: LearningBadgeCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningBadgeRead:
    _require_org_admin(db_session, current_user, data.org_id)
    now = _now()
    badge = LearningBadge(**data.model_dump(), badge_uuid=f"badge_{uuid4()}", creation_date=now, update_date=now)
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    _get_path_for_badge(db_session, badge)
    return LearningBadgeRead(**badge.model_dump())


async def update_badge(request: Request, badge_uuid: str, data: LearningBadgeUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningBadgeRead:
    badge = _get_badge(db_session, badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(badge, key, value)
    badge.update_date = _now()
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)
    return LearningBadgeRead(**badge.model_dump())


async def get_badge(request: Request, badge_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningBadgeRead:
    badge = _get_badge(db_session, badge_uuid)
    _ensure_read_badge(db_session, badge, current_user)
    return LearningBadgeRead(**badge.model_dump())


async def list_badges(request: Request, org_id: int, current_user: PublicUser | AnonymousUser, db_session: Session, admin: bool = False) -> list[LearningBadgeRead]:
    if admin:
        _require_org_admin(db_session, current_user, org_id)
        statement = select(LearningBadge).where(LearningBadge.org_id == org_id)
    else:
        statement = _public_badge_query(org_id)
    badges = db_session.exec(statement.order_by(LearningBadge.creation_date.desc())).all()  # type: ignore
    return [LearningBadgeRead(**badge.model_dump()) for badge in badges]


async def delete_badge(request: Request, badge_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    badge = _get_badge(db_session, badge_uuid)
    _require_org_admin(db_session, current_user, badge.org_id)
    db_session.delete(badge)
    db_session.commit()
    return {"detail": "Badge deleted"}


async def create_collection(request: Request, data: BadgeCollectionCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> BadgeCollectionRead:
    _require_org_admin(db_session, current_user, data.org_id)
    now = _now()
    collection = BadgeCollection(**data.model_dump(), collection_uuid=f"badge_collection_{uuid4()}", creation_date=now, update_date=now)
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)
    return BadgeCollectionRead(**collection.model_dump(), badges=[])


async def update_collection(request: Request, collection_uuid: str, data: BadgeCollectionUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> BadgeCollectionRead:
    collection = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == _clean_uuid(collection_uuid, "badge_collection_"))).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Badge collection not found")
    _require_org_admin(db_session, current_user, collection.org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(collection, key, value)
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
    badges = db_session.exec(select(LearningBadge).where(LearningBadge.collection_id == collection.id)).all()
    for badge in badges:
        db_session.delete(badge)
    db_session.delete(collection)
    db_session.commit()
    return {"detail": "Badge collection deleted"}


async def list_collections(request: Request, org_id: int, current_user: PublicUser | AnonymousUser, db_session: Session, admin: bool = False) -> list[BadgeCollectionRead]:
    if admin:
        _require_org_admin(db_session, current_user, org_id)
        collections = db_session.exec(select(BadgeCollection).where(BadgeCollection.org_id == org_id)).all()
        badges = db_session.exec(select(LearningBadge).where(LearningBadge.org_id == org_id)).all()
    else:
        collections = db_session.exec(select(BadgeCollection).where(BadgeCollection.org_id == org_id, BadgeCollection.public == True, BadgeCollection.hidden == False)).all()
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
    db_session.commit()
    db_session.refresh(activity)
    if not db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id)).first():
        page = LearningPage(
            activity_id=activity.id or 0,
            badge_id=badge.id or 0,
            org_id=badge.org_id,
            page_type=LearningPageType.INFO,
            title="Untitled page",
            order=1,
            content={"body": ""},
            page_uuid=f"learning_page_{uuid4()}",
            creation_date=now,
            update_date=now,
        )
        db_session.add(page)
        db_session.commit()
        db_session.refresh(page)
        return _serialize_activity(activity, [page])
    return _serialize_activity(activity, [])


async def update_activity(request: Request, activity_uuid: str, data: LearningActivityUpdate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningActivityRead:
    activity = _get_activity(db_session, activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
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
    db_session.delete(activity)
    db_session.commit()
    return {"detail": "Learning activity deleted"}


async def duplicate_activity(request: Request, activity_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningActivityRead:
    activity = _get_activity(db_session, activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
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
    db_session.commit()
    db_session.refresh(clone)
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
    for page in cloned_pages:
        db_session.refresh(page)
    return _serialize_activity(clone, cloned_pages)


async def create_page(request: Request, data: LearningPageCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> LearningPageRead:
    activity = _get_activity(db_session, data.activity_uuid)
    _require_org_admin(db_session, current_user, activity.org_id)
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc())).all()  # type: ignore
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
    db_session.delete(page)
    db_session.commit()
    return {"detail": "Learning page deleted"}


async def start_or_resume_run(request: Request, badge_uuid: str, actor: LearningActor, db_session: Session) -> LearningRunRead:
    badge = _get_badge(db_session, badge_uuid)
    if not (badge.public and badge.published):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Badge is not available")
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
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            creation_date=now,
            update_date=now,
        )
        db_session.add(run)
        db_session.commit()
        db_session.refresh(run)
    return _serialize_run(db_session, run)


async def complete_page(request: Request, data: LearningPageComplete, actor: LearningActor, db_session: Session) -> LearningRunRead:
    run = _get_run(db_session, data.run_uuid, actor)
    page = _get_page(db_session, data.page_uuid)
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

    required_pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == page.activity_id, LearningPage.required == True)).all()
    completed_page_ids = {
        item.page_id
        for item in db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.complete == True,
            )
        ).all()
    } | {page.id or 0}
    if required_pages and all((required_page.id or 0) in completed_page_ids for required_page in required_pages):
        activity_run.status = LearningRunStatus.COMPLETED
        activity_run.completed_at = now
        db_session.add(activity_run)
    run.update_date = str(now)
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    _issue_award_if_complete(request, db_session, run)
    db_session.refresh(run)
    return _serialize_run(db_session, run)


async def submit_response(request: Request, data: LearningResponseSubmit, actor: LearningActor, db_session: Session) -> LearningRunRead:
    run = _get_run(db_session, data.run_uuid, actor)
    page = _get_page(db_session, data.page_uuid)
    if page.page_type not in (LearningPageType.MULTIPLE_CHOICE, LearningPageType.TEXT_INPUT):
        raise HTTPException(status_code=422, detail="Responses can only be submitted for input pages")
    is_correct, score, feedback_key, result = _grade_answer(page, data.answer)
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
        graded_at=now,
        result=result,
    )
    db_session.add(attempt)
    db_session.commit()
    await complete_page(request, LearningPageComplete(run_uuid=run.run_uuid, page_uuid=page.page_uuid, data={"attempt_uuid": attempt.attempt_uuid}), actor, db_session)
    db_session.refresh(run)
    return _serialize_run(db_session, run)


async def confer_award(request: Request, data: LearningAwardCreate, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    badge = _get_badge(db_session, data.badge_uuid)
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


def build_award_response(request: Request, db_session: Session, award: LearningBadgeAward) -> dict:
    badge = db_session.exec(select(LearningBadge).where(LearningBadge.id == award.badge_id)).first()
    user = db_session.exec(select(User).where(User.id == award.user_id)).first()
    if not badge or not user:
        raise HTTPException(status_code=404, detail="Badge award data not found")
    org = _get_org(db_session, badge.org_id)
    org_config = _get_org_config(db_session, badge.org_id)
    issuer = build_issuer_payload(request, org, org_config)
    badge_class = build_learning_badge_class_payload(request, org, badge, org_config)
    assertion = build_learning_assertion_payload(request, org, badge, award, user, org_config)
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

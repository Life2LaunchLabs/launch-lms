import re
from datetime import datetime
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningActivityRun,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningPage,
    LearningPageProgress,
    LearningRun,
    LearningRunStatus,
)
from src.db.media import MediaAsset
from src.db.portfolio import (
    Portfolio,
    PortfolioBadgeVisibilityUpdate,
    PortfolioContentStatus,
    PortfolioFeaturedBadgesUpdate,
    PortfolioFeaturedProjectUpdate,
    PortfolioFeaturedTimelineUpdate,
    PortfolioLink,
    PortfolioModerationStatus,
    PortfolioSection,
    PortfolioSectionsUpdate,
    PortfolioTraitsUpdate,
    PortfolioUpdate,
    PortfolioVisibility,
    ProfileTrait,
    ProjectItem,
    ProjectItemBlock,
    ProjectItemCreate,
    ProjectItemUpdate,
    PublishRequest,
    TimelineEntry,
    TimelineEntryBlock,
    TimelineEntryCreate,
    TimelineEntryUpdate,
    TimelineProjectLink,
)
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.services.learning import ONBOARDING_ACTIVITY_UUID, ONBOARDING_BADGE_UUID

DEFAULT_SECTIONS = (
    "about",
    "featured_badges",
    "traits",
    "current_timeline",
    "featured_projects",
    "instagram",
    "youtube",
)
ALLOWED_BLOCK_TYPES = {
    "text",
    "image",
    "gallery",
    "video",
    "link",
    "process",
    "contribution",
    "outcome",
    "quote",
    "tools",
    "collaborators",
}


def _now() -> str:
    return str(datetime.now())


def _slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return clean[:80] or "project"


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _portfolio_state(portfolio: Portfolio, meaningful_count: int) -> str:
    if (
        _enum_value(portfolio.moderation_status)
        == PortfolioModerationStatus.RESTRICTED.value
    ):
        return "restricted"
    if portfolio.published_at:
        return "published"
    if portfolio.first_published_at:
        return "unpublished"
    if not (
        portfolio.display_name.strip()
        or portfolio.headline.strip()
        or portfolio.short_bio.strip()
        or meaningful_count
    ):
        return "empty"
    blockers = _readiness_blockers(portfolio, meaningful_count)
    return "ready" if not blockers else "building"


def _readiness_blockers(portfolio: Portfolio, meaningful_count: int) -> list[str]:
    blockers = []
    if not portfolio.privacy_confirmed_at:
        blockers.append("privacy_confirmation_required")
    if (
        _enum_value(portfolio.moderation_status)
        != PortfolioModerationStatus.CLEAR.value
    ):
        blockers.append("moderation_clearance_required")
    return blockers


def _get_portfolio(db_session: Session, user_id: int) -> Portfolio | None:
    return db_session.exec(
        select(Portfolio).where(Portfolio.user_id == user_id)
    ).first()


def _launch_ready_state(
    user_id: int, db_session: Session, project_count: int = 0, timeline_count: int = 0
) -> dict:
    bind = db_session.get_bind()
    if not inspect(bind).has_table("learningactivity"):
        return {"items": [], "completed": 0, "total": 0, "percent": 0, "nextIncomplete": None, "earned": False}
    badge = db_session.exec(
        select(LearningBadge).where(LearningBadge.badge_uuid == ONBOARDING_BADGE_UUID)
    ).first()
    onboarding = db_session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == ONBOARDING_ACTIVITY_UUID)).first()
    award = (
        db_session.exec(
            select(LearningBadgeAward).where(
                LearningBadgeAward.user_id == user_id,
                LearningBadgeAward.badge_id == badge.id,
            )
        ).first()
        if badge
        else None
    )
    onboarding_complete = False
    if onboarding:
        onboarding_complete = bool(db_session.exec(select(LearningActivityRun).join(LearningRun, LearningActivityRun.run_id == LearningRun.id).where(LearningRun.user_id == user_id, LearningActivityRun.activity_id == onboarding.id, LearningActivityRun.status == LearningRunStatus.COMPLETED)).first())
    portfolio = _get_portfolio(db_session, user_id)
    traits = list(db_session.exec(select(ProfileTrait).where(ProfileTrait.portfolio_id == portfolio.id)).all()) if portfolio else []
    has_timeline = bool(portfolio and db_session.exec(select(TimelineEntry).where(TimelineEntry.portfolio_id == portfolio.id, TimelineEntry.status != PortfolioContentStatus.ARCHIVED)).first())
    started_other_badge = bool(db_session.exec(select(LearningRun).join(LearningBadge, LearningRun.badge_id == LearningBadge.id).where(LearningRun.user_id == user_id, LearningBadge.system_type.is_(None))).first())  # type: ignore
    facts = {
        "onboarding": onboarding_complete,
        "current_experience": has_timeline,
        "projects": project_count > 0,
        "strength": any(item.trait_type == "strength" for item in traits),
        "value": any(item.trait_type == "value" for item in traits),
        "badge_started": started_other_badge,
        "preview": bool(portfolio and portfolio.previewed_at),
    }
    definitions = [
        ("onboarding", "Complete your profile", "Add your name, introduction, and the basics that make this portfolio yours.", "/badges/badge_system_onboarding/chapter/learning_activity_system_onboarding_intro?returnTo=/portfolio"),
        ("current_experience", "Add a Timeline experience", "Share a current, recent, or formative part of your story.", "/portfolio/timeline?experience=work_career"),
        ("projects", "Add your first project", "Show a project, performance, volunteer effort, hobby, or anything you made.", "/portfolio/projects/new"),
        ("strength", "Add your strengths", "Name what you are good at or actively developing.", "/portfolio?edit=strengths"),
        ("value", "Add your values", "Share what matters to you and guides your choices.", "/portfolio?edit=values"),
        ("badge_started", "Find a badge to start", "Choose something you want to learn or prove, then start its badge path.", "/badges?choose=1"),
        ("preview", "Preview your portfolio", "See exactly what visitors will see before you share it.", "/portfolio/preview"),
    ]
    items = [{"key": key, "label": label, "supportingText": supporting, "href": href, "complete": facts[key]} for key, label, supporting, href in definitions]
    completed_count = sum(1 for item in items if item["complete"])
    if badge and completed_count == len(items) and not award:
        now = datetime.utcnow()
        award = LearningBadgeAward(award_uuid=f"award_{uuid4()}", badge_id=badge.id or 0, org_id=badge.org_id, user_id=user_id, source=LearningAwardSource.CHECKLIST_COMPLETION, issued_at=now, evidence={"type": "portfolio_launch_ready_checklist", "items": [item["key"] for item in items]}, creation_date=str(now), update_date=str(now))
        try:
            with db_session.begin_nested():
                db_session.add(award)
                db_session.flush()
            db_session.commit()
            db_session.refresh(award)
        except IntegrityError:
            db_session.rollback()
            award = db_session.exec(select(LearningBadgeAward).where(LearningBadgeAward.badge_id == badge.id, LearningBadgeAward.user_id == user_id)).first()
    next_incomplete = next((item for item in items if not item["complete"]), None)
    return {"items": items, "completed": completed_count, "total": len(items), "percent": round(completed_count / len(items) * 100), "nextIncomplete": next_incomplete, "earned": bool(award)}


def get_or_create_portfolio(current_user: PublicUser, db_session: Session) -> Portfolio:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    portfolio = _get_portfolio(db_session, current_user.id)
    if portfolio:
        existing_types = {
            item.section_type
            for item in db_session.exec(
                select(PortfolioSection).where(
                    PortfolioSection.portfolio_id == portfolio.id
                )
            ).all()
        }
        if missing := [
            section_type
            for section_type in DEFAULT_SECTIONS
            if section_type not in existing_types
        ]:
            now = _now()
            next_order = len(existing_types)
            for offset, section_type in enumerate(missing):
                db_session.add(
                    PortfolioSection(
                        section_uuid=f"sec_{uuid4().hex}",
                        portfolio_id=portfolio.id or 0,
                        section_type=section_type,
                        sort_order=next_order + offset,
                        creation_date=now,
                        update_date=now,
                    )
                )
            db_session.commit()
        return portfolio
    now = _now()
    portfolio = Portfolio(
        portfolio_uuid=f"por_{uuid4().hex}",
        user_id=current_user.id,
        display_name=" ".join(
            part for part in (current_user.first_name, current_user.last_name) if part
        ).strip(),
        short_bio=current_user.bio or "",
        creation_date=now,
        update_date=now,
    )
    db_session.add(portfolio)
    db_session.flush()
    for index, section_type in enumerate(DEFAULT_SECTIONS):
        db_session.add(
            PortfolioSection(
                section_uuid=f"sec_{uuid4().hex}",
                portfolio_id=portfolio.id or 0,
                section_type=section_type,
                sort_order=index,
                creation_date=now,
                update_date=now,
            )
        )
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio


def _project_query(portfolio_id: int, public_only: bool = False):
    statement = select(ProjectItem).where(
        ProjectItem.portfolio_id == portfolio_id,
        ProjectItem.status != PortfolioContentStatus.ARCHIVED.value,
    )
    if public_only:
        statement = statement.where(
            ProjectItem.status == PortfolioContentStatus.PUBLISHED.value,
            ProjectItem.visibility != PortfolioVisibility.PRIVATE.value,
        )
    return statement.order_by(ProjectItem.featured.desc(), ProjectItem.update_date.desc())


def _project_dto(project: ProjectItem, db_session: Session, public_only: bool = False) -> dict:
    blocks = db_session.exec(
        select(ProjectItemBlock)
        .where(ProjectItemBlock.project_item_id == project.id)
        .order_by(ProjectItemBlock.sort_order)
    ).all()
    if public_only:
        blocks = [
            block
            for block in blocks
            if _enum_value(block.visibility) != PortfolioVisibility.PRIVATE.value
        ]
    cover = (
        db_session.exec(
            select(MediaAsset).where(MediaAsset.id == project.cover_asset_id)
        ).first()
        if project.cover_asset_id
        else None
    )
    if public_only:
        return {
            "project_uuid": project.project_uuid,
            "slug": project.slug,
            "story_kind": _enum_value(project.story_kind),
            "title": project.title,
            "subtitle": project.subtitle,
            "summary": project.summary,
            "role_label": project.role_label,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "date_precision": project.date_precision,
            "is_ongoing": project.is_ongoing,
            "featured": project.featured,
            "cover_url": cover.url if cover else "",
            "blocks": [
                {
                    "block_uuid": block.block_uuid,
                    "block_type": block.block_type,
                    "data": block.data,
                    "sort_order": block.sort_order,
                }
                for block in blocks
            ],
        }
    return {
        **project.model_dump(),
        "story_kind": _enum_value(project.story_kind),
        "status": _enum_value(project.status),
        "visibility": _enum_value(project.visibility),
        "cover_url": cover.url if cover else "",
        "cover_asset_uuid": cover.asset_uuid if cover else None,
        "blocks": [block.model_dump() for block in blocks],
    }


def _timeline_query(portfolio_id: int, public_only: bool = False):
    statement = select(TimelineEntry).where(
        TimelineEntry.portfolio_id == portfolio_id,
        TimelineEntry.status != PortfolioContentStatus.ARCHIVED.value,
    )
    if public_only:
        statement = statement.where(
            TimelineEntry.status == PortfolioContentStatus.PUBLISHED.value,
            TimelineEntry.visibility != PortfolioVisibility.PRIVATE.value,
        )
    return statement.order_by(
        TimelineEntry.is_current.desc(),
        TimelineEntry.start_date.desc(),
        TimelineEntry.update_date.desc(),
    )


def _timeline_dto(
    entry: TimelineEntry, db_session: Session, public_only: bool = False
) -> dict:
    links = db_session.exec(
        select(TimelineProjectLink)
        .where(TimelineProjectLink.timeline_entry_id == entry.id)
        .order_by(TimelineProjectLink.sort_order)
    ).all()
    blocks = list(
        db_session.exec(
            select(TimelineEntryBlock)
            .where(TimelineEntryBlock.timeline_entry_id == entry.id)
            .order_by(TimelineEntryBlock.sort_order)
        ).all()
    )
    if public_only:
        blocks = [
            block
            for block in blocks
            if _enum_value(block.visibility) != PortfolioVisibility.PRIVATE.value
        ]
    cover = (
        db_session.exec(
            select(MediaAsset).where(MediaAsset.id == entry.cover_asset_id)
        ).first()
        if entry.cover_asset_id
        else None
    )
    linked_project = []
    for link in links:
        project = db_session.exec(
            select(ProjectItem).where(ProjectItem.id == link.project_item_id)
        ).first()
        if (
            not project
            or _enum_value(project.status) == PortfolioContentStatus.ARCHIVED.value
        ):
            continue
        if public_only and (
            _enum_value(project.status) != PortfolioContentStatus.PUBLISHED.value
            or _enum_value(project.visibility) == PortfolioVisibility.PRIVATE.value
        ):
            continue
        linked_project.append(
            {
                **_project_dto(project, db_session, public_only),
                "relationship_label": link.relationship_label,
            }
        )
    if public_only:
        return {
            "timeline_uuid": entry.timeline_uuid,
            "slug": entry.slug,
            "entry_type": entry.entry_type,
            "title": entry.title,
            "organization": entry.organization,
            "location_label": entry.location_label,
            "details": entry.details,
            "summary": entry.summary,
            "start_date": entry.start_date,
            "end_date": entry.end_date,
            "start_precision": entry.start_precision,
            "end_precision": entry.end_precision,
            "is_current": entry.is_current,
            "cover_url": cover.url if cover else "",
            "blocks": [
                {
                    "block_uuid": block.block_uuid,
                    "block_type": block.block_type,
                    "data": block.data,
                    "sort_order": block.sort_order,
                }
                for block in blocks
            ],
            "projects": linked_project,
        }
    return {
        **entry.model_dump(),
        "status": _enum_value(entry.status),
        "visibility": _enum_value(entry.visibility),
        "cover_url": cover.url if cover else "",
        "cover_asset_uuid": cover.asset_uuid if cover else None,
        "blocks": [block.model_dump() for block in blocks],
        "projects": linked_project,
    }


def portfolio_shell(
    portfolio: Portfolio, db_session: Session, public_only: bool = False
) -> dict:
    user = db_session.exec(select(User).where(User.id == portfolio.user_id)).first()
    links = list(
        db_session.exec(
            select(PortfolioLink)
            .where(PortfolioLink.portfolio_id == portfolio.id)
            .order_by(PortfolioLink.sort_order)
        ).all()
    )
    normalized_socials = [
        {"type": link.platform or link.link_type, "url": link.url}
        for link in links
        if link.link_type == "social"
        and (
            not public_only
            or _enum_value(link.visibility) != PortfolioVisibility.PRIVATE.value
        )
    ]
    legacy_socials = (
        (((user.profile or {}).get("header") or {}).get("socials") or [])
        if user and isinstance(user.profile, dict)
        else []
    )
    legacy_preview = (
        legacy_import_preview(user, db_session)
        if user and not public_only
        else {"projects": [], "timeline": []}
    )
    socials_migrated = bool((portfolio.theme_settings or {}).get("socials_migrated"))
    project = list(
        db_session.exec(_project_query(portfolio.id or 0, public_only=public_only)).all()
    )
    timeline = list(
        db_session.exec(
            _timeline_query(portfolio.id or 0, public_only=public_only)
        ).all()
    )
    bind = db_session.get_bind()
    trait_query = (
        select(ProfileTrait)
        .where(ProfileTrait.portfolio_id == portfolio.id)
        .order_by(ProfileTrait.sort_order)
    )
    traits = (
        list(db_session.exec(trait_query).all())
        if bind is not None and inspect(bind).has_table("profiletrait")
        else []
    )
    if public_only:
        traits = [
            item
            for item in traits
            if _enum_value(item.visibility) != PortfolioVisibility.PRIVATE.value
        ]
    meaningful_count = len(project) + len(timeline)
    sections = list(
        db_session.exec(
            select(PortfolioSection)
            .where(PortfolioSection.portfolio_id == portfolio.id)
            .order_by(PortfolioSection.sort_order)
        ).all()
    )
    if public_only:
        sections = [
            section
            for section in sections
            if section.enabled
            and _enum_value(section.visibility) != PortfolioVisibility.PRIVATE.value
        ]
    launch_ready = (
        _launch_ready_state(portfolio.user_id, db_session, len(project), len(timeline))
        if not public_only
        else None
    )
    learning_tables = (
        set(inspect(bind).get_table_names()) if bind is not None else set()
    )
    awards = (
        list(
            db_session.exec(
                select(LearningBadgeAward).where(
                    LearningBadgeAward.user_id == portfolio.user_id
                )
            ).all()
        )
        if "learningbadgeaward" in learning_tables
        else []
    )
    earned_ids = {item.badge_id for item in awards}
    runs = (
        list(
            db_session.exec(
                select(LearningRun).where(LearningRun.user_id == portfolio.user_id)
            ).all()
        )
        if "learningrun" in learning_tables
        else []
    )
    in_progress_ids = {
        item.badge_id
        for item in runs
        if item.status != "completed" and item.badge_id not in earned_ids
    }
    run_ids = {item.id for item in runs if item.id}
    badge_page_totals: dict[int, int] = {}
    completed_pages_by_run: dict[int, int] = {}
    if badge_ids := (earned_ids | in_progress_ids):
        if "learningpage" in learning_tables:
            for page in db_session.exec(
                select(LearningPage).where(LearningPage.badge_id.in_(badge_ids))
            ).all():  # type: ignore
                badge_page_totals[page.badge_id] = (
                    badge_page_totals.get(page.badge_id, 0) + 1
                )
        if run_ids and "learningpageprogress" in learning_tables:
            for progress in db_session.exec(
                select(LearningPageProgress).where(
                    LearningPageProgress.run_id.in_(run_ids),
                    LearningPageProgress.complete == True,  # type: ignore
                )
            ).all():
                completed_pages_by_run[progress.run_id] = (
                    completed_pages_by_run.get(progress.run_id, 0) + 1
                )
    badge_ids = earned_ids | (set() if public_only else in_progress_ids)
    badge_records = (
        list(
            db_session.exec(
                select(LearningBadge).where(LearningBadge.id.in_(badge_ids))
            ).all()
        )
        if badge_ids and "learningbadge" in learning_tables
        else []
    )  # type: ignore
    badges_by_id = {item.id: item for item in badge_records}
    run_by_badge_id = {
        item.badge_id: item for item in runs if item.badge_id in in_progress_ids
    }

    def badge_dto(item: LearningBadge, badge_status: str) -> dict:
        run = run_by_badge_id.get(item.id or 0)
        total = badge_page_totals.get(item.id or 0, 0)
        completed = (
            total
            if badge_status == "earned"
            else completed_pages_by_run.get(run.id or 0, 0)
            if run
            else 0
        )
        return {
            "badge_uuid": item.badge_uuid,
            "name": item.name,
            "description": item.description or "",
            "thumbnail_image": item.thumbnail_image or "",
            "status": badge_status,
            "progress": {
                "completed": completed,
                "total": total,
                "percent": 100
                if badge_status == "earned"
                else round((completed / total) * 100)
                if total
                else 0,
            },
        }

    earned_badges = [
        badge_dto(badges_by_id[item.badge_id], "earned")
        for item in awards
        if item.badge_id in badges_by_id
    ]
    in_progress_badges = [
        badge_dto(badges_by_id[item.badge_id], "in_progress")
        for item in runs
        if item.badge_id in in_progress_ids
        and item.badge_id in badges_by_id
        and badges_by_id[item.badge_id].badge_uuid != ONBOARDING_BADGE_UUID
    ]
    earned_badges = list({item["badge_uuid"]: item for item in earned_badges}.values())
    in_progress_badges = list(
        {item["badge_uuid"]: item for item in in_progress_badges}.values()
    )
    hidden_badge_uuids = set(
        (portfolio.theme_settings or {}).get("hidden_badge_uuids") or []
    )
    if public_only:
        earned_badges = [
            item
            for item in earned_badges
            if item["badge_uuid"] not in hidden_badge_uuids
        ]
    featured_uuids = list(
        (portfolio.theme_settings or {}).get("featured_badge_uuids") or []
    )
    earned_by_uuid = {item["badge_uuid"]: item for item in earned_badges}
    featured_badges = [
        earned_by_uuid[uuid] for uuid in featured_uuids if uuid in earned_by_uuid
    ]
    featured_badges += [
        item
        for item in earned_badges
        if item["badge_uuid"] not in {badge["badge_uuid"] for badge in featured_badges}
    ]
    if not public_only:
        featured_badges += in_progress_badges
    featured_badges = featured_badges[:5]
    blockers = _readiness_blockers(portfolio, meaningful_count)
    if not public_only and user and not user.email_verified:
        blockers.append("email_verification_required")
    state = _portfolio_state(portfolio, meaningful_count)
    views = [
        {"key": "overview", "visible": True, "itemCount": 1},
        {
            "key": "projects",
            "visible": not public_only or bool(project),
            "itemCount": len(project),
        },
        {
            "key": "timeline",
            "visible": not public_only or bool(timeline),
            "itemCount": len(timeline),
        },
        {
            "key": "resume",
            "visible": not public_only or bool(project or timeline),
            "itemCount": len(project) + len(timeline),
        },
        {
            "key": "badges",
            "visible": not public_only or bool(earned_badges),
            "itemCount": len(earned_badges)
            + (0 if public_only else len(in_progress_badges)),
        },
    ]
    return {
        "portfolio": (
            {
                "portfolio_uuid": portfolio.portfolio_uuid,
                "display_name": portfolio.display_name,
                "headline": portfolio.headline,
                "short_bio": portfolio.short_bio,
                "location_label": portfolio.location_label,
                "theme_id": portfolio.theme_id,
                "published_at": portfolio.published_at,
            }
            if public_only
            else {
                **portfolio.model_dump(),
            }
        )
        | {
            "username": user.username if user else "",
            "user_uuid": user.user_uuid if user else "",
            "avatar_image": user.avatar_image if user else "",
            "socials": normalized_socials
            if socials_migrated
            else (normalized_socials or legacy_socials),
            "state": state,
            "visibility": _enum_value(portfolio.visibility),
            **(
                {}
                if public_only
                else {
                    "moderation_status": _enum_value(portfolio.moderation_status),
                    "email": user.email if user else "",
                    "email_verified": bool(user.email_verified) if user else False,
                    "has_legacy_portfolio": bool(
                        legacy_preview["projects"] or legacy_preview["timeline"]
                    )
                    and not bool((portfolio.theme_settings or {}).get("legacy_import_dismissed")),
                }
            ),
        },
        "views": views,
        "readiness": {
            "canPublish": not blockers,
            "completed": int("privacy_confirmation_required" not in blockers)
            + int("email_verification_required" not in blockers),
            "total": 2,
            "blockers": blockers,
        },
        "checklist": launch_ready,
        "permissions": {
            "canEdit": not public_only,
            "canPublish": not public_only and state != "restricted",
        },
        "projects": [_project_dto(item, db_session, public_only=public_only) for item in project],
        "timeline": [
            {
                **_timeline_dto(item, db_session, public_only=public_only),
                "featured": item.timeline_uuid
                in set(
                    (portfolio.theme_settings or {}).get("featured_timeline_uuids")
                    or []
                ),
            }
            for item in timeline
        ],
        "traits": {
            kind: [item.label for item in traits if item.trait_type == kind]
            for kind in ("strength", "value")
        },
        "sections": [
            {
                "section_uuid": item.section_uuid,
                "section_type": item.section_type,
                "title_override": item.title_override,
                "enabled": item.enabled,
                "sort_order": item.sort_order,
            }
            for item in sections
        ],
        "badges": {
            "earned": earned_badges,
            "inProgress": in_progress_badges,
            "featured": featured_badges,
            "featuredBadgeUuids": featured_uuids,
            "hiddenBadgeUuids": list(hidden_badge_uuids) if not public_only else [],
        },
    }


def update_featured_badges(
    payload: PortfolioFeaturedBadgesUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    requested = list(dict.fromkeys(payload.badge_uuids))
    earned = db_session.exec(
        select(LearningBadgeAward).where(LearningBadgeAward.user_id == current_user.id)
    ).all()
    earned_ids = {item.badge_id for item in earned}
    badges = (
        db_session.exec(
            select(LearningBadge).where(LearningBadge.id.in_(earned_ids))
        ).all()
        if earned_ids
        else []
    )  # type: ignore
    allowed = {item.badge_uuid for item in badges}
    if any(item not in allowed for item in requested):
        raise HTTPException(
            status_code=422, detail="Only earned badges can be featured"
        )
    portfolio.theme_settings = {
        **(portfolio.theme_settings or {}),
        "featured_badge_uuids": requested,
    }
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def update_featured_projects(
    payload: PortfolioFeaturedProjectUpdate, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    project = list(db_session.exec(_project_query(portfolio.id or 0)).all())
    requested = list(
        dict.fromkeys(
            payload.project_uuids
            if payload.project_uuids is not None
            else ([payload.project_uuid] if payload.project_uuid else [])
        )
    )
    available = {item.project_uuid for item in project}
    if any(project_uuid not in available for project_uuid in requested):
        raise HTTPException(
            status_code=422, detail="Only your available project can be featured"
        )
    now = _now()
    changed = False
    for item in project:
        featured = item.project_uuid in requested
        if item.featured != featured:
            item.featured = featured
            item.revision += 1
            item.update_date = now
            db_session.add(item)
            changed = True
    if changed:
        portfolio.revision += 1
        portfolio.update_date = now
        db_session.add(portfolio)
        db_session.commit()
        db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def update_featured_timeline(
    payload: PortfolioFeaturedTimelineUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    requested = list(dict.fromkeys(payload.timeline_uuids))
    timeline = list(db_session.exec(_timeline_query(portfolio.id or 0)).all())
    available = {item.timeline_uuid for item in timeline}
    if any(timeline_uuid not in available for timeline_uuid in requested):
        raise HTTPException(
            status_code=422, detail="Only your available timeline entries can be featured"
        )
    portfolio.theme_settings = {
        **(portfolio.theme_settings or {}),
        "featured_timeline_uuids": requested,
    }
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def update_badge_visibility(
    payload: PortfolioBadgeVisibilityUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    _check_revision(portfolio.revision, payload.revision)
    earned = db_session.exec(
        select(LearningBadgeAward).where(LearningBadgeAward.user_id == current_user.id)
    ).all()
    earned_ids = {item.badge_id for item in earned}
    badges = (
        db_session.exec(
            select(LearningBadge).where(LearningBadge.id.in_(earned_ids))
        ).all()
        if earned_ids
        else []
    )  # type: ignore
    allowed = {item.badge_uuid for item in badges}
    hidden = list(dict.fromkeys(payload.hidden_badge_uuids))
    if any(item not in allowed for item in hidden):
        raise HTTPException(status_code=422, detail="Only earned badges can be hidden")
    portfolio.theme_settings = {
        **(portfolio.theme_settings or {}),
        "hidden_badge_uuids": hidden,
    }
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def update_sections(
    payload: PortfolioSectionsUpdate, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    _check_revision(portfolio.revision, payload.revision)
    existing = list(
        db_session.exec(
            select(PortfolioSection).where(
                PortfolioSection.portfolio_id == portfolio.id
            )
        ).all()
    )
    by_uuid = {item.section_uuid: item for item in existing}
    requested = [item.section_uuid for item in payload.sections]
    if len(requested) != len(set(requested)) or set(requested) != set(by_uuid):
        raise HTTPException(
            status_code=422,
            detail="Sections must contain every portfolio section exactly once",
        )
    now = _now()
    for index, requested_item in enumerate(payload.sections):
        section = by_uuid[requested_item.section_uuid]
        section.sort_order = index
        section.enabled = requested_item.enabled
        section.update_date = now
        db_session.add(section)
    portfolio.revision += 1
    portfolio.update_date = now
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def update_traits(
    payload: PortfolioTraitsUpdate, current_user: PublicUser, db_session: Session
) -> dict:
    if payload.trait_type not in {"strength", "value"}:
        raise HTTPException(
            status_code=422, detail="trait_type must be strength or value"
        )
    portfolio = get_or_create_portfolio(current_user, db_session)
    existing = db_session.exec(
        select(ProfileTrait).where(
            ProfileTrait.portfolio_id == portfolio.id,
            ProfileTrait.trait_type == payload.trait_type,
        )
    ).all()
    for item in existing:
        db_session.delete(item)
    now = datetime.utcnow().isoformat()
    labels = list(
        dict.fromkeys(label.strip() for label in payload.labels if label.strip())
    )
    for index, label in enumerate(labels):
        db_session.add(
            ProfileTrait(
                trait_uuid=f"trt_{uuid4().hex}",
                portfolio_id=portfolio.id or 0,
                trait_type=payload.trait_type,
                label=label,
                source="manual",
                sort_order=index,
                creation_date=now,
                update_date=now,
            )
        )
    portfolio.revision += 1
    portfolio.update_date = now
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def get_owner_shell(
    current_user: PublicUser, db_session: Session, mark_previewed: bool = False
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    if mark_previewed and not portfolio.previewed_at:
        portfolio.previewed_at = _now()
        portfolio.update_date = portfolio.previewed_at
        portfolio.revision += 1
        db_session.add(portfolio)
        db_session.commit()
        db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session, public_only=mark_previewed)


def update_portfolio(
    payload: PortfolioUpdate, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    _check_revision(portfolio.revision, payload.revision)
    for field, value in payload.model_dump(
        exclude={"revision", "socials"}, exclude_unset=True
    ).items():
        setattr(portfolio, field, value)
    if payload.socials is not None:
        _replace_socials(portfolio, payload.socials, db_session)
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def _replace_socials(
    portfolio: Portfolio, socials: list[dict], db_session: Session
) -> None:
    allowed = {"website", "linkedin", "instagram", "youtube", "x"}
    cleaned: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw in socials:
        social_type = str(raw.get("type") or "").strip().lower()
        url = str(raw.get("url") or "").strip()
        if not url:
            continue
        if social_type not in allowed or social_type in seen:
            raise HTTPException(
                status_code=422, detail="Invalid or duplicate social link type"
            )
        parsed = urlparse(url if "://" in url else f"https://{url}")
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(
                status_code=422, detail="Social links must be valid web URLs"
            )
        cleaned.append((social_type, parsed.geturl()))
        seen.add(social_type)
    for existing in db_session.exec(
        select(PortfolioLink).where(
            PortfolioLink.portfolio_id == portfolio.id,
            PortfolioLink.link_type == "social",
        )
    ).all():
        db_session.delete(existing)
    now = _now()
    for index, (social_type, url) in enumerate(cleaned):
        db_session.add(
            PortfolioLink(
                link_uuid=f"lnk_{uuid4().hex}",
                portfolio_id=portfolio.id or 0,
                link_type="social",
                platform=social_type,
                label=social_type.title(),
                url=url,
                visibility=PortfolioVisibility.PUBLIC,
                sort_order=index,
                safety_status="clear",
                creation_date=now,
                update_date=now,
            )
        )
    portfolio.theme_settings = {
        **(portfolio.theme_settings or {}),
        "socials_migrated": True,
    }


def _check_revision(current: int, received: int) -> None:
    if current != received:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Portfolio content changed elsewhere",
                "currentRevision": current,
            },
        )


def _unique_slug(
    portfolio_id: int, title: str, db_session: Session, exclude_id: int | None = None
) -> str:
    base = _slug(title)
    candidate = base
    counter = 2
    while True:
        existing = db_session.exec(
            select(ProjectItem).where(
                ProjectItem.portfolio_id == portfolio_id, ProjectItem.slug == candidate
            )
        ).first()
        if not existing or existing.id == exclude_id:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def _replace_blocks(project: ProjectItem, blocks: list[dict], db_session: Session) -> None:
    for existing in db_session.exec(
        select(ProjectItemBlock).where(ProjectItemBlock.project_item_id == project.id)
    ).all():
        db_session.delete(existing)
    now = _now()
    for index, raw in enumerate(blocks):
        block_type = str(raw.get("block_type") or raw.get("type") or "text")
        if block_type not in ALLOWED_BLOCK_TYPES:
            raise HTTPException(
                status_code=422, detail=f"Unsupported Project block type: {block_type}"
            )
        db_session.add(
            ProjectItemBlock(
                block_uuid=f"wbl_{uuid4().hex}",
                project_item_id=project.id or 0,
                block_type=block_type,
                data=raw.get("data") or {},
                sort_order=index,
                creation_date=now,
                update_date=now,
            )
        )


def _cover_asset_id(
    asset_uuid: str | None, user_id: int, db_session: Session
) -> int | None:
    if not asset_uuid:
        return None
    asset = db_session.exec(
        select(MediaAsset).where(
            MediaAsset.asset_uuid == asset_uuid, MediaAsset.owner_user_id == user_id
        )
    ).first()
    if not asset or _enum_value(asset.media_type) != "image":
        raise HTTPException(
            status_code=422, detail="Cover image is not an owned image asset"
        )
    return asset.id


def create_project(
    payload: ProjectItemCreate, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    if payload.idempotency_key:
        existing = db_session.exec(
            select(ProjectItem).where(
                ProjectItem.portfolio_id == portfolio.id,
                ProjectItem.source_reference == payload.idempotency_key,
            )
        ).first()
        if existing:
            return _project_dto(existing, db_session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    now = _now()
    project = ProjectItem(
        project_uuid=f"prj_{uuid4().hex}",
        portfolio_id=portfolio.id or 0,
        title=title,
        story_kind=payload.story_kind,
        subtitle=payload.subtitle.strip(),
        summary=payload.summary.strip(),
        role_label=payload.role_label.strip(),
        status=PortfolioContentStatus.PUBLISHED,
        visibility=payload.visibility,
        featured=payload.featured,
        start_date=payload.start_date,
        end_date=None if payload.is_ongoing else payload.end_date,
        date_precision="month",
        is_ongoing=payload.is_ongoing,
        cover_asset_id=_cover_asset_id(
            payload.cover_asset_uuid, current_user.id, db_session
        ),
        slug=_unique_slug(portfolio.id or 0, title, db_session),
        source_reference=payload.idempotency_key,
        creation_date=now,
        update_date=now,
    )
    db_session.add(project)
    db_session.flush()
    _replace_blocks(project, payload.blocks, db_session)
    portfolio.revision += 1
    portfolio.update_date = now
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(project)
    return _project_dto(project, db_session)


def _owner_project(
    project_uuid: str, current_user: PublicUser, db_session: Session
) -> tuple[Portfolio, ProjectItem]:
    portfolio = get_or_create_portfolio(current_user, db_session)
    project = db_session.exec(
        select(ProjectItem).where(
            ProjectItem.project_uuid == project_uuid, ProjectItem.portfolio_id == portfolio.id
        )
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project item not found")
    return portfolio, project


def update_project(
    project_uuid: str,
    payload: ProjectItemUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    portfolio, project = _owner_project(project_uuid, current_user, db_session)
    _check_revision(project.revision, payload.revision)
    values = payload.model_dump(
        exclude={"revision", "blocks", "cover_asset_uuid"}, exclude_unset=True
    )
    for field, value in values.items():
        setattr(project, field, value.strip() if isinstance(value, str) else value)
    if payload.title is not None:
        if not payload.title.strip():
            raise HTTPException(status_code=422, detail="Title is required")
        project.slug = _unique_slug(portfolio.id or 0, payload.title, db_session, project.id)
    if payload.blocks is not None:
        _replace_blocks(project, payload.blocks, db_session)
    if "cover_asset_uuid" in payload.model_fields_set:
        project.cover_asset_id = _cover_asset_id(
            payload.cover_asset_uuid, current_user.id, db_session
        )
    project.status = PortfolioContentStatus.PUBLISHED
    project.revision += 1
    project.update_date = _now()
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return _project_dto(project, db_session)


def archive_project(
    project_uuid: str, revision: int, current_user: PublicUser, db_session: Session
) -> dict:
    _, project = _owner_project(project_uuid, current_user, db_session)
    _check_revision(project.revision, revision)
    project.status = PortfolioContentStatus.ARCHIVED
    project.revision += 1
    project.update_date = _now()
    db_session.add(project)
    db_session.commit()
    return {"success": True}


ALLOWED_TIMELINE_TYPES = {
    "employment",
    "education",
    "volunteering",
    "training",
    "experience",
    "work_career",
    "leadership_service",
    "learning_experiences",
    "teams_activities",
    "awards_recognition",
    "challenges_milestones",
    "other",
}
ALLOWED_DATE_PRECISIONS = {"day", "month", "season", "year"}


def _unique_timeline_slug(
    portfolio_id: int, title: str, db_session: Session, exclude_id: int | None = None
) -> str:
    base, candidate, counter = _slug(title), _slug(title), 2
    while True:
        existing = db_session.exec(
            select(TimelineEntry).where(
                TimelineEntry.portfolio_id == portfolio_id,
                TimelineEntry.slug == candidate,
            )
        ).first()
        if not existing or existing.id == exclude_id:
            return candidate
        candidate, counter = f"{base}-{counter}", counter + 1


def _validate_timeline(
    entry_type: str,
    start_precision: str,
    end_precision: str | None,
    start_date: str | None,
    end_date: str | None,
    is_current: bool,
) -> None:
    if entry_type not in ALLOWED_TIMELINE_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported Timeline experience type")
    if start_precision not in ALLOWED_DATE_PRECISIONS or (
        end_precision and end_precision not in ALLOWED_DATE_PRECISIONS
    ):
        raise HTTPException(status_code=422, detail="Unsupported date precision")
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=422, detail="End date must not be before start date"
        )
    if is_current and end_date:
        raise HTTPException(
            status_code=422, detail="Current entries cannot have an end date"
        )


def _replace_timeline_project_links(
    entry: TimelineEntry, links: list[dict], portfolio: Portfolio, db_session: Session
) -> None:
    for existing in db_session.exec(
        select(TimelineProjectLink).where(TimelineProjectLink.timeline_entry_id == entry.id)
    ).all():
        db_session.delete(existing)
    seen: set[int] = set()
    now = _now()
    for index, raw in enumerate(links):
        project_uuid = str(raw.get("project_uuid") or "")
        project = db_session.exec(
            select(ProjectItem).where(
                ProjectItem.project_uuid == project_uuid,
                ProjectItem.portfolio_id == portfolio.id,
                ProjectItem.status != PortfolioContentStatus.ARCHIVED.value,
            )
        ).first()
        if not project or not project.id or project.id in seen:
            if not project:
                raise HTTPException(
                    status_code=422, detail="Linked Project item is unavailable"
                )
            continue
        seen.add(project.id)
        db_session.add(
            TimelineProjectLink(
                link_uuid=f"jwl_{uuid4().hex}",
                timeline_entry_id=entry.id or 0,
                project_item_id=project.id,
                relationship_label=str(
                    raw.get("relationship_label") or "Related project"
                ).strip()[:120],
                sort_order=index,
                creation_date=now,
                update_date=now,
            )
        )


def _replace_timeline_blocks(
    entry: TimelineEntry, blocks: list[dict], db_session: Session
) -> None:
    for existing in db_session.exec(
        select(TimelineEntryBlock).where(TimelineEntryBlock.timeline_entry_id == entry.id)
    ).all():
        db_session.delete(existing)
    now = _now()
    for index, raw in enumerate(blocks):
        if str(raw.get("block_type") or raw.get("type") or "image") != "image":
            raise HTTPException(
                status_code=422,
                detail="Timeline experiences currently support image blocks only",
            )
        db_session.add(
            TimelineEntryBlock(
                block_uuid=f"jbl_{uuid4().hex}",
                timeline_entry_id=entry.id or 0,
                block_type="image",
                data=raw.get("data") or {},
                sort_order=index,
                creation_date=now,
                update_date=now,
            )
        )


def create_timeline(
    payload: TimelineEntryCreate, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    if payload.idempotency_key:
        existing = db_session.exec(
            select(TimelineEntry).where(
                TimelineEntry.portfolio_id == portfolio.id,
                TimelineEntry.source_reference == payload.idempotency_key,
            )
        ).first()
        if existing:
            return _timeline_dto(existing, db_session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    _validate_timeline(
        payload.entry_type,
        payload.start_precision,
        payload.end_precision,
        payload.start_date,
        payload.end_date,
        payload.is_current,
    )
    now = _now()
    entry = TimelineEntry(
        timeline_uuid=f"tml_{uuid4().hex}",
        portfolio_id=portfolio.id or 0,
        title=title,
        entry_type=payload.entry_type,
        organization=payload.organization.strip(),
        location_label=payload.location_label.strip(),
        details=payload.details,
        summary=payload.summary.strip(),
        start_date=payload.start_date,
        end_date=None if payload.is_current else payload.end_date,
        start_precision=payload.start_precision,
        end_precision=payload.end_precision,
        is_current=payload.is_current,
        cover_asset_id=_cover_asset_id(
            payload.cover_asset_uuid, current_user.id, db_session
        ),
        status=PortfolioContentStatus.PUBLISHED,
        visibility=payload.visibility,
        slug=_unique_timeline_slug(portfolio.id or 0, title, db_session),
        source_reference=payload.idempotency_key,
        creation_date=now,
        update_date=now,
    )
    db_session.add(entry)
    db_session.flush()
    _replace_timeline_blocks(entry, payload.blocks, db_session)
    _replace_timeline_project_links(entry, payload.project_links, portfolio, db_session)
    portfolio.revision += 1
    portfolio.update_date = now
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(entry)
    return _timeline_dto(entry, db_session)


def _owner_timeline(
    timeline_uuid: str, current_user: PublicUser, db_session: Session
) -> tuple[Portfolio, TimelineEntry]:
    portfolio = get_or_create_portfolio(current_user, db_session)
    entry = db_session.exec(
        select(TimelineEntry).where(
            TimelineEntry.timeline_uuid == timeline_uuid,
            TimelineEntry.portfolio_id == portfolio.id,
        )
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Timeline experience not found")
    return portfolio, entry


def update_timeline(
    timeline_uuid: str,
    payload: TimelineEntryUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    portfolio, entry = _owner_timeline(timeline_uuid, current_user, db_session)
    _check_revision(entry.revision, payload.revision)
    values = payload.model_dump(
        exclude={"revision", "project_links", "blocks", "cover_asset_uuid"},
        exclude_unset=True,
    )
    for field, value in values.items():
        setattr(entry, field, value.strip() if isinstance(value, str) else value)
    if not entry.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    _validate_timeline(
        entry.entry_type,
        entry.start_precision,
        entry.end_precision,
        entry.start_date,
        entry.end_date,
        entry.is_current,
    )
    if payload.title is not None:
        entry.slug = _unique_timeline_slug(
            portfolio.id or 0, entry.title, db_session, entry.id
        )
    if payload.project_links is not None:
        _replace_timeline_project_links(entry, payload.project_links, portfolio, db_session)
    if payload.blocks is not None:
        _replace_timeline_blocks(entry, payload.blocks, db_session)
    if "cover_asset_uuid" in payload.model_fields_set:
        entry.cover_asset_id = _cover_asset_id(
            payload.cover_asset_uuid, current_user.id, db_session
        )
    entry.status = PortfolioContentStatus.PUBLISHED
    entry.revision += 1
    entry.update_date = _now()
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)
    return _timeline_dto(entry, db_session)


def archive_timeline(
    timeline_uuid: str, revision: int, current_user: PublicUser, db_session: Session
) -> dict:
    _, entry = _owner_timeline(timeline_uuid, current_user, db_session)
    _check_revision(entry.revision, revision)
    entry.status = PortfolioContentStatus.ARCHIVED
    entry.revision += 1
    entry.update_date = _now()
    db_session.add(entry)
    db_session.commit()
    return {"success": True}


def publish_portfolio(
    payload: PublishRequest, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    if not user or not user.email_verified:
        raise HTTPException(status_code=403, detail="Verify your email before publishing")
    _check_revision(portfolio.revision, payload.revision)
    if payload.privacy_confirmed:
        portfolio.privacy_confirmed_at = _now()
    blockers = _readiness_blockers(
        portfolio,
        len(list(db_session.exec(_project_query(portfolio.id or 0)).all()))
        + len(list(db_session.exec(_timeline_query(portfolio.id or 0)).all())),
    )
    if blockers:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Portfolio is not ready to publish",
                "blockers": blockers,
            },
        )
    now = _now()
    portfolio.published_at = now
    portfolio.first_published_at = portfolio.first_published_at or now
    portfolio.visibility = PortfolioVisibility.PUBLIC
    portfolio.revision += 1
    portfolio.update_date = now
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def unpublish_portfolio(
    revision: int, current_user: PublicUser, db_session: Session
) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    _check_revision(portfolio.revision, revision)
    portfolio.published_at = None
    portfolio.visibility = PortfolioVisibility.PRIVATE
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def get_public_shell(org_id: int, username: str, db_session: Session) -> dict:
    user = db_session.exec(select(User).where(User.username == username)).first()
    if (
        not user
        or not db_session.exec(
            select(UserOrganization).where(
                UserOrganization.user_id == user.id, UserOrganization.org_id == org_id
            )
        ).first()
    ):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    portfolio = _get_portfolio(db_session, user.id or 0)
    if (
        not portfolio
        or not portfolio.published_at
        or _enum_value(portfolio.visibility) == PortfolioVisibility.PRIVATE.value
        or _enum_value(portfolio.moderation_status)
        != PortfolioModerationStatus.CLEAR.value
    ):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio_shell(portfolio, db_session, public_only=True)


def get_public_project(org_id: int, username: str, slug: str, db_session: Session) -> dict:
    shell = get_public_shell(org_id, username, db_session)
    for project in shell["projects"]:
        if project["slug"] == slug:
            return {"portfolio": shell["portfolio"], "project": project}
    raise HTTPException(status_code=404, detail="Project item not found")


def get_public_timeline(
    org_id: int, username: str, slug: str, db_session: Session
) -> dict:
    shell = get_public_shell(org_id, username, db_session)
    for entry in shell["timeline"]:
        if entry["slug"] == slug:
            return {"portfolio": shell["portfolio"], "timeline": entry}
    raise HTTPException(status_code=404, detail="Timeline experience not found")


def legacy_import_preview(current_user: PublicUser, db_session: Session) -> dict:
    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    profile = user.profile if user and isinstance(user.profile, dict) else {}
    cards = (
        ((profile.get("featured") or {}).get("cards") or profile.get("portfolio") or [])
        if isinstance(profile, dict)
        else []
    )
    if not isinstance(cards, list):
        cards = []
    timeline = profile.get("timeline") or []
    if not isinstance(timeline, list):
        timeline = []
    portfolio = _get_portfolio(db_session, current_user.id or 0)
    imported_project_refs = set()
    imported_timeline_refs = set()
    if portfolio:
        imported_project_refs = {
            item.source_reference
            for item in db_session.exec(
                select(ProjectItem).where(ProjectItem.portfolio_id == portfolio.id)
            ).all()
            if item.source_reference
        }
        imported_timeline_refs = {
            item.source_reference
            for item in db_session.exec(
                select(TimelineEntry).where(TimelineEntry.portfolio_id == portfolio.id)
            ).all()
            if item.source_reference
        }
    return {
        "source": "user.profile",
        "preservesLegacyData": True,
        "identity": {
            "displayName": " ".join(
                part for part in (user.first_name, user.last_name) if part
            ).strip()
            if user
            else "",
            "bio": user.bio if user else "",
        },
        "projects": [
            {
                "title": str(card.get("title") or "Untitled project"),
                "summary": str(card.get("description") or card.get("text") or ""),
                "sourceIndex": index,
            }
            for index, card in enumerate(cards)
            if isinstance(card, dict)
            and f"legacy:user.profile:project:{index}" not in imported_project_refs
        ],
        "timeline": [
            {
                "title": str(item.get("title") or "Untitled experience"),
                "entryType": {"project": "employment", "life": "experience"}.get(
                    str(item.get("category")), "education"
                ),
                "organization": str(
                    item.get("company")
                    or item.get("institution")
                    or item.get("organization")
                    or ""
                ),
                "summary": str(item.get("description") or ""),
                "startDate": item.get("startDate") or item.get("start_date"),
                "endDate": item.get("endDate") or item.get("end_date"),
                "isCurrent": bool(item.get("current") or item.get("isCurrent")),
                "sourceIndex": index,
            }
            for index, item in enumerate(timeline)
            if isinstance(item, dict)
            and f"legacy:user.profile:timeline:{index}" not in imported_timeline_refs
        ],
    }


def execute_legacy_import(current_user: PublicUser, db_session: Session) -> dict:
    preview = legacy_import_preview(current_user, db_session)
    portfolio = get_or_create_portfolio(current_user, db_session)
    imported = 0
    for item in preview["projects"]:
        key = f"legacy:user.profile:project:{item['sourceIndex']}"
        existing = db_session.exec(
            select(ProjectItem).where(
                ProjectItem.portfolio_id == portfolio.id, ProjectItem.source_reference == key
            )
        ).first()
        if existing:
            continue
        create_project(
            ProjectItemCreate(
                title=item["title"], summary=item["summary"], idempotency_key=key
            ),
            current_user,
            db_session,
        )
        imported += 1
    timeline_imported = 0
    for item in preview["timeline"]:
        key = f"legacy:user.profile:timeline:{item['sourceIndex']}"
        if db_session.exec(
            select(TimelineEntry).where(
                TimelineEntry.portfolio_id == portfolio.id,
                TimelineEntry.source_reference == key,
            )
        ).first():
            continue
        create_timeline(
            TimelineEntryCreate(
                title=item["title"],
                entry_type=item["entryType"],
                organization=item["organization"],
                summary=item["summary"],
                start_date=item["startDate"],
                end_date=None if item["isCurrent"] else item["endDate"],
                is_current=item["isCurrent"],
                idempotency_key=key,
            ),
            current_user,
            db_session,
        )
        timeline_imported += 1
    return {
        "imported": imported + timeline_imported,
        "projectImported": imported,
        "timelineImported": timeline_imported,
        "skipped": len(preview["projects"])
        + len(preview["timeline"])
        - imported
        - timeline_imported,
        "shell": get_owner_shell(current_user, db_session),
    }


def dismiss_legacy_import(current_user: PublicUser, db_session: Session) -> dict:
    """Hide the optional import without modifying the legacy profile data."""
    portfolio = get_or_create_portfolio(current_user, db_session)
    portfolio.theme_settings = {
        **(portfolio.theme_settings or {}),
        "legacy_import_dismissed": True,
    }
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    return get_owner_shell(current_user, db_session)

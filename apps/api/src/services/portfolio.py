import re
from datetime import datetime
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import HTTPException, status
from sqlmodel import Session, select

from src.db.portfolio import (
    Portfolio,
    PortfolioContentStatus,
    PortfolioModerationStatus,
    PortfolioSection,
    PortfolioLink,
    PortfolioUpdate,
    PortfolioVisibility,
    PublishRequest,
    WorkItem,
    WorkItemBlock,
    WorkItemCreate,
    WorkItemUpdate,
)
from src.db.media import MediaAsset
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User


DEFAULT_SECTIONS = ("identity_hero", "featured_work", "about", "links")
ALLOWED_BLOCK_TYPES = {"text", "image", "gallery", "video", "link", "process", "contribution", "outcome", "quote", "tools", "collaborators"}


def _now() -> str:
    return str(datetime.now())


def _slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return clean[:80] or "work"


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _portfolio_state(portfolio: Portfolio, meaningful_count: int) -> str:
    if _enum_value(portfolio.moderation_status) == PortfolioModerationStatus.RESTRICTED.value:
        return "restricted"
    if portfolio.published_at:
        return "published"
    if portfolio.first_published_at:
        return "unpublished"
    if not (portfolio.display_name.strip() or portfolio.headline.strip() or portfolio.short_bio.strip() or meaningful_count):
        return "empty"
    blockers = _readiness_blockers(portfolio, meaningful_count)
    return "ready" if not blockers else "building"


def _readiness_blockers(portfolio: Portfolio, meaningful_count: int) -> list[str]:
    blockers = []
    if not (portfolio.display_name.strip() or portfolio.headline.strip() or portfolio.short_bio.strip() or meaningful_count):
        blockers.append("meaningful_content_required")
    if not portfolio.previewed_at:
        blockers.append("public_preview_required")
    if not portfolio.privacy_confirmed_at:
        blockers.append("privacy_confirmation_required")
    if _enum_value(portfolio.moderation_status) != PortfolioModerationStatus.CLEAR.value:
        blockers.append("moderation_clearance_required")
    return blockers


def _get_portfolio(db_session: Session, user_id: int) -> Portfolio | None:
    return db_session.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()


def get_or_create_portfolio(current_user: PublicUser, db_session: Session) -> Portfolio:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    portfolio = _get_portfolio(db_session, current_user.id)
    if portfolio:
        return portfolio
    now = _now()
    portfolio = Portfolio(
        portfolio_uuid=f"por_{uuid4().hex}",
        user_id=current_user.id,
        display_name=" ".join(part for part in (current_user.first_name, current_user.last_name) if part).strip(),
        short_bio=current_user.bio or "",
        creation_date=now,
        update_date=now,
    )
    db_session.add(portfolio)
    db_session.flush()
    for index, section_type in enumerate(DEFAULT_SECTIONS):
        db_session.add(PortfolioSection(section_uuid=f"sec_{uuid4().hex}", portfolio_id=portfolio.id or 0, section_type=section_type, sort_order=index, creation_date=now, update_date=now))
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio


def _work_query(portfolio_id: int, public_only: bool = False):
    statement = select(WorkItem).where(WorkItem.portfolio_id == portfolio_id, WorkItem.status != PortfolioContentStatus.ARCHIVED.value)
    if public_only:
        statement = statement.where(WorkItem.status == PortfolioContentStatus.PUBLISHED.value, WorkItem.visibility != PortfolioVisibility.PRIVATE.value)
    return statement.order_by(WorkItem.featured.desc(), WorkItem.update_date.desc())


def _work_dto(work: WorkItem, db_session: Session, public_only: bool = False) -> dict:
    blocks = db_session.exec(select(WorkItemBlock).where(WorkItemBlock.work_item_id == work.id).order_by(WorkItemBlock.sort_order)).all()
    if public_only:
        blocks = [block for block in blocks if _enum_value(block.visibility) != PortfolioVisibility.PRIVATE.value]
    cover = db_session.exec(select(MediaAsset).where(MediaAsset.id == work.cover_asset_id)).first() if work.cover_asset_id else None
    return {**work.model_dump(), "story_kind": _enum_value(work.story_kind), "status": _enum_value(work.status), "visibility": _enum_value(work.visibility), "cover_url": cover.url if cover else "", "cover_asset_uuid": cover.asset_uuid if cover else None, "blocks": [block.model_dump() for block in blocks]}


def portfolio_shell(portfolio: Portfolio, db_session: Session, public_only: bool = False) -> dict:
    user = db_session.exec(select(User).where(User.id == portfolio.user_id)).first()
    links = list(db_session.exec(select(PortfolioLink).where(PortfolioLink.portfolio_id == portfolio.id).order_by(PortfolioLink.sort_order)).all())
    normalized_socials = [{"type": link.platform or link.link_type, "url": link.url} for link in links if link.link_type == "social" and (not public_only or _enum_value(link.visibility) != PortfolioVisibility.PRIVATE.value)]
    legacy_socials = (((user.profile or {}).get("header") or {}).get("socials") or []) if user and isinstance(user.profile, dict) else []
    socials_migrated = bool((portfolio.theme_settings or {}).get("socials_migrated"))
    work = list(db_session.exec(_work_query(portfolio.id or 0, public_only=public_only)).all())
    meaningful_count = len(work)
    blockers = _readiness_blockers(portfolio, meaningful_count)
    state = _portfolio_state(portfolio, meaningful_count)
    views = [
        {"key": "overview", "visible": True, "itemCount": 1},
        {"key": "work", "visible": bool(work), "itemCount": len(work)},
        {"key": "journey", "visible": False, "itemCount": 0},
        {"key": "badges", "visible": False, "itemCount": 0},
    ]
    next_action = None
    if not public_only:
        if "meaningful_content_required" in blockers:
            next_action = {"id": "add-work", "type": "portfolio", "label": "Show something you've done", "href": "/portfolio/work/new", "priority": 80}
        elif "public_preview_required" in blockers:
            next_action = {"id": "preview", "type": "portfolio", "label": "Preview your portfolio", "href": "/portfolio/preview", "priority": 70}
        elif not portfolio.published_at:
            next_action = {"id": "publish", "type": "portfolio", "label": "Launch your portfolio", "href": "/portfolio/preview", "priority": 60}
    return {
        "portfolio": {
            **portfolio.model_dump(),
            "username": user.username if user else "",
            "user_uuid": user.user_uuid if user else "",
            "avatar_image": user.avatar_image if user else "",
            "socials": normalized_socials if socials_migrated else (normalized_socials or legacy_socials),
            "state": state,
            "visibility": _enum_value(portfolio.visibility),
            "moderation_status": _enum_value(portfolio.moderation_status),
        },
        "views": views,
        "readiness": {"canPublish": not blockers, "completed": 3 - len([b for b in blockers if b != "moderation_clearance_required"]), "total": 3, "blockers": blockers},
        "nextAction": next_action,
        "permissions": {"canEdit": not public_only, "canPublish": not public_only and state != "restricted"},
        "work": [_work_dto(item, db_session, public_only=public_only) for item in work],
    }


def get_owner_shell(current_user: PublicUser, db_session: Session, mark_previewed: bool = False) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    if mark_previewed and not portfolio.previewed_at:
        portfolio.previewed_at = _now()
        portfolio.update_date = portfolio.previewed_at
        portfolio.revision += 1
        db_session.add(portfolio)
        db_session.commit()
        db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def update_portfolio(payload: PortfolioUpdate, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    _check_revision(portfolio.revision, payload.revision)
    for field, value in payload.model_dump(exclude={"revision", "socials"}, exclude_unset=True).items():
        setattr(portfolio, field, value)
    if payload.socials is not None:
        _replace_socials(portfolio, payload.socials, db_session)
    portfolio.revision += 1
    portfolio.update_date = _now()
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(portfolio)
    return portfolio_shell(portfolio, db_session)


def _replace_socials(portfolio: Portfolio, socials: list[dict], db_session: Session) -> None:
    allowed = {"website", "linkedin", "instagram", "youtube", "x"}
    cleaned: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw in socials:
        social_type = str(raw.get("type") or "").strip().lower()
        url = str(raw.get("url") or "").strip()
        if not url:
            continue
        if social_type not in allowed or social_type in seen:
            raise HTTPException(status_code=422, detail="Invalid or duplicate social link type")
        parsed = urlparse(url if "://" in url else f"https://{url}")
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(status_code=422, detail="Social links must be valid web URLs")
        cleaned.append((social_type, parsed.geturl()))
        seen.add(social_type)
    for existing in db_session.exec(select(PortfolioLink).where(PortfolioLink.portfolio_id == portfolio.id, PortfolioLink.link_type == "social")).all():
        db_session.delete(existing)
    now = _now()
    for index, (social_type, url) in enumerate(cleaned):
        db_session.add(PortfolioLink(link_uuid=f"lnk_{uuid4().hex}", portfolio_id=portfolio.id or 0, link_type="social", platform=social_type, label=social_type.title(), url=url, visibility=PortfolioVisibility.PUBLIC, sort_order=index, safety_status="clear", creation_date=now, update_date=now))
    portfolio.theme_settings = {**(portfolio.theme_settings or {}), "socials_migrated": True}


def _check_revision(current: int, received: int) -> None:
    if current != received:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "Portfolio content changed elsewhere", "currentRevision": current})


def _unique_slug(portfolio_id: int, title: str, db_session: Session, exclude_id: int | None = None) -> str:
    base = _slug(title)
    candidate = base
    counter = 2
    while True:
        existing = db_session.exec(select(WorkItem).where(WorkItem.portfolio_id == portfolio_id, WorkItem.slug == candidate)).first()
        if not existing or existing.id == exclude_id:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def _replace_blocks(work: WorkItem, blocks: list[dict], db_session: Session) -> None:
    for existing in db_session.exec(select(WorkItemBlock).where(WorkItemBlock.work_item_id == work.id)).all():
        db_session.delete(existing)
    now = _now()
    for index, raw in enumerate(blocks):
        block_type = str(raw.get("block_type") or raw.get("type") or "text")
        if block_type not in ALLOWED_BLOCK_TYPES:
            raise HTTPException(status_code=422, detail=f"Unsupported Work block type: {block_type}")
        db_session.add(WorkItemBlock(block_uuid=f"wbl_{uuid4().hex}", work_item_id=work.id or 0, block_type=block_type, data=raw.get("data") or {}, sort_order=index, creation_date=now, update_date=now))


def _cover_asset_id(asset_uuid: str | None, user_id: int, db_session: Session) -> int | None:
    if not asset_uuid:
        return None
    asset = db_session.exec(select(MediaAsset).where(MediaAsset.asset_uuid == asset_uuid, MediaAsset.owner_user_id == user_id)).first()
    if not asset or _enum_value(asset.media_type) != "image":
        raise HTTPException(status_code=422, detail="Cover image is not an owned image asset")
    return asset.id


def create_work(payload: WorkItemCreate, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    if payload.idempotency_key:
        existing = db_session.exec(select(WorkItem).where(WorkItem.portfolio_id == portfolio.id, WorkItem.source_reference == payload.idempotency_key)).first()
        if existing:
            return _work_dto(existing, db_session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    now = _now()
    work = WorkItem(
        work_uuid=f"wrk_{uuid4().hex}", portfolio_id=portfolio.id or 0, title=title,
        story_kind=payload.story_kind, subtitle=payload.subtitle.strip(), summary=payload.summary.strip(), role_label=payload.role_label.strip(),
        status=PortfolioContentStatus.PUBLISHED, visibility=payload.visibility, featured=payload.featured,
        start_date=payload.start_date, end_date=payload.end_date,
        cover_asset_id=_cover_asset_id(payload.cover_asset_uuid, current_user.id, db_session),
        slug=_unique_slug(portfolio.id or 0, title, db_session), source_reference=payload.idempotency_key,
        creation_date=now, update_date=now,
    )
    db_session.add(work)
    db_session.flush()
    _replace_blocks(work, payload.blocks, db_session)
    portfolio.revision += 1
    portfolio.update_date = now
    db_session.add(portfolio)
    db_session.commit()
    db_session.refresh(work)
    return _work_dto(work, db_session)


def _owner_work(work_uuid: str, current_user: PublicUser, db_session: Session) -> tuple[Portfolio, WorkItem]:
    portfolio = get_or_create_portfolio(current_user, db_session)
    work = db_session.exec(select(WorkItem).where(WorkItem.work_uuid == work_uuid, WorkItem.portfolio_id == portfolio.id)).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work item not found")
    return portfolio, work


def update_work(work_uuid: str, payload: WorkItemUpdate, current_user: PublicUser, db_session: Session) -> dict:
    portfolio, work = _owner_work(work_uuid, current_user, db_session)
    _check_revision(work.revision, payload.revision)
    values = payload.model_dump(exclude={"revision", "blocks", "cover_asset_uuid"}, exclude_unset=True)
    for field, value in values.items():
        setattr(work, field, value.strip() if isinstance(value, str) else value)
    if payload.title is not None:
        if not payload.title.strip():
            raise HTTPException(status_code=422, detail="Title is required")
        work.slug = _unique_slug(portfolio.id or 0, payload.title, db_session, work.id)
    if payload.blocks is not None:
        _replace_blocks(work, payload.blocks, db_session)
    if "cover_asset_uuid" in payload.model_fields_set:
        work.cover_asset_id = _cover_asset_id(payload.cover_asset_uuid, current_user.id, db_session)
    work.status = PortfolioContentStatus.PUBLISHED
    work.revision += 1
    work.update_date = _now()
    db_session.add(work)
    db_session.commit()
    db_session.refresh(work)
    return _work_dto(work, db_session)


def archive_work(work_uuid: str, revision: int, current_user: PublicUser, db_session: Session) -> dict:
    _, work = _owner_work(work_uuid, current_user, db_session)
    _check_revision(work.revision, revision)
    work.status = PortfolioContentStatus.ARCHIVED
    work.revision += 1
    work.update_date = _now()
    db_session.add(work)
    db_session.commit()
    return {"success": True}


def publish_portfolio(payload: PublishRequest, current_user: PublicUser, db_session: Session) -> dict:
    portfolio = get_or_create_portfolio(current_user, db_session)
    _check_revision(portfolio.revision, payload.revision)
    if payload.privacy_confirmed:
        portfolio.privacy_confirmed_at = _now()
    blockers = _readiness_blockers(portfolio, len(list(db_session.exec(_work_query(portfolio.id or 0)).all())))
    if blockers:
        raise HTTPException(status_code=422, detail={"message": "Portfolio is not ready to publish", "blockers": blockers})
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


def unpublish_portfolio(revision: int, current_user: PublicUser, db_session: Session) -> dict:
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
    if not user or not db_session.exec(select(UserOrganization).where(UserOrganization.user_id == user.id, UserOrganization.org_id == org_id)).first():
        raise HTTPException(status_code=404, detail="Portfolio not found")
    portfolio = _get_portfolio(db_session, user.id or 0)
    if not portfolio or not portfolio.published_at or _enum_value(portfolio.visibility) == PortfolioVisibility.PRIVATE.value or _enum_value(portfolio.moderation_status) != PortfolioModerationStatus.CLEAR.value:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio_shell(portfolio, db_session, public_only=True)


def get_public_work(org_id: int, username: str, slug: str, db_session: Session) -> dict:
    shell = get_public_shell(org_id, username, db_session)
    for work in shell["work"]:
        if work["slug"] == slug:
            return {"portfolio": shell["portfolio"], "work": work}
    raise HTTPException(status_code=404, detail="Work item not found")


def legacy_import_preview(current_user: PublicUser, db_session: Session) -> dict:
    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    profile = user.profile if user and isinstance(user.profile, dict) else {}
    cards = ((profile.get("featured") or {}).get("cards") or profile.get("portfolio") or []) if isinstance(profile, dict) else []
    if not isinstance(cards, list):
        cards = []
    return {
        "source": "user.profile",
        "preservesLegacyData": True,
        "identity": {"displayName": " ".join(part for part in (user.first_name, user.last_name) if part).strip() if user else "", "bio": user.bio if user else ""},
        "work": [{"title": str(card.get("title") or "Untitled work"), "summary": str(card.get("description") or card.get("text") or ""), "sourceIndex": index} for index, card in enumerate(cards) if isinstance(card, dict)],
    }


def execute_legacy_import(current_user: PublicUser, db_session: Session) -> dict:
    preview = legacy_import_preview(current_user, db_session)
    portfolio = get_or_create_portfolio(current_user, db_session)
    imported = 0
    for item in preview["work"]:
        key = f"legacy:user.profile:work:{item['sourceIndex']}"
        existing = db_session.exec(select(WorkItem).where(WorkItem.portfolio_id == portfolio.id, WorkItem.source_reference == key)).first()
        if existing:
            continue
        create_work(WorkItemCreate(title=item["title"], summary=item["summary"], idempotency_key=key), current_user, db_session)
        imported += 1
    return {"imported": imported, "skipped": len(preview["work"]) - imported, "shell": get_owner_shell(current_user, db_session)}

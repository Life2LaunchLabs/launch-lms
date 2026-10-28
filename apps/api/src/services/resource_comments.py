"""Comments on resources: who may comment (the channel's rule), held links, reports and moderation."""

import re
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from src.db.organizations import Organization
from src.db.resource_library import ResourceCommentReport
from src.db.resources import (
    CommentRule,
    CommentStatus,
    Resource,
    ResourceChannelResource,
    ResourceComment,
    ResourceCommentCreate,
    ResourceCommentReadWithAuthor,
    ResourceCommentUpdate,
    ResourceReviewCreate,
)
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS
from src.security.superadmin import is_user_superadmin
from src.services import resources as base


LINK_PATTERN = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|biz|info|co|app|ly)\b", re.IGNORECASE)
COMMENT_RULE_ORDER = {CommentRule.off: 0, CommentRule.staff: 1, CommentRule.all: 2}


def _author(user: User | None) -> dict | None:
    if not user:
        return None
    return {
        "id": user.id,
        "user_uuid": user.user_uuid,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "avatar_image": user.avatar_image,
    }


def _comment_dict(comment: ResourceComment, author: User | None, report_count: int = 0, author_org: Organization | None = None, author_is_staff: bool = False) -> dict:
    return {
        **ResourceCommentReadWithAuthor(**comment.model_dump(), author=_author(author)).model_dump(),
        "report_count": report_count,
        "author_org": {"name": author_org.name, "slug": author_org.slug, "org_uuid": author_org.org_uuid} if author_org else None,
        "author_is_staff": author_is_staff,
    }


def _comment_rule(resource: Resource, db_session: Session) -> tuple[CommentRule, bool]:
    """The most open rule among the resource's channels, and whether any of them holds links.

    A resource in no channel only its org's staff see, so only they comment on it.
    """
    channels = base._channels_of(resource.id, db_session)
    if not channels:
        return CommentRule.staff, False
    rule = max((CommentRule(channel.comment_rule) for channel in channels), key=COMMENT_RULE_ORDER.__getitem__)
    return rule, any(channel.hold_links for channel in channels)


def _is_staff_anywhere(user_id: int, db_session: Session) -> bool:
    return is_user_superadmin(user_id, db_session) or db_session.exec(
        select(UserOrganization.id).where(UserOrganization.user_id == user_id, UserOrganization.role_id.in_(ADMIN_OR_MAINTAINER_ROLE_IDS))
    ).first() is not None


def _report_counts(comment_ids: list[int], db_session: Session) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = db_session.exec(
        select(ResourceCommentReport.comment_id, func.count(ResourceCommentReport.id))
        .where(ResourceCommentReport.comment_id.in_(comment_ids))
        .group_by(ResourceCommentReport.comment_id)
    ).all()
    return dict(rows)


def _author_contexts(user_ids: set[int], owner_org_id: int, db_session: Session) -> tuple[dict[int, Organization], set[int]]:
    """Each author's org as other viewers read it (the owner org when they belong to it), and who is staff there."""
    if not user_ids:
        return {}, set()
    memberships = db_session.exec(select(UserOrganization).where(UserOrganization.user_id.in_(user_ids))).all()
    chosen: dict[int, UserOrganization] = {}
    for membership in memberships:
        current = chosen.get(membership.user_id)
        if current is None or (membership.org_id == owner_org_id and current.org_id != owner_org_id):
            chosen[membership.user_id] = membership
    orgs = {org.id: org for org in db_session.exec(select(Organization).where(Organization.id.in_({m.org_id for m in chosen.values()}))).all()}
    return (
        {user_id: orgs[m.org_id] for user_id, m in chosen.items() if m.org_id in orgs},
        {user_id for user_id, m in chosen.items() if m.role_id in ADMIN_OR_MAINTAINER_ROLE_IDS},
    )


def _comments_out(rows: list[tuple[ResourceComment, User]], owner_org_id: int, db_session: Session, with_reports: bool) -> list[dict]:
    reports = _report_counts([comment.id for comment, _ in rows], db_session) if with_reports else {}
    orgs, staff = _author_contexts({user.id for _, user in rows}, owner_org_id, db_session)
    return [_comment_dict(comment, user, reports.get(comment.id, 0), orgs.get(user.id), user.id in staff) for comment, user in rows]


async def list_comments(request: Request, resource_uuid: str, current_user, db_session: Session) -> list[dict]:
    """Live comments for everyone; the owning org's staff also get held and hidden ones and report counts."""
    resource = base._get_resource_or_404(resource_uuid, db_session)
    if not base._resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    moderator = base._is_staff(current_user, resource.org_id, db_session)
    statement = (
        select(ResourceComment, User)
        .join(User, User.id == ResourceComment.author_id)
        .where(ResourceComment.resource_id == resource.id)
        .order_by(ResourceComment.creation_date.asc())
    )
    if not moderator:
        statement = statement.where(or_(
            ResourceComment.status == CommentStatus.live,
            (ResourceComment.author_id == current_user.id) & (ResourceComment.status == CommentStatus.held),
        ))
    return _comments_out(list(db_session.exec(statement).all()), resource.org_id, db_session, moderator)


async def create_comment(request: Request, resource_uuid: str, comment_data: ResourceCommentCreate, current_user: PublicUser, db_session: Session) -> dict:
    resource = base._get_resource_or_404(resource_uuid, db_session)
    if not base._resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this resource")
    content = (comment_data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Write something before you post")
    moderator = base._is_staff(current_user, resource.org_id, db_session)
    rule, hold_links = _comment_rule(resource, db_session)
    if not moderator:
        if rule == CommentRule.off:
            raise HTTPException(status_code=403, detail="Comments are turned off for this resource")
        if rule == CommentRule.staff and not _is_staff_anywhere(current_user.id, db_session):
            raise HTTPException(status_code=403, detail="Only staff can comment on this resource")
    held = not moderator and hold_links and bool(LINK_PATTERN.search(content))
    comment = ResourceComment(
        resource_id=resource.id,
        author_id=current_user.id,
        comment_uuid=f"resourcecomment_{uuid4()}",
        content=content,
        rating=comment_data.rating,
        status=CommentStatus.held if held else CommentStatus.live,
        creation_date=base._now(),
        update_date=base._now(),
    )
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    author = db_session.get(User, current_user.id)
    return _comments_out([(comment, author)], resource.org_id, db_session, moderator)[0]


async def create_review(
    request: Request,
    resource_uuid: str,
    review_data: ResourceReviewCreate,
    current_user: PublicUser,
    db_session: Session,
) -> dict:
    resource = base._get_resource_or_404(resource_uuid, db_session)
    content = review_data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Review text is required")
    existing = db_session.exec(
        select(ResourceComment).where(
            ResourceComment.resource_id == resource.id,
            ResourceComment.author_id == current_user.id,
            ResourceComment.rating.is_not(None),
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already reviewed this resource")
    base._get_or_create_saved_resource(current_user.id, resource.id, db_session)
    try:
        return await create_comment(
            request,
            resource_uuid,
            ResourceCommentCreate(content=content, rating=review_data.rating),
            current_user,
            db_session,
        )
    except IntegrityError:
        db_session.rollback()
        raise HTTPException(status_code=409, detail="You have already reviewed this resource") from None


def _comment_and_resource(comment_uuid: str, db_session: Session) -> tuple[ResourceComment, Resource]:
    comment = db_session.exec(select(ResourceComment).where(ResourceComment.comment_uuid == comment_uuid)).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    resource = db_session.get(Resource, comment.resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return comment, resource


async def update_comment(request: Request, comment_uuid: str, comment_data: ResourceCommentUpdate, current_user: PublicUser, db_session: Session) -> dict:
    """Authors edit their own words. Staff change what others see through moderate_comment."""
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")
    if comment_data.content is not None:
        content = comment_data.content.strip()
        if not content:
            raise HTTPException(status_code=400, detail="Write something before you post")
        comment.content = content
        _, hold_links = _comment_rule(resource, db_session)
        if comment.status == CommentStatus.live and hold_links and LINK_PATTERN.search(content) and not base._is_staff(current_user, resource.org_id, db_session):
            comment.status = CommentStatus.held
    if comment_data.rating is not None:
        comment.rating = comment_data.rating
    if comment.rating is not None:
        base._get_or_create_saved_resource(current_user.id, resource.id, db_session)
    comment.update_date = base._now()
    db_session.add(comment)
    db_session.commit()
    db_session.refresh(comment)
    return _comments_out([(comment, db_session.get(User, comment.author_id))], resource.org_id, db_session, False)[0]


async def delete_comment(request: Request, comment_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    if comment.author_id != current_user.id and not base._is_staff(current_user, resource.org_id, db_session):
        raise HTTPException(status_code=403, detail="You cannot delete this comment")
    db_session.delete(comment)
    db_session.commit()
    return {"detail": "Comment deleted"}


MODERATION_ACTIONS = {"approve": CommentStatus.live, "show": CommentStatus.live, "hide": CommentStatus.hidden, "keep": None}


async def moderate_comment(request: Request, comment_uuid: str, action: str, current_user: PublicUser, db_session: Session) -> dict:
    """The owning org's staff approve a held comment, hide or show one, or keep a reported one (clearing its reports)."""
    if action not in MODERATION_ACTIONS:
        raise HTTPException(status_code=422, detail="Unknown moderation action")
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    base._require_staff(current_user, resource.org_id, db_session)
    status = MODERATION_ACTIONS[action]
    if status is not None:
        comment.status = status
        comment.update_date = base._now()
        db_session.add(comment)
    if action in ("keep", "approve"):
        for report in db_session.exec(select(ResourceCommentReport).where(ResourceCommentReport.comment_id == comment.id)).all():
            db_session.delete(report)
    db_session.commit()
    db_session.refresh(comment)
    return _comments_out([(comment, db_session.get(User, comment.author_id))], resource.org_id, db_session, True)[0]


async def report_comment(request: Request, comment_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    comment, resource = _comment_and_resource(comment_uuid, db_session)
    if comment.status != CommentStatus.live or not base._resource_in_accessible_channel(resource, db_session, current_user):
        raise HTTPException(status_code=404, detail="Comment not found")
    exists = db_session.exec(
        select(ResourceCommentReport).where(ResourceCommentReport.comment_id == comment.id, ResourceCommentReport.user_id == current_user.id)
    ).first()
    if not exists:
        db_session.add(ResourceCommentReport(comment_id=comment.id, user_id=current_user.id, creation_date=base._now()))
        db_session.commit()
    return {"detail": "Reported"}


def _needs_look(comment: ResourceComment, report_count: int) -> bool:
    return comment.status == CommentStatus.held or (comment.status == CommentStatus.live and report_count > 0)


async def list_channel_comments(request: Request, channel_uuid: str, current_user: PublicUser, db_session: Session) -> dict:
    """Every comment on a channel's resources for its org's staff: what needs a look first, then the newest."""
    channel = base._get_channel_or_404(channel_uuid, db_session)
    base._require_staff(current_user, channel.org_id, db_session)
    rows = list(db_session.exec(
        select(ResourceComment, User, Resource)
        .join(User, User.id == ResourceComment.author_id)
        .join(Resource, Resource.id == ResourceComment.resource_id)
        .join(ResourceChannelResource, ResourceChannelResource.resource_id == Resource.id)
        .where(ResourceChannelResource.channel_id == channel.id)
        .order_by(ResourceComment.creation_date.desc())
    ).all())
    out = _comments_out([(comment, user) for comment, user, _ in rows], channel.org_id, db_session, True)
    for item, (_, _, resource) in zip(out, rows):
        item["resource"] = {"resource_uuid": resource.resource_uuid, "title": resource.title, "resource_type": resource.resource_type}
    needs = [item for item, (comment, _, _) in zip(out, rows) if _needs_look(comment, item["report_count"])]
    recent = [item for item, (comment, _, _) in zip(out, rows) if not _needs_look(comment, item["report_count"])]
    return {"needs_look": needs, "recent": recent[:50]}

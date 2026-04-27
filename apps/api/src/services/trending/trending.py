from typing import Optional
from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.communities.communities import Community
from src.db.communities.discussion_comments import DiscussionComment
from src.db.communities.discussions import Discussion
from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.resources import Resource, ResourceChannel, ResourceChannelResource, ResourceComment
from src.db.users import AnonymousUser, APITokenUser, PublicUser


class TrendingItemRead(BaseModel):
    item_type: str  # "discussion" | "resource" | "course"
    item_uuid: str
    title: str
    last_event_date: str
    thumbnail_image: Optional[str] = None
    community_name: Optional[str] = None
    community_uuid: Optional[str] = None
    resource_type: Optional[str] = None
    org_slug: str


async def get_trending_items(
    request: Request,
    org: Organization,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db_session: Session,
    limit: int = 20,
) -> list[TrendingItemRead]:
    items: list[TrendingItemRead] = []
    fetch_limit = limit * 2  # over-fetch so we still hit `limit` after merge

    items.extend(_get_trending_discussions(org, db_session, fetch_limit))
    items.extend(_get_trending_resources(org, db_session, fetch_limit))
    items.extend(_get_trending_courses(org, db_session, fetch_limit))

    items.sort(key=lambda x: x.last_event_date, reverse=True)
    return items[:limit]


def _get_trending_discussions(
    org: Organization,
    db_session: Session,
    limit: int,
) -> list[TrendingItemRead]:
    max_comment_subq = (
        select(
            DiscussionComment.discussion_id,
            func.max(DiscussionComment.creation_date).label("max_comment_date"),
        )
        .group_by(DiscussionComment.discussion_id)
        .subquery()
    )

    stmt = (
        select(
            Discussion.discussion_uuid,
            Discussion.title,
            Discussion.creation_date,
            Community.community_uuid,
            Community.name.label("community_name"),
            max_comment_subq.c.max_comment_date,
        )
        .join(Community, Discussion.community_id == Community.id)
        .outerjoin(max_comment_subq, max_comment_subq.c.discussion_id == Discussion.id)
        .where(Discussion.org_id == org.id)
        .where(Community.public == True)  # noqa: E712
        .order_by(Discussion.creation_date.desc())
        .limit(limit)
    )

    rows = db_session.execute(stmt).all()
    result = []
    for discussion_uuid, title, creation_date, community_uuid, community_name, max_comment_date in rows:
        last_event_date = (
            max_comment_date
            if max_comment_date and max_comment_date > creation_date
            else creation_date
        )
        result.append(
            TrendingItemRead(
                item_type="discussion",
                item_uuid=discussion_uuid,
                title=title,
                last_event_date=last_event_date,
                community_name=community_name,
                community_uuid=community_uuid,
                org_slug=org.slug,
            )
        )
    return result


def _get_trending_resources(
    org: Organization,
    db_session: Session,
    limit: int,
) -> list[TrendingItemRead]:
    max_comment_subq = (
        select(
            ResourceComment.resource_id,
            func.max(ResourceComment.creation_date).label("max_comment_date"),
        )
        .group_by(ResourceComment.resource_id)
        .subquery()
    )

    stmt = (
        select(
            Resource.resource_uuid,
            Resource.title,
            Resource.thumbnail_image,
            Resource.resource_type,
            Resource.creation_date,
            max_comment_subq.c.max_comment_date,
        )
        .join(ResourceChannelResource, ResourceChannelResource.resource_id == Resource.id)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .outerjoin(max_comment_subq, max_comment_subq.c.resource_id == Resource.id)
        .where(Resource.org_id == org.id)
        .where(Resource.is_live == True)  # noqa: E712
        .where(ResourceChannel.public == True)  # noqa: E712
        .group_by(
            Resource.resource_uuid,
            Resource.title,
            Resource.thumbnail_image,
            Resource.resource_type,
            Resource.creation_date,
            max_comment_subq.c.max_comment_date,
        )
        .order_by(Resource.creation_date.desc())
        .limit(limit)
    )

    rows = db_session.execute(stmt).all()
    result = []
    for resource_uuid, title, thumbnail_image, resource_type, creation_date, max_comment_date in rows:
        last_event_date = (
            max_comment_date
            if max_comment_date and max_comment_date > creation_date
            else creation_date
        )
        result.append(
            TrendingItemRead(
                item_type="resource",
                item_uuid=resource_uuid,
                title=title,
                last_event_date=last_event_date,
                thumbnail_image=thumbnail_image,
                resource_type=resource_type,
                org_slug=org.slug,
            )
        )
    return result


def _get_trending_courses(
    org: Organization,
    db_session: Session,
    limit: int,
) -> list[TrendingItemRead]:
    stmt = (
        select(
            Course.course_uuid,
            Course.name,
            Course.thumbnail_image,
            Course.creation_date,
        )
        .where(Course.org_id == org.id)
        .where(Course.published == True)  # noqa: E712
        .where(Course.public == True)  # noqa: E712
        .order_by(Course.creation_date.desc())
        .limit(limit)
    )

    rows = db_session.execute(stmt).all()
    return [
        TrendingItemRead(
            item_type="course",
            item_uuid=course_uuid,
            title=name,
            last_event_date=creation_date,
            thumbnail_image=thumbnail_image,
            org_slug=org.slug,
        )
        for course_uuid, name, thumbnail_image, creation_date in rows
    ]

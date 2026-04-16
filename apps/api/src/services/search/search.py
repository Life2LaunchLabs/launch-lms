from typing import List, TypeVar
from fastapi import Request
from sqlmodel import Session, select, or_, text, and_
from sqlalchemy import true as sa_true
from pydantic import BaseModel, ConfigDict
from src.db.users import PublicUser, AnonymousUser, UserRead, User, APITokenUser
from src.db.courses.courses import Course, CourseRead
from src.db.collections import Collection, CollectionRead
from src.db.collections_courses import CollectionCourse
from src.db.communities.communities import Community, CommunityRead
from src.db.organizations import Organization
from src.db.resources import Resource, ResourceRead, ResourceChannel, ResourceChannelResource
from src.db.user_organizations import UserOrganization
from src.services.courses.courses import search_courses
from src.services.resources import _serialize_resource
from src.services.shared_content import owner_org_payload
from src.security.org_auth import is_org_member

T = TypeVar('T')

class SearchResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    courses: List[CourseRead]
    collections: List[CollectionRead]
    communities: List[CommunityRead]
    resources: List[dict]
    users: List[UserRead]

def _escape_like_wildcards(query: str) -> str:
    """Escape SQL LIKE wildcards to prevent user enumeration via pattern matching."""
    return query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


async def search_across_org(
    request: Request,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    org_slug: str,
    search_query: str,
    db_session: Session,
    page: int = 1,
    limit: int = 10,
) -> SearchResult:
    """
    Search across courses, collections and users within an organization.

    SECURITY:
    - Anonymous users can only search public courses and collections
    - Anonymous users CANNOT search/enumerate users (privacy protection)
    - Maximum limit enforced at service level
    - Uses parameterized queries (SQL injection protected)
    - LIKE wildcards are escaped to prevent user enumeration
    """
    from fastapi import HTTPException, status

    # SECURITY: Enforce maximum limit to prevent data dumping
    limit = min(limit, 50)
    offset = (page - 1) * limit

    # SECURITY: Escape SQL LIKE wildcards to prevent pattern-based enumeration
    search_query = _escape_like_wildcards(search_query)

    # Get organization
    org_statement = select(Organization).where(Organization.slug == org_slug)
    org = db_session.exec(org_statement).first()

    if not org:
        return SearchResult(courses=[], collections=[], communities=[], resources=[], users=[])

    # API Token validation: verify token belongs to this organization
    if isinstance(current_user, APITokenUser):
        if org.id != current_user.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API token cannot search in organizations outside its scope",
            )
        # Check if token has read permission for search
        if current_user.rights:
            rights = current_user.rights
            if isinstance(rights, dict):
                search_rights = rights.get("search", {})
                has_permission = search_rights.get("action_read", False)
            else:
                search_rights = getattr(rights, "search", None)
                has_permission = getattr(search_rights, "action_read", False) if search_rights else False

            if not has_permission:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="API token does not have search permission",
                )

    # Search courses using existing search_courses function
    courses = await search_courses(request, current_user, org_slug, search_query, db_session, page, limit)

    # Search collections
    collections_query = (
        select(Collection)
        .where(or_(Collection.org_id == org.id, Collection.shared == sa_true()))
        .where(
            or_(
                text('LOWER("collection".name) LIKE LOWER(:pattern)'),
                text('LOWER("collection".description) LIKE LOWER(:pattern)')
            )
        )
        .params(pattern=f"%{search_query}%")
    )

    communities_query = (
        select(Community)
        .where(or_(Community.org_id == org.id, Community.shared == sa_true()))
        .where(
            or_(
                text('LOWER(community.name) LIKE LOWER(:pattern)'),
                text('LOWER(community.description) LIKE LOWER(:pattern)')
            )
        )
        .params(pattern=f"%{search_query}%")
    )

    resource_ids_from_shared_channels = (
        select(ResourceChannelResource.resource_id)
        .join(ResourceChannel, ResourceChannel.id == ResourceChannelResource.channel_id)
        .where(or_(ResourceChannel.org_id == org.id, ResourceChannel.shared == sa_true()))
    )
    resources_query = (
        select(Resource)
        .where(Resource.id.in_(resource_ids_from_shared_channels))
        .where(
            or_(
                text('LOWER(resource.title) LIKE LOWER(:pattern)'),
                text('LOWER(resource.description) LIKE LOWER(:pattern)'),
                text('LOWER(resource.provider_name) LIKE LOWER(:pattern)')
            )
        )
        .params(pattern=f"%{search_query}%")
    )

    # Search users
    users_query = (
        select(User)
        .join(UserOrganization, and_(
            UserOrganization.user_id == User.id,
            UserOrganization.org_id == org.id
        ))
        .where(
            or_(
                text('LOWER("user".username) LIKE LOWER(:pattern) OR ' +
                     'LOWER("user".first_name) LIKE LOWER(:pattern) OR ' +
                     'LOWER("user".last_name) LIKE LOWER(:pattern) OR ' +
                     'LOWER("user".bio) LIKE LOWER(:pattern)')
            )
        )
        .params(pattern=f"%{search_query}%")
    )

    if isinstance(current_user, AnonymousUser):
        # For anonymous users, only show public collections
        collections_query = collections_query.where(
            Collection.org_id == org.id,
            Collection.public == sa_true(),
        )
        communities_query = communities_query.where(
            Community.org_id == org.id,
            Community.public == sa_true(),
        )
        resources = []
        # SECURITY: Anonymous users CANNOT search/enumerate users
        # This prevents user directory scraping attacks
        users = []
    else:
        # For authenticated users, show public collections and those in their org
        collections_query = (
            collections_query
            .where(
                or_(
                    Collection.public == sa_true(),
                    Collection.org_id == org.id,
                    Collection.shared == sa_true(),
                )
            )
        )
        communities_query = communities_query.where(
            or_(
                Community.org_id == org.id,
                Community.shared == sa_true(),
            )
        )
        resources = [
            _serialize_resource(resource, db_session, current_user, org.id)
            for resource in db_session.exec(resources_query.offset(offset).limit(limit)).all()
        ]

        # SECURITY: Only allow user search if the authenticated user is a member of this org
        # (superadmins bypass this check)
        if is_org_member(current_user.id, org.id, db_session):
            # User is a member of this org - allow user search
            users = db_session.exec(users_query.offset(offset).limit(limit)).all()
        else:
            # User is NOT a member - don't return user results
            users = []

    # Apply pagination to collections query
    collections = db_session.exec(collections_query.offset(offset).limit(limit)).all()
    communities = db_session.exec(communities_query.offset(offset).limit(limit)).all()

    # Batch fetch all courses for all collections in a single query
    collection_reads = []
    if collections:
        collection_ids = [c.id for c in collections]
        batch_statement = (
            select(CollectionCourse, Course)
            .join(Course, CollectionCourse.course_id == Course.id)  # type: ignore
            .where(
                CollectionCourse.collection_id.in_(collection_ids),  # type: ignore
            )
            .distinct()
        )
        batch_results = db_session.exec(batch_statement).all()

        # Group courses by collection_id
        collection_courses_map: dict[int, list[Course]] = {}
        seen: set[tuple[int, int]] = set()
        for cc, course in batch_results:
            key = (cc.collection_id, course.id)
            if key not in seen:
                seen.add(key)
                collection_courses_map.setdefault(cc.collection_id, []).append(course)

        for collection in collections:
            courses_list = collection_courses_map.get(collection.id, [])
            owner_org = db_session.exec(select(Organization).where(Organization.id == collection.org_id)).first()
            payload = CollectionRead(**collection.model_dump(), courses=courses_list).model_dump()
            if owner_org:
                payload.update(owner_org_payload(owner_org, org.id))
            collection_read = CollectionRead.model_validate(payload)
            collection_reads.append(collection_read)

    community_reads = []
    for community in communities:
        owner_org = db_session.exec(select(Organization).where(Organization.id == community.org_id)).first()
        payload = CommunityRead.model_validate(community.model_dump()).model_dump()
        if owner_org:
            payload.update(owner_org_payload(owner_org, org.id))
        community_reads.append(CommunityRead.model_validate(payload))

    # Convert users to UserRead objects
    user_reads = [UserRead.model_validate(user) for user in users]

    return SearchResult(
        courses=courses,
        collections=collection_reads,
        communities=community_reads,
        resources=resources,
        users=user_reads
    )

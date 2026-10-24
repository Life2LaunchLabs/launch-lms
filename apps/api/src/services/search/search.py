from typing import TypeVar

from fastapi import Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import true as sa_true
from sqlmodel import Session, and_, func, or_, select, text
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization, OrganizationDiscoverRead
from src.db.resources import ResourceChannel, ResourceChannelRead
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User, UserRead
from src.security.org_auth import is_org_member
from src.services.orgs.orgs import _build_discover_org_read
from src.services.resources import _channel_is_accessible, list_resources

T = TypeVar('T')

class SearchResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Plans the organization offers to learners (Discover cards); the badge a plan earns is on its card.
    plans: list[dict]
    organizations: list[OrganizationDiscoverRead]
    resources: list[dict]
    resource_channels: list[ResourceChannelRead]
    users: list[UserRead]

def _escape_like_wildcards(query: str) -> str:
    """Escape SQL LIKE wildcards to prevent user enumeration via pattern matching."""
    return query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _plans(db_session: Session, current_user, org_id: int, search_query: str) -> list[dict]:
    """The organization's Discover plans whose title, description or badge matches."""
    from src.services.goals import plan_joining

    needle = search_query.replace('\\', '').lower()
    user = None if isinstance(current_user, (AnonymousUser, APITokenUser)) else current_user
    cards = plan_joining._cards(db_session, plan_joining.offers(db_session, org_id), plan_joining._user_id(user))
    return [card for card in cards if needle in " ".join([card["title"], card["description"], (card["badge"] or {}).get("name") or ""]).lower()]


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
    Search across the plans an organization offers learners, resources, organizations and users.

    SECURITY:
    - Plans in Discover are public; anonymous users see them too
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
        return SearchResult(plans=[], organizations=[], resources=[], resource_channels=[], users=[])

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

    resource_channels_query = (
        select(ResourceChannel)
        .where(or_(ResourceChannel.org_id == org.id, ResourceChannel.shared == sa_true()))
        .where(
            or_(
                text('LOWER(resourcechannel.name) LIKE LOWER(:pattern)'),
                text('LOWER(resourcechannel.description) LIKE LOWER(:pattern)')
            )
        )
        .params(pattern=f"%{search_query}%")
    )
    organizations_query = select(Organization).where(
        or_(
            text('LOWER(organization.name) LIKE LOWER(:pattern)'),
            text('LOWER(organization.description) LIKE LOWER(:pattern)'),
            text('LOWER(organization.about) LIKE LOWER(:pattern)'),
            text('LOWER(organization.slug) LIKE LOWER(:pattern)')
        )
    ).params(pattern=f"%{search_query}%")

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
        organizations_query = organizations_query.where(Organization.explore == sa_true())
        organizations = [
            _build_discover_org_read(
                discover_org,
                db_session.exec(
                    select(OrganizationConfig).where(OrganizationConfig.org_id == discover_org.id)
                ).first(),
                False,
                db_session.exec(select(func.count()).where(UserOrganization.org_id == discover_org.id)).one(),
            )
            for discover_org in db_session.exec(organizations_query.offset(offset).limit(limit)).all()
        ]
        resource_channels = []
        # SECURITY: Anonymous users CANNOT search/enumerate users
        # This prevents user directory scraping attacks
        users = []
    else:
        candidate_channels = db_session.exec(resource_channels_query).all()
        raw_channels = [
            channel
            for channel in candidate_channels
            if _channel_is_accessible(channel, db_session, current_user)
        ][offset:offset + limit]
        channel_org_ids = list({c.org_id for c in raw_channels})
        channel_owner_orgs: dict[int, Organization] = {}
        if channel_org_ids:
            channel_owner_orgs = {
                o.id: o
                for o in db_session.exec(
                    select(Organization).where(Organization.id.in_(channel_org_ids))  # type: ignore[arg-type]
                ).all()
                if o.id is not None
            }
        resource_channels = [
            ResourceChannelRead(
                id=ch.id,
                org_id=ch.org_id,
                channel_uuid=ch.channel_uuid,
                name=ch.name,
                description=ch.description,
                thumbnail_image=ch.thumbnail_image,
                public=ch.public,
                shared=ch.shared,
                is_starred=ch.is_starred,
                color=ch.color,
                creation_date=ch.creation_date,
                update_date=ch.update_date,
                owner_org_id=channel_owner_orgs[ch.org_id].id if ch.org_id in channel_owner_orgs else None,
                owner_org_uuid=channel_owner_orgs[ch.org_id].org_uuid if ch.org_id in channel_owner_orgs else None,
                owner_org_slug=channel_owner_orgs[ch.org_id].slug if ch.org_id in channel_owner_orgs else None,
                owner_org_name=channel_owner_orgs[ch.org_id].name if ch.org_id in channel_owner_orgs else None,
                is_shared_from_other_org=ch.org_id != org.id,
            )
            for ch in raw_channels
        ]
        discover_orgs = db_session.exec(organizations_query.offset(offset).limit(limit)).all()
        discover_org_ids = [discover_org.id for discover_org in discover_orgs if discover_org.id is not None]
        member_counts_map: dict[int, int] = {}
        if discover_org_ids:
            member_count_rows = db_session.exec(
                select(UserOrganization.org_id, func.count(UserOrganization.id))
                .where(UserOrganization.org_id.in_(discover_org_ids))  # type: ignore[arg-type]
                .group_by(UserOrganization.org_id)
            ).all()
            member_counts_map = {org_id: count for org_id, count in member_count_rows}

        member_org_ids: set[int] = set()
        if discover_org_ids:
            member_org_ids = set(
                db_session.exec(
                    select(UserOrganization.org_id).where(
                        UserOrganization.user_id == current_user.id,
                        UserOrganization.org_id.in_(discover_org_ids),  # type: ignore[arg-type]
                    )
                ).all()
            )

        organizations = []
        for discover_org in discover_orgs:
            org_config = db_session.exec(
                select(OrganizationConfig).where(OrganizationConfig.org_id == discover_org.id)
            ).first()
            organizations.append(
                _build_discover_org_read(
                    discover_org,
                    org_config,
                    discover_org.id in member_org_ids if discover_org.id is not None else False,
                    member_counts_map.get(discover_org.id or 0, 0),
                )
            )

        # SECURITY: Only allow user search if the authenticated user is a member of this org
        # (superadmins bypass this check)
        if is_org_member(current_user.id, org.id, db_session):
            # User is a member of this org - allow user search
            users = db_session.exec(users_query.offset(offset).limit(limit)).all()
        else:
            # User is NOT a member - don't return user results
            users = []

    plans = _plans(db_session, current_user, int(org.id), search_query)[offset:offset + limit]  # type: ignore[arg-type]
    resources = await list_resources(
        request,
        org.id,
        current_user,
        db_session,
        query=search_query,
        offset=offset,
        limit=limit,
    )
    # Convert users to UserRead objects
    user_reads = [UserRead.model_validate(user) for user in users]

    return SearchResult(
        plans=plans,
        organizations=organizations,
        resources=resources,
        resource_channels=resource_channels,
        users=user_reads
    )

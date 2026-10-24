
from fastapi import HTTPException, status
from sqlmodel import Session, select


async def check_element_type(element_uuid):
    """
    Check if the element is a course, a user, a house or a collection, by checking its prefix
    """
    if element_uuid.startswith("learning_activity_"):
        return "learning_activities"
    elif element_uuid.startswith("user_"):
        return "users"
    elif element_uuid.startswith("usergroup_"):
        return "usergroups"
    elif element_uuid.startswith("house_"):
        return "houses"
    elif element_uuid.startswith("org_"):
        return "organizations"
    elif element_uuid.startswith("role_"):
        return "roles"
    elif element_uuid.startswith("community_"):
        return "communities"
    elif element_uuid.startswith("resource_"):
        return "resources"
    elif element_uuid.startswith("channel_"):
        return "resource_channels"
    elif element_uuid.startswith("discussion_"):
        return "discussions"
    elif element_uuid.startswith("vote_"):
        return "votes"
    elif element_uuid.startswith("podcast_"):
        return "podcasts"
    elif element_uuid.startswith("episode_"):
        return "episodes"
    elif element_uuid.startswith("board_"):
        return "boards"
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User rights : Issue verifying element nature",
        )


async def check_permissions_with_own(
    element_rights,
    action: str,
    is_author: bool = False
) -> bool:
    """
    Check permissions including resource-owner variants.

    Args:
        element_rights: A PermissionsWithOwn object or stored dictionary
        action: The action to check ("read", "update", "delete", "create")
        is_author: Whether the user is the author of the course

    Returns:
        bool: True if permission is granted, False otherwise
    """
    if not element_rights:
        return False

    # Handle both dict (from JSON storage) and object access
    def get_permission(key: str) -> bool:
        if isinstance(element_rights, dict):
            return element_rights.get(key, False)
        return getattr(element_rights, key, False)

    # Check for general permission first
    if get_permission(f"action_{action}"):
        return True

    # Check for "own" permission if user is the author
    if is_author:
        own_action = f"action_{action}_own"
        if get_permission(own_action):
            return True

    return False


async def get_singular_form_of_element(element_uuid):
    element_type = await check_element_type(element_uuid)

    if element_type == "learning_activities":
        return "activity"
    else:
        singular_form_element = element_type[:-1]
        return singular_form_element


async def get_id_identifier_of_element(element_uuid):
    singular_form_element = await get_singular_form_of_element(element_uuid)

    if singular_form_element == "organization":
        return "org_id"
    else:
        return str(singular_form_element) + "_id"


async def get_element_organization_id(
    element_uuid: str,
    db_session: Session,
) -> int | None:
    """
    Get the organization ID that an element belongs to.

    This is CRITICAL for API token authorization - tokens can only access
    resources within their organization.

    Args:
        element_uuid: The UUID of the element
        db_session: Database session

    Returns:
        Optional[int]: The organization ID, or None if not applicable
    """
    # Import models here to avoid circular imports
    from src.db.learning import LearningActivity
    from src.db.organizations import Organization
    from src.db.roles import Role
    from src.db.usergroups import UserGroup

    element_type = await check_element_type(element_uuid)

    if element_type == "learning_activities":
        item = db_session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == element_uuid)).first()
        return item.org_id if item else None

    elif element_type == "organizations":
        statement = select(Organization).where(Organization.org_uuid == element_uuid)
        org = db_session.exec(statement).first()
        return org.id if org else None

    elif element_type == "roles":
        statement = select(Role).where(Role.role_uuid == element_uuid)
        role = db_session.exec(statement).first()
        return role.org_id if role else None

    elif element_type == "usergroups":
        statement = select(UserGroup).where(UserGroup.usergroup_uuid == element_uuid)
        usergroup = db_session.exec(statement).first()
        return usergroup.org_id if usergroup else None

    elif element_type == "users":
        # Users are not scoped to a single organization
        # For API tokens, we need to verify user access differently
        return None

    elif element_type == "houses":
        # Houses might not have org_id - return None
        return None

    elif element_type == "resources":
        from src.db.resources import Resource
        statement = select(Resource).where(Resource.resource_uuid == element_uuid)
        resource = db_session.exec(statement).first()
        return resource.org_id if resource else None
    elif element_type == "resource_channels":
        from src.db.resources import ResourceChannel
        statement = select(ResourceChannel).where(ResourceChannel.channel_uuid == element_uuid)
        channel = db_session.exec(statement).first()
        return channel.org_id if channel else None






    # Unknown element type
    return None

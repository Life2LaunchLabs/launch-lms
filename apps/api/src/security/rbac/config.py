"""
RBAC Resource Configurations

This module defines configurations for each resource type that the RBAC system handles.
Adding a new resource type is as simple as adding a new entry to RESOURCE_CONFIGS.
"""

from src.security.rbac.types import ResourceConfig

RESOURCE_CONFIGS: dict[str, ResourceConfig] = {
    # ============================================
    # PRIMARY RESOURCES (have their own access rules)
    # ============================================
    "resources": ResourceConfig(
        resource_type="resources",
        uuid_prefix="resource_",
        has_published_field=False,
        supports_usergroups=False,
        supports_authorship=True,
        model_name="Resource",
        uuid_field="resource_uuid",
    ),
    "resource_channels": ResourceConfig(
        resource_type="resource_channels",
        uuid_prefix="channel_",
        has_published_field=False,
        supports_usergroups=True,
        supports_authorship=False,
        model_name="ResourceChannel",
        uuid_field="channel_uuid",
    ),

    # ============================================
    # CHILD RESOURCES (inherit access from parent)
    # ============================================
    "learning_activities": ResourceConfig(
        resource_type="learning_activities",
        uuid_prefix="learning_activity_",
        has_published_field=True,
        supports_usergroups=False,
        supports_authorship=False,
        model_name="LearningActivity",
        uuid_field="activity_uuid",
    ),
}


def get_resource_config(resource_uuid: str) -> ResourceConfig | None:
    """
    Get the resource configuration based on the UUID prefix.

    Args:
        resource_uuid: The UUID of the resource

    Returns:
        ResourceConfig if found, None otherwise
    """
    # Handle None/empty input to avoid AttributeError
    if not resource_uuid:
        return None

    for config in sorted(RESOURCE_CONFIGS.values(), key=lambda item: len(item.uuid_prefix), reverse=True):
        if resource_uuid.startswith(config.uuid_prefix):
            return config
    return None


def get_resource_type(resource_uuid: str) -> str | None:
    """
    Get the resource type from a UUID.

    Args:
        resource_uuid: The UUID of the resource

    Returns:
        Resource type string if found, None otherwise
    """
    config = get_resource_config(resource_uuid)
    return config.resource_type if config else None

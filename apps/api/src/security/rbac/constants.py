"""
RBAC Role Constants

This module defines role ID constants used throughout the RBAC system.
Using constants instead of magic numbers improves code maintainability and clarity.

Roles: an organization has three, Admin, Staff and Learner.
    ADMIN (1) - Everything, including org settings, roles and staff permissions
    MAINTAINER (2) - Staff: what each staff member may do is a set of permissions the admin
                     gives them (security/org_auth.STAFF_PERMISSIONS)
    USER (4) - Learner
The old Instructor role (3) and custom roles are retired; their members became staff or learners.
"""

# Core role IDs - these match the database seed data
ADMIN_ROLE_ID = 1
MAINTAINER_ROLE_ID = 2
USER_ROLE_ID = 4
STAFF_ROLE_ID = MAINTAINER_ROLE_ID
LEARNER_ROLE_ID = USER_ROLE_ID
# The roles an organization assigns, by uuid.
ORG_ROLE_UUIDS = frozenset(["role_global_admin", "role_global_maintainer", "role_global_user"])

# Role ID sets for common checks
ADMIN_ROLE_IDS = frozenset([ADMIN_ROLE_ID])
ADMIN_OR_MAINTAINER_ROLE_IDS = frozenset([ADMIN_ROLE_ID, MAINTAINER_ROLE_ID])


def is_admin(role_id: int) -> bool:
    """Check if the role ID is an admin role."""
    return role_id == ADMIN_ROLE_ID


def is_admin_or_maintainer(role_id: int) -> bool:
    """Check if the role ID is an admin or maintainer role."""
    return role_id in ADMIN_OR_MAINTAINER_ROLE_IDS


def has_elevated_privileges(role_id: int) -> bool:
    """
    Check if the role has elevated privileges.

    Elevated privileges include admin and maintainer roles.
    """
    return role_id in ADMIN_OR_MAINTAINER_ROLE_IDS

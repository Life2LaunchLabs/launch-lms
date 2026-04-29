from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from src.db.roles import Role, RoleTypeEnum
from src.db.user_organizations import UserOrganization
from src.security.org_auth import require_org_role_permission


def _exec_result(value):
    result = Mock()
    result.first.return_value = value
    return result


def _role(role_id: int, rights: dict | None) -> Role:
    return Role(
        id=role_id,
        name=f"role-{role_id}",
        role_uuid=f"role_{role_id}",
        role_type=RoleTypeEnum.TYPE_GLOBAL,
        rights=rights,
    )


def _user_org(role_id: int) -> UserOrganization:
    return UserOrganization(user_id=10, org_id=20, role_id=role_id)


class TestRequireOrgRolePermission:
    def test_falls_back_for_legacy_default_admin_without_resource_rights(self):
        db_session = Mock(spec=Session)
        db_session.exec.side_effect = [
            _exec_result(_user_org(role_id=1)),
            _exec_result(_role(role_id=1, rights={"courses": {"action_update": True}})),
        ]

        with patch("src.security.org_auth._is_user_superadmin", return_value=False):
            require_org_role_permission(
                user_id=10,
                org_id=20,
                db_session=db_session,
                resource="resources",
                action="action_update",
            )

    def test_enforces_explicit_resource_rights_for_custom_roles(self):
        db_session = Mock(spec=Session)
        db_session.exec.side_effect = [
            _exec_result(_user_org(role_id=9)),
            _exec_result(
                _role(
                    role_id=9,
                    rights={"resources": {"action_read": True, "action_update": False}},
                )
            ),
        ]

        with patch("src.security.org_auth._is_user_superadmin", return_value=False):
            with pytest.raises(HTTPException) as exc_info:
                require_org_role_permission(
                    user_id=10,
                    org_id=20,
                    db_session=db_session,
                    resource="resources",
                    action="action_update",
                )

        assert exc_info.value.status_code == 403

    def test_allows_migrated_default_admin_resource_rights(self):
        db_session = Mock(spec=Session)
        db_session.exec.side_effect = [
            _exec_result(_user_org(role_id=1)),
            _exec_result(
                _role(
                    role_id=1,
                    rights={"resources": {"action_read": True, "action_update": True}},
                )
            ),
        ]

        with patch("src.security.org_auth._is_user_superadmin", return_value=False):
            require_org_role_permission(
                user_id=10,
                org_id=20,
                db_session=db_session,
                resource="resources",
                action="action_update",
            )

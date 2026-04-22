import pytest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from sqlmodel import Session

from src.db.users import AnonymousUser, PublicUser
from src.security.superadmin import require_superadmin


class TestRequireSuperadmin:
    @pytest.fixture
    def mock_db_session(self):
        return Mock(spec=Session)

    @pytest.fixture
    def current_user(self):
        return PublicUser(
            id=123,
            user_uuid="user_123",
            username="platform-admin",
            first_name="Platform",
            last_name="Admin",
            email="platform@example.com",
        )

    @pytest.mark.asyncio
    async def test_allows_real_superadmin(self, mock_db_session, current_user):
        with patch("src.security.superadmin.is_user_superadmin", return_value=True), \
             patch("src.security.superadmin.is_user_owner_org_admin", return_value=False):
            result = await require_superadmin(current_user=current_user, db_session=mock_db_session)
        assert result == current_user

    @pytest.mark.asyncio
    async def test_allows_owner_org_admin(self, mock_db_session, current_user):
        with patch("src.security.superadmin.is_user_superadmin", return_value=False), \
             patch("src.security.superadmin.is_user_owner_org_admin", return_value=True):
            result = await require_superadmin(current_user=current_user, db_session=mock_db_session)
        assert result == current_user

    @pytest.mark.asyncio
    async def test_rejects_anonymous_user(self, mock_db_session):
        with pytest.raises(HTTPException) as exc_info:
            await require_superadmin(current_user=AnonymousUser(), db_session=mock_db_session)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Authentication required"

    @pytest.mark.asyncio
    async def test_rejects_non_platform_admin(self, mock_db_session, current_user):
        with patch("src.security.superadmin.is_user_superadmin", return_value=False), \
             patch("src.security.superadmin.is_user_owner_org_admin", return_value=False):
            with pytest.raises(HTTPException) as exc_info:
                await require_superadmin(current_user=current_user, db_session=mock_db_session)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Platform admin access required"

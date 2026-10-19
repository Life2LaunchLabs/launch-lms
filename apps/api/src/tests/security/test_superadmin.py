from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.security.superadmin import require_superadmin

NOW = "2026-01-01T00:00:00+00:00"


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
        with patch("src.security.superadmin.is_user_superadmin", return_value=True):
            result = await require_superadmin(current_user=current_user, db_session=mock_db_session)
        assert result == current_user

    @pytest.mark.asyncio
    async def test_rejects_owner_org_admin_without_superadmin_flag(self, current_user):
        # An admin of the first (owner) org is still only an org admin.
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        for model in (User, Organization, UserOrganization):
            model.__table__.create(engine)
        with Session(engine) as db:
            db.add(Organization(id=1, org_uuid="org_1", name="Owner", slug="owner", email="owner@example.com", creation_date=NOW, update_date=NOW))
            db.add(User(id=current_user.id, user_uuid=current_user.user_uuid, username=current_user.username, email=current_user.email, first_name="", last_name="", is_superadmin=False, creation_date=NOW, update_date=NOW))
            db.add(UserOrganization(user_id=current_user.id, org_id=1, role_id=ADMIN_ROLE_ID, creation_date=NOW, update_date=NOW))
            db.commit()
            with pytest.raises(HTTPException) as exc_info:
                await require_superadmin(current_user=current_user, db_session=db)
            assert exc_info.value.status_code == 403

            user = db.get(User, current_user.id)
            user.is_superadmin = True
            db.add(user)
            db.commit()
            assert await require_superadmin(current_user=current_user, db_session=db) == current_user

    @pytest.mark.asyncio
    async def test_rejects_anonymous_user(self, mock_db_session):
        with pytest.raises(HTTPException) as exc_info:
            await require_superadmin(current_user=AnonymousUser(), db_session=mock_db_session)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Authentication required"

    @pytest.mark.asyncio
    async def test_rejects_non_platform_admin(self, mock_db_session, current_user):
        with patch("src.security.superadmin.is_user_superadmin", return_value=False):
            with pytest.raises(HTTPException) as exc_info:
                await require_superadmin(current_user=current_user, db_session=mock_db_session)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Platform admin access required"

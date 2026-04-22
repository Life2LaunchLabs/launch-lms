from types import SimpleNamespace

import pytest

from src.db.users import AnonymousUser, PublicUser
from src.services.courses.collections import get_collections


class _ExecResult:
    def __init__(self, value):
        self._value = value

    def all(self):
        return self._value


class _RecordingSession:
    def __init__(self):
        self.statements = []

    def exec(self, statement):
        self.statements.append(statement)
        return _ExecResult([])


@pytest.mark.asyncio
async def test_get_collections_for_authenticated_users_only_queries_current_org() -> None:
    session = _RecordingSession()
    user = PublicUser(
        id=123,
        email="admin@example.com",
        username="admin",
        first_name="Org",
        last_name="Admin",
        user_uuid="user_123",
    )

    result = await get_collections(
        request=SimpleNamespace(),
        org_id="42",
        current_user=user,
        db_session=session,
        page=1,
        limit=10,
        include_shared=False,
    )

    assert result == []
    query_sql = str(session.statements[0])
    assert "collection.org_id = :org_id_1" in query_sql
    assert "collection.shared" not in query_sql


@pytest.mark.asyncio
async def test_get_collections_for_anonymous_users_only_queries_public_current_org() -> None:
    session = _RecordingSession()

    result = await get_collections(
        request=SimpleNamespace(),
        org_id="42",
        current_user=AnonymousUser(),
        db_session=session,
        page=1,
        limit=10,
        include_shared=False,
    )

    assert result == []
    query_sql = str(session.statements[0])
    assert "collection.org_id = :org_id_1" in query_sql
    assert "collection.public = true" in query_sql.lower()
    assert "collection.shared" not in query_sql


@pytest.mark.asyncio
async def test_get_collections_can_include_shared_for_user_facing_views() -> None:
    session = _RecordingSession()
    user = PublicUser(
        id=123,
        email="member@example.com",
        username="member",
        first_name="Org",
        last_name="Member",
        user_uuid="user_456",
    )

    result = await get_collections(
        request=SimpleNamespace(),
        org_id="42",
        current_user=user,
        db_session=session,
        page=1,
        limit=10,
        include_shared=True,
    )

    assert result == []
    query_sql = str(session.statements[0])
    assert "collection.org_id = :org_id_1" in query_sql
    assert "collection.shared = true" in query_sql.lower()

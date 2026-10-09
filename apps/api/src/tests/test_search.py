from types import SimpleNamespace

import pytest

from src.services.search import search


class _EmptyResult:
    def __init__(self, first=None):
        self._first = first

    def first(self):
        return self._first

    def all(self):
        return []


class _SearchSession:
    def __init__(self):
        self.calls = 0

    def exec(self, _statement):
        self.calls += 1
        return _EmptyResult(SimpleNamespace(id=7) if self.calls == 1 else None)


@pytest.mark.asyncio
async def test_search_includes_permission_filtered_resources_and_applies_page(monkeypatch):
    captured = {}

    async def fake_list_resources(request, org_id, current_user, db_session, **filters):
        captured.update({
            "request": request,
            "org_id": org_id,
            "current_user": current_user,
            "db_session": db_session,
            "filters": filters,
        })
        resources = [{"resource_uuid": f"resource_{index}", "title": f"Resource {index}"} for index in range(5)]
        offset = filters["offset"]
        return resources[offset:offset + filters["limit"]]

    monkeypatch.setattr(search, "list_resources", fake_list_resources)
    monkeypatch.setattr(search, "is_org_member", lambda *_args: False)
    session = _SearchSession()
    user = SimpleNamespace(id=11)
    request = object()

    result = await search.search_across_org(
        request=request,
        current_user=user,
        org_slug="acme",
        search_query="career",
        db_session=session,
        page=2,
        limit=2,
    )

    assert [resource["resource_uuid"] for resource in result.resources] == ["resource_2", "resource_3"]
    assert captured == {
        "request": request,
        "org_id": 7,
        "current_user": user,
        "db_session": session,
        "filters": {"query": "career", "offset": 2, "limit": 2},
    }

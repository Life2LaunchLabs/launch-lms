"""Legacy FEED migration never guesses ownership or writes during audit."""

from types import SimpleNamespace

import pytest

from scripts.migrate_feedback_ownership import apply_plan, feedback_issues, migration_plan
from src.services.operations_identity import opaque_subject


SECRET = "stable-subject-secret-for-migration-tests"


class FakeResult:
    def __init__(self, value):
        self.value = value

    def first(self):
        return self.value


class FakeSession:
    def __init__(self):
        self.calls = 0

    def exec(self, _statement):
        self.calls += 1
        if self.calls % 2:
            return FakeResult(SimpleNamespace(user_uuid="user-uuid"))
        return FakeResult(SimpleNamespace(org_uuid="org-uuid"))


class DeletedUserSession:
    def __init__(self, *, reused=False):
        self.calls = 0
        self.reused = reused

    def exec(self, _statement):
        self.calls += 1
        if self.calls % 3 == 1:
            return FakeResult(None)
        if self.calls % 3 == 2:
            return FakeResult(SimpleNamespace(org_uuid="org-uuid"))
        return FakeResult(SimpleNamespace(user_uuid="reused") if self.reused else None)


class FakeJira:
    project = "FEED"

    def __init__(self):
        self.properties = {
            ("FEED-1", "launchlms.feedback"): {
                "user_id": 5, "org_id": 3, "user_uuid": "user-uuid", "intent": "broken", "source": "unstable",
            },
            ("FEED-2", "launchlms.feedback"): {
                "user_id": 5, "org_id": 3, "user_uuid": "user-uuid", "intent": None, "source": "unstable",
            },
        }
        self.writes = []
        self.searches = []

    def _request(self, method, path, payload):
        assert method == "POST" and path == "/rest/api/3/search/jql"
        self.searches.append(payload)
        if payload.get("nextPageToken"):
            return {"issues": [{"key": "FEED-2", "fields": {"labels": ["launchlms-feedback", "launchlms-org-3"]}}], "isLast": True}
        return {"issues": [{"key": "FEED-1", "fields": {"labels": ["launchlms-feedback", "launchlms-org-3"]}}], "nextPageToken": "page-2"}

    def property(self, key, name):
        return self.properties.get((key, name))

    def set_property(self, key, name, value):
        self.writes.append((key, name, value))
        self.properties[(key, name)] = value


def test_opaque_subject_matches_embed_identity_contract(monkeypatch):
    from src.routers.operations_surface import _opaque

    monkeypatch.setenv("LAUNCHLMS_OPERATIONS_SUBJECT_SECRET", SECRET)
    assert _opaque("user", "user-uuid") == opaque_subject("user", "user-uuid", SECRET)
    assert _opaque("organization", "org-uuid") == opaque_subject("organization", "org-uuid", SECRET)
    assert _opaque("user", "user-uuid") != _opaque("organization", "user-uuid")


def test_audit_paginates_and_apply_is_idempotent():
    jira = FakeJira()
    assert [issue["key"] for issue in feedback_issues(jira)] == ["FEED-1", "FEED-2"]
    assert jira.searches[-1]["nextPageToken"] == "page-2"
    plan, existing, digest = migration_plan(jira, FakeSession(), SECRET)
    assert len(plan) == 2 and existing == 0 and len(digest) == 64
    assert jira.writes == []
    assert plan[0][1]["opaque_organization_id"] == opaque_subject("organization", "org-uuid", SECRET)
    assert apply_plan(jira, plan) == 2
    assert apply_plan(jira, plan) == 0
    _, existing, same_digest = migration_plan(jira, FakeSession(), SECRET)
    assert existing == 2 and same_digest == digest


def test_audit_rejects_missing_or_conflicting_owners_before_writes():
    jira = FakeJira()
    jira.properties[("FEED-2", "launchlms.feedback")]["user_uuid"] = "other-uuid"
    with pytest.raises(ValueError, match="FEED-2.*does not match"):
        migration_plan(jira, FakeSession(), SECRET)
    assert jira.writes == []
    jira.properties[("FEED-2", "launchlms.feedback")]["user_uuid"] = "user-uuid"
    plan, _, _ = migration_plan(jira, FakeSession(), SECRET)
    jira.properties[("FEED-1", "launch-operations")] = {"opaque_user_id": "wrong"}
    with pytest.raises(ValueError, match="changed after audit"):
        apply_plan(jira, plan)
    assert jira.writes == []


def test_audit_rejects_legacy_org_label_mismatch():
    jira = FakeJira()
    jira.properties[("FEED-1", "launchlms.feedback")]["org_id"] = 4
    with pytest.raises(ValueError, match="labels disagree"):
        migration_plan(jira, FakeSession(), SECRET)
    assert jira.writes == []


def test_audit_preserves_deleted_user_history_without_reassigning_owner():
    jira = FakeJira()
    legacy_uuid = "user_12345678-1234-4234-8234-123456789abc"
    for key in ("FEED-1", "FEED-2"):
        jira.properties[(key, "launchlms.feedback")]["user_uuid"] = legacy_uuid
    plan, _, _ = migration_plan(jira, DeletedUserSession(), SECRET)
    assert len(plan) == 2
    assert all(value["opaque_user_id"] == opaque_subject("user", legacy_uuid, SECRET)
               for _, value in plan)
    assert jira.writes == []


def test_audit_rejects_invalid_or_reused_deleted_user_uuid():
    jira = FakeJira()
    jira.properties[("FEED-1", "launchlms.feedback")]["user_uuid"] = "not-a-durable-uuid"
    with pytest.raises(ValueError, match="FEED-1.*invalid"):
        migration_plan(jira, DeletedUserSession(), SECRET)
    jira.properties[("FEED-1", "launchlms.feedback")]["user_uuid"] = "user_12345678-1234-4234-8234-123456789abc"
    with pytest.raises(ValueError, match="FEED-1.*another app user"):
        migration_plan(jira, DeletedUserSession(reused=True), SECRET)
    assert jira.writes == []


def test_audit_rejects_incomplete_jira_pagination():
    jira = FakeJira()
    jira._request = lambda *_args: {"issues": [], "isLast": False}
    with pytest.raises(ValueError, match="pagination was incomplete"):
        feedback_issues(jira)

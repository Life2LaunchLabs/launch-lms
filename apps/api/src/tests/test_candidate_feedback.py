from types import SimpleNamespace

from src.routers import candidate_feedback as router
from src.services.candidate_jira import (
    INTERNAL_NOTE_PREFIX,
    PUBLIC_REPLY_PREFIX,
    CandidateGitHub,
    github_release,
    serialize_feedback,
    state_for_issue,
)


class FakeJira:
    statuses = {
        "open": "To Do", "in_progress": "In Progress",
        "awaiting_confirmation": "In Review", "solved": "Done", "ignored": "Done",
    }

    def property(self, key, property_key):
        return {"revision": "a" * 40} if property_key.endswith("release-note") else None


def issue(labels=None):
    return {
        "key": "BOT-200",
        "fields": {
            "description": {"type": "doc", "content": [{"type": "text", "text": "Button broke"}]},
            "status": {"name": "In Review"},
            "priority": {"name": "High"},
            "labels": labels or ["tester-confirmation"],
            "comment": {"comments": [
                {"id": "1", "body": {"type": "text", "text": f"{PUBLIC_REPLY_PREFIX} Try it now"}, "author": {"displayName": "Admin"}},
                {"id": "2", "body": {"type": "text", "text": f"{INTERNAL_NOTE_PREFIX} suspect cache"}, "author": {"displayName": "Admin"}},
            ]},
            "attachment": [],
        },
    }


def test_tester_serialization_hides_internal_jira_notes():
    value = serialize_feedback(issue(), {"username": "tester"}, FakeJira(), admin=False)
    assert value["status"] == "awaiting_confirmation"
    assert value["priority"] == "high"
    assert [entry["message"] for entry in value["entries"]] == ["Try it now"]


def test_admin_serialization_includes_internal_jira_notes():
    value = serialize_feedback(issue(), {"username": "tester"}, FakeJira(), admin=True)
    assert value["submitter"] == "tester"
    assert [entry["internal"] for entry in value["entries"]] == [False, True]


def test_ignored_label_wins_when_jira_uses_done_for_two_states():
    assert state_for_issue(issue(["feedback-ignored"]), FakeJira()) == "ignored"


def test_commit_release_note_is_preferred_over_technical_subject():
    class GitHub(CandidateGitHub):
        def pull_for_commit(self, sha):
            raise AssertionError("an explicit commit release note needs no extra API request")

    value = github_release({
        "sha": "b" * 40,
        "html_url": "https://example.test/commit",
        "commit": {"message": "refactor widgets\n\nRelease note: You can now duplicate a widget.", "author": {"date": "2026-09-10"}},
    }, GitHub({}))
    assert value["notes"][0]["text"] == "You can now duplicate a widget."


def test_release_feed_groups_only_unseen_commits_above_divider(monkeypatch):
    old_sha, new_sha = "a" * 40, "b" * 40
    commits = {
        old_sha: {"sha": old_sha, "commit": {"message": "Old change", "author": {"date": "2026-09-09"}}},
        new_sha: {"sha": new_sha, "commit": {"message": "Release note: New thing", "author": {"date": "2026-09-10"}}},
    }

    class GitHub:
        repository = "owner/repo"
        def commits(self, base, head): return [commits[new_sha]]
        def recent_commits(self, head): return [commits[new_sha], commits[old_sha]]
        def pull_for_commit(self, sha): return None

    monkeypatch.setattr(router, "CandidateGitHub", GitHub)
    monkeypatch.setattr(router, "current_revision", lambda: new_sha)
    result = router.release_feed(db_session=None, current_user=SimpleNamespace(details={"candidate_release_seen": old_sha}))
    assert result["has_unread"] is True
    assert [release["revision"] for release in result["unseen"]] == [new_sha]
    assert [release["revision"] for release in result["previous"]] == [old_sha]

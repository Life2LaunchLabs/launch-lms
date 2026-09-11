from types import SimpleNamespace

from src.routers import candidate_feedback as router
from src.routers.candidate_feedback import sanitize_context, sanitize_route
from src.services.candidate_jira import (
    INTERNAL_NOTE_PREFIX,
    PUBLIC_REPLY_PREFIX,
    TESTER_COMMENT_PREFIX,
    CandidateGitHub,
    CandidateJira,
    github_release,
    serialize_feedback,
)


class FakeJira:
    def property(self, key, property_key):
        return {"revision": "a" * 40} if property_key.endswith("release-note") else None

    def transitions(self, key):
        return [
            {
                "id": "7",
                "name": "Start progress",
                "to": {"id": "3", "name": "In Progress", "category": "indeterminate"},
            }
        ]


def issue(labels=None):
    return {
        "key": "BOT-200",
        "fields": {
            "description": {
                "type": "doc",
                "content": [{"type": "text", "text": "Button broke"}],
            },
            "status": {
                "id": "4",
                "name": "In Review",
                "statusCategory": {"key": "indeterminate"},
            },
            "priority": {"id": "2", "name": "High"},
            "labels": labels or ["tester-confirmation"],
            "comment": {
                "comments": [
                    {
                        "id": "1",
                        "body": {
                            "type": "text",
                            "text": f"{PUBLIC_REPLY_PREFIX} Try it now",
                        },
                        "author": {"displayName": "Admin"},
                    },
                    {
                        "id": "2",
                        "body": {
                            "type": "text",
                            "text": f"{INTERNAL_NOTE_PREFIX} suspect cache",
                        },
                        "author": {"displayName": "Admin"},
                    },
                    {
                        "id": "3",
                        "body": {
                            "type": "text",
                            "text": f"{TESTER_COMMENT_PREFIX} It also happens in Firefox",
                        },
                        "author": {"displayName": "Private name"},
                    },
                ]
            },
            "attachment": [],
        },
    }


def test_tester_serialization_hides_internal_jira_notes():
    value = serialize_feedback(issue(), {"username": "tester"}, FakeJira(), admin=False)
    assert value["status"] == "In Review"
    assert value["priority"] == "High"
    assert [entry["message"] for entry in value["entries"]] == [
        "Try it now",
        "It also happens in Firefox",
    ]
    assert value["entries"][-1]["author"] == "You"
    assert value["visible_revision"] == "4:1"


def test_admin_serialization_includes_internal_jira_notes():
    value = serialize_feedback(issue(), {"username": "tester"}, FakeJira(), admin=True)
    assert value["submitter"] == "tester"
    assert [entry["audience"] for entry in value["entries"]] == [
        "shared",
        "internal",
        "tester",
    ]
    assert value["visible_revision"] == "4:1"
    assert value["transitions"][0]["to"]["name"] == "In Progress"


def test_commit_release_note_is_preferred_over_technical_subject():
    class GitHub(CandidateGitHub):
        def pull_for_commit(self, sha):
            raise AssertionError(
                "an explicit commit release note needs no extra API request"
            )

    value = github_release(
        {
            "sha": "b" * 40,
            "html_url": "https://example.test/commit",
            "commit": {
                "message": "refactor widgets\n\nRelease note: You can now duplicate a widget.",
                "author": {"date": "2026-09-10"},
            },
        },
        GitHub({}),
    )
    assert value["notes"][0]["text"] == "You can now duplicate a widget."


def test_technical_commit_without_merge_message_is_hidden():
    class GitHub(CandidateGitHub):
        def pull_for_commit(self, sha):
            return None

    value = github_release(
        {
            "sha": "c" * 40,
            "commit": {
                "message": "refactor internal widget adapter",
                "author": {"date": "2026-09-10"},
            },
        },
        GitHub({}),
    )
    assert value is None


def test_feedback_board_uses_jira_column_configuration(monkeypatch):
    client = CandidateJira({"LAUNCHLMS_FEEDBACK_JIRA_BOARD_ID": "12"})
    monkeypatch.setattr(
        client,
        "_request",
        lambda method, path: {
            "columnConfig": {
                "columns": [
                    {"name": "Open", "statuses": [{"id": "1"}]},
                    {"name": "Working", "statuses": [{"id": "3"}, {"id": "4"}]},
                ]
            }
        },
    )
    assert client.board_columns() == [
        {"id": "column-0", "name": "Open", "status_ids": ["1"]},
        {"id": "column-1", "name": "Working", "status_ids": ["3", "4"]},
    ]


def test_reproduction_context_redacts_route_values_and_user_agent_detail():
    assert (
        sanitize_route("/orgs/private-school/plans/my-personal-plan?token=secret")
        == "/orgs/:id/plans/:id"
    )
    value = sanitize_context(
        '{"routes":["/orgs/acme/badges/private-name"],"viewport":{"width":390,"height":844},"user_agent":"Mozilla Chrome/126.0.1 unique-fingerprint","platform":"Linux x86_64"}'
    )
    assert value["routes"] == ["/orgs/:id/badges/:id"]
    assert value["browser"] == "Chrome 126"
    assert value["platform"] == "Linux"
    assert "unique-fingerprint" not in str(value)
    assert sanitize_context('["not", "an", "object"]')["routes"] == []
    assert sanitize_context('{"pixel_ratio":"private-value"}')["pixel_ratio"] == 1


def test_feedback_unread_revision_ignores_internal_and_tester_comments(monkeypatch):
    class Jira(FakeJira):
        project = "BOT"

        def search(self, jql):
            return [issue()]

        def property(self, key, property_key):
            return {"org_id": 7, "user_id": 42, "username": "tester"}

    monkeypatch.setattr(router, "CandidateJira", Jira)
    monkeypatch.setattr(router, "require_org_membership", lambda *_args: None)
    current_user = SimpleNamespace(
        id=42, details={"candidate_feedback_seen": {"BOT-200": "4:1"}}
    )
    values = router.list_feedback(
        org_id=7, admin=False, db_session=None, current_user=current_user
    )
    assert values[0]["has_unread"] is False

    current_user.details["candidate_feedback_seen"]["BOT-200"] = "3:1"
    values = router.list_feedback(
        org_id=7, admin=False, db_session=None, current_user=current_user
    )
    assert values[0]["has_unread"] is True

    current_user.details["candidate_feedback_seen"] = {}
    values = router.list_feedback(
        org_id=7, admin=False, db_session=None, current_user=current_user
    )
    assert values[0]["has_unread"] is True


def test_announcement_feed_returns_unread_oldest_first(monkeypatch):
    class Jira:
        def project_property(self, key):
            return {"items": [{"id": "new"}, {"id": "middle"}, {"id": "old"}]}

    monkeypatch.setattr(router, "CandidateJira", Jira)
    result = router.list_announcements(
        SimpleNamespace(details={"candidate_announcements_seen": ["middle"]})
    )
    assert [item["id"] for item in result["unread"]] == ["old", "new"]


def test_original_feedback_has_no_edit_endpoint():
    assert not any(
        route.path == "/feedback/{issue_key}" and "PATCH" in route.methods
        for route in router.router.routes
    )


def test_release_feed_groups_only_unseen_commits_above_divider(monkeypatch):
    old_sha, new_sha = "a" * 40, "b" * 40
    commits = {
        old_sha: {
            "sha": old_sha,
            "commit": {
                "message": "Release note: Old change",
                "author": {"date": "2026-09-09"},
            },
        },
        new_sha: {
            "sha": new_sha,
            "commit": {
                "message": "Release note: New thing",
                "author": {"date": "2026-09-10"},
            },
        },
    }

    class GitHub:
        repository = "owner/repo"

        def commits(self, base, head):
            return [commits[new_sha]]

        def recent_commits(self, head):
            return [commits[new_sha], commits[old_sha]]

        def pull_for_commit(self, sha):
            return None

    monkeypatch.setattr(router, "CandidateGitHub", GitHub)
    monkeypatch.setattr(router, "current_revision", lambda: new_sha)
    result = router.release_feed(
        db_session=None,
        current_user=SimpleNamespace(details={"candidate_release_seen": old_sha}),
    )
    assert result["has_unread"] is True
    assert [release["revision"] for release in result["unseen"]] == [new_sha]
    assert [release["revision"] for release in result["previous"]] == [old_sha]

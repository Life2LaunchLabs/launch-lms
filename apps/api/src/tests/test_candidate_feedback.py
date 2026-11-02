import io
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException, UploadFile
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import Headers

from src.db.users import User
from src.db.feedback_outbox import FeedbackListCache, FeedbackSubmission, FeedbackSubmissionFile
from src.services import feedback_outbox

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


@pytest.fixture
def outbox(monkeypatch):
    from src.core.events import database

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine, tables=[User.__table__, FeedbackSubmission.__table__, FeedbackSubmissionFile.__table__, FeedbackListCache.__table__])
    monkeypatch.setattr(database, "engine", engine)
    with Session(engine) as session:
        session.add(User(id=42, user_uuid="user_42", username="tester", email="tester@example.com", first_name="T", last_name="Ester"))
        session.commit()
        yield session


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

    def board_columns(self):
        return [
            {"id": "column-0", "name": "Open", "status_ids": ["1"]},
            {"id": "column-1", "name": "Done", "status_ids": ["5"]},
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
    value = serialize_feedback(
        issue(), {"username": "tester", "intent": "broken"}, FakeJira(), admin=False
    )
    assert value["status"] == "In Review"
    assert value["priority"] == "High"
    assert [entry["message"] for entry in value["entries"]] == [
        "Try it now",
        "It also happens in Firefox",
    ]
    assert value["entries"][-1]["author"] == "You"
    assert value["visible_revision"] == "4:1"
    assert value["intent"] == "broken"


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


def test_feedback_intent_is_saved_as_property_and_jira_label(monkeypatch):
    client = CandidateJira({"LAUNCHLMS_FEEDBACK_JIRA_PROJECT_KEY": "BOT"})
    requests = []

    def request(method, path, payload=None):
        requests.append((method, path, payload))
        if method == "POST" and path == "/rest/api/3/issue":
            return {"key": "BOT-301"}
        if method == "GET" and path.startswith("/rest/api/3/issue/BOT-301?"):
            return issue(["launchlms-feedback", "feedback-intent-stuck"])
        return {}

    monkeypatch.setattr(client, "_request", request)
    client.create_feedback(
        org_id=7,
        user=SimpleNamespace(id=42, user_uuid="uuid", username="tester"),
        message="I cannot continue",
        intent="stuck",
    )
    create_payload = requests[0][2]
    property_payload = requests[1][2]
    assert "feedback-intent-stuck" in create_payload["fields"]["labels"]
    assert property_payload["intent"] == "stuck"


def test_tester_can_reopen_completed_feedback(monkeypatch, outbox):
    class Jira(FakeJira):
        def __init__(self):
            self.actions = []
            self.current_status = "5"

        def issue(self, key):
            value = issue(["launchlms-feedback", "tester-confirmed"])
            value["fields"]["status"] = {
                "id": self.current_status,
                "name": "Done" if self.current_status == "5" else "Open",
                "statusCategory": {
                    "key": "done" if self.current_status == "5" else "new"
                },
            }
            return value

        def property(self, key, property_key):
            return {"org_id": 7, "user_id": 42, "username": "tester"}

        def transitions(self, key):
            return [
                {
                    "id": "11",
                    "name": "Reopen",
                    "to": {"id": "1", "name": "Open", "category": "new"},
                }
            ]

        def board_columns(self):
            raise AssertionError(
                "resolution must not depend on board column names or order"
            )

        def transition(self, key, status_id):
            self.actions.append(("transition", status_id))
            self.current_status = status_id

        def update_fields(self, key, fields):
            self.actions.append(("update", fields))

        def add_tester_comment(self, key, message):
            self.actions.append(("comment", message))

    jira = Jira()
    monkeypatch.setattr(router, "CandidateJira", lambda: jira)
    monkeypatch.setattr(router, "require_org_membership", lambda *_args: None)
    result = router.resolve_feedback(
        "BOT-200",
        router.FeedbackResolution(outcome="still_happening"),
        org_id=7,
        db_session=outbox,
        current_user=SimpleNamespace(id=42),
    )
    assert result["status"] == "Open"
    assert ("transition", "1") in jira.actions
    assert (
        "update",
        {"labels": ["feedback-reopened", "launchlms-feedback"]},
    ) in jira.actions
    assert ("comment", "Still happening after completion.") in jira.actions


def test_tester_confirmation_uses_durable_label_without_a_closed_column(monkeypatch, outbox):
    class Jira(FakeJira):
        def __init__(self):
            self.actions = []

        def issue(self, key):
            value = issue(["feedback-reopened", "launchlms-feedback"])
            value["fields"]["status"] = {
                "id": "5",
                "name": "Ready for verification",
                "statusCategory": {"key": "done"},
            }
            return value

        def property(self, key, property_key):
            return {"org_id": 7, "user_id": 42, "username": "tester"}

        def board_columns(self):
            raise AssertionError("confirmation must not depend on a closed column name")

        def update_fields(self, key, fields):
            self.actions.append(("update", fields))

        def add_tester_comment(self, key, message):
            self.actions.append(("comment", message))

    jira = Jira()
    monkeypatch.setattr(router, "CandidateJira", lambda: jira)
    monkeypatch.setattr(router, "require_org_membership", lambda *_args: None)
    router.resolve_feedback(
        "BOT-200",
        router.FeedbackResolution(outcome="looks_good"),
        org_id=7,
        db_session=outbox,
        current_user=SimpleNamespace(id=42),
    )
    assert (
        "update",
        {"labels": ["launchlms-feedback", "tester-confirmed"]},
    ) in jira.actions
    assert ("comment", "Looks good now.") in jira.actions


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

    items = feedback_outbox.jira_items(Jira(), 7, 42, admin=False)
    current_user = SimpleNamespace(
        id=42, details={"candidate_feedback_seen": {"BOT-200": "4:1"}}
    )
    assert feedback_outbox.with_unread(items, current_user)[0]["has_unread"] is False

    current_user.details["candidate_feedback_seen"]["BOT-200"] = "3:1"
    assert feedback_outbox.with_unread(items, current_user)[0]["has_unread"] is True

    current_user.details["candidate_feedback_seen"] = {}
    assert feedback_outbox.with_unread(items, current_user)[0]["has_unread"] is True
    assert feedback_outbox.jira_items(Jira(), 7, 99, admin=False) == []  # someone else's


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


def _connection_db():
    from sqlalchemy.pool import StaticPool
    from sqlmodel import Session, SQLModel, create_engine

    from src.db.feedback import FeedbackJiraConfiguration

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=[FeedbackJiraConfiguration.__table__])
    return engine, Session(engine)


def test_saved_jira_connection_overrides_environment(monkeypatch):
    from src.core.events import database
    from src.services import feedback_configuration as connection

    monkeypatch.setenv("LAUNCHLMS_FEEDBACK_JIRA_BASE_URL", "https://env.example.com")
    monkeypatch.setenv("LAUNCHLMS_FEEDBACK_JIRA_EMAIL", "env@example.com")
    monkeypatch.setenv("LAUNCHLMS_FEEDBACK_JIRA_API_TOKEN", "env-token")
    monkeypatch.setenv("LAUNCHLMS_FEEDBACK_JIRA_PROJECT_KEY", "ENV")
    engine, db = _connection_db()
    monkeypatch.setattr(database, "engine", engine)

    assert connection.serialize(db)["source"] == "environment"
    assert CandidateJira().project == "ENV"

    # First save without a token keeps the environment token, now encrypted.
    saved = connection.save(
        db,
        connection.FeedbackJiraConfigurationUpdate(
            base_url="https://team.atlassian.net/",
            email="ops@example.com",
            project_key="feed",
        ),
        user_id=None,
    )
    assert saved["source"] == "platform"
    assert saved["has_api_token"] is True
    assert "token" not in saved and "api_token" not in saved
    record = connection.get_record(db)
    assert "env-token" not in (record.api_token_ciphertext or "")

    client = CandidateJira()
    assert client.base_url == "https://team.atlassian.net"
    assert client.project == "FEED"
    assert client.token == "env-token"
    assert client.configured

    connection.save(
        db,
        connection.FeedbackJiraConfigurationUpdate(
            enabled=False,
            base_url="https://team.atlassian.net",
            email="ops@example.com",
            api_token="new-token",
            project_key="FEED",
        ),
        user_id=None,
    )
    disabled = CandidateJira()
    assert disabled.token == "new-token"
    assert not disabled.configured


def test_saved_jira_connection_requires_https():
    import pytest
    from fastapi import HTTPException

    from src.services import feedback_configuration as connection

    _, db = _connection_db()
    with pytest.raises(HTTPException):
        connection.save(
            db,
            connection.FeedbackJiraConfigurationUpdate(base_url="http://jira.local"),
            user_id=None,
        )


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


class OutboxJira(FakeJira):
    """Records what reaches Jira; `down` makes every call fail like an outage."""

    project = "FEED"
    configured = True

    def __init__(self, down=False):
        self.down, self.created, self.comments, self.screenshots, self.searches = down, [], [], [], 0

    def _check(self):
        if self.down:
            raise HTTPException(status_code=502, detail="Jira is unavailable")

    def create_feedback(self, **values):
        self._check()
        self.created.append(values)
        return {"key": f"FEED-{len(self.created)}"}

    def add_comment(self, key, message, internal):
        self._check()
        self.comments.append((key, internal))

    def add_screenshot(self, key, filename, content_type, content):
        self._check()
        self.screenshots.append((key, filename, content_type, len(content)))

    def issue(self, key):
        value = issue()
        value["key"] = key
        return value

    def property(self, key, property_key):
        return {"org_id": 7, "user_id": 42, "username": "tester"}

    def search(self, jql):
        self._check()
        self.searches += 1
        return [self.issue(f"FEED-{index + 1}") for index in range(len(self.created))]


def _upload():
    return UploadFile(io.BytesIO(PNG), filename="shot.png", headers=Headers({"content-type": "image/png"}))


def test_feedback_is_saved_at_once_and_synced_to_jira_in_the_background(monkeypatch, outbox):
    jira = OutboxJira()
    monkeypatch.setattr(feedback_outbox, "CandidateJira", lambda: jira)
    monkeypatch.setattr(feedback_outbox, "validate_image_content", lambda content: True)
    tasks = BackgroundTasks()
    saved = feedback_outbox.submit(outbox, org_id=7, user_id=42, submission_uuid="sub-1", message="Button is gone", intent="broken",
                                   context={"routes": ["/admin"]}, images=[_upload()], background=tasks)
    # Nothing has reached Jira yet: the reply is the saved copy.
    assert saved["key"] == "pending-sub-1" and saved["pending"] and saved["status"] == "Sending" and saved["pending_attachments"] == 1
    assert jira.created == [] and len(tasks.tasks) == 1
    # Sending the same submission again (a retry after a dropped connection) doesn't file it twice.
    assert feedback_outbox.submit(outbox, org_id=7, user_id=42, submission_uuid="sub-1", message="Button is gone", intent="broken",
                                  context={}, images=[], background=BackgroundTasks())["key"] == "pending-sub-1"
    assert len(outbox.exec(select(FeedbackSubmission)).all()) == 1

    assert feedback_outbox.sync(tasks.tasks[0].args[0]) == "FEED-1"
    assert jira.created[0]["intent"] == "broken" and jira.comments == [("FEED-1", True)] and jira.screenshots == [("FEED-1", "shot.png", "image/png", len(PNG))]
    outbox.expire_all()
    row = outbox.exec(select(FeedbackSubmission)).one()
    assert (row.status, row.issue_key) == ("synced", "FEED-1")
    assert outbox.exec(select(FeedbackSubmissionFile)).all() == []  # screenshots are dropped once Jira has them


def test_feedback_waits_out_a_jira_outage_without_filing_twice(monkeypatch, outbox):
    jira = OutboxJira(down=True)
    monkeypatch.setattr(feedback_outbox, "CandidateJira", lambda: jira)
    saved = feedback_outbox.submit(outbox, org_id=7, user_id=42, submission_uuid="sub-2", message="Slow page", intent=None,
                                   context={}, images=[], background=None)
    submission_id = outbox.exec(select(FeedbackSubmission.id)).one()
    assert saved["pending"] and feedback_outbox.sync(submission_id) is None
    outbox.expire_all()
    row = outbox.exec(select(FeedbackSubmission)).one()
    assert row.status == "pending" and row.attempts == 1 and "unavailable" in row.last_error

    # The list still shows it (first), even with no cache and Jira down.
    listed = feedback_outbox.listing(outbox, 7, 42, None)
    assert [item["key"] for item in listed] == ["pending-sub-2"]

    # Jira is back; the issue was created but the comment failed: the retry adds to that issue, not a new one.
    jira.down = False
    original = jira.add_comment
    jira.add_comment = lambda *args, **kwargs: (_ for _ in ()).throw(HTTPException(status_code=502, detail="blip"))
    assert feedback_outbox.sync(submission_id) is None
    jira.add_comment = original
    outbox.expire_all()
    assert len(jira.created) == 1 and outbox.exec(select(FeedbackSubmission)).one().issue_key == "FEED-1"
    # The next retry posts the context it missed and finishes, still on the one issue.
    assert feedback_outbox.sync(submission_id) == "FEED-1" and len(jira.created) == 1 and jira.comments == [("FEED-1", True)]


def test_feedback_list_comes_from_the_cache_and_refreshes_behind_the_scenes(monkeypatch, outbox):
    jira = OutboxJira()
    jira.created.append({})
    monkeypatch.setattr(feedback_outbox, "CandidateJira", lambda: jira)
    # No cache yet: read Jira once and keep it.
    assert [item["key"] for item in feedback_outbox.listing(outbox, 7, 42, BackgroundTasks())] == ["FEED-1"]
    assert jira.searches == 1
    # Fresh cache: no Jira call at all.
    assert [item["key"] for item in feedback_outbox.listing(outbox, 7, 42, BackgroundTasks())] == ["FEED-1"]
    assert jira.searches == 1
    # Stale cache: answered from the cache, with a refresh queued behind it.
    row = outbox.exec(select(FeedbackListCache)).one()
    row.refreshed_at = datetime.utcnow() - timedelta(minutes=5)
    outbox.add(row)
    outbox.commit()
    tasks = BackgroundTasks()
    assert [item["key"] for item in feedback_outbox.listing(outbox, 7, 42, tasks)] == ["FEED-1"]
    assert jira.searches == 1 and tasks.tasks[0].func is feedback_outbox.refresh

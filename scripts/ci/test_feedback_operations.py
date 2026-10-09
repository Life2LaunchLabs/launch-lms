import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from feedback_ops import (
    TRIAGE_PROPERTY,
    already_linked,
    delivery_stage,
    load_policy,
    migrate_legacy,
    reconcile,
    resolve_roles,
    story_description,
    triage,
    validate_delivery_roles,
)
from jira_rest import JiraError, settings


def issue(key="FEED-1", status="To Do", status_id="11", labels=None, links=None):
    return {"key": key, "fields": {
        "summary": "Save is confusing", "description": {},
        "status": {"id": status_id, "name": status}, "priority": {"name": "Medium"},
        "labels": labels or ["launchlms-feedback"], "comment": {"comments": []},
        "attachment": [], "issuelinks": links or [], "created": "2026-09-01", "updated": "2026-09-01",
    }}


POLICY = {
    "tracker": {"feedback_project": "FEED", "delivery_project": "BOT", "link_type": "Relates"},
    "triage": {"decisions": ["candidate"]},
    "workflow": {
        "feedback_status_roles": {"intake": ["Inbox"], "active": ["Being handled"], "ready_to_test": ["Verify"]},
        "delivery_status_roles": {"queued": ["Queued"], "active": ["Building"], "ready_to_test": ["Review", "Shipped"]},
        "decision_targets": {"candidate": "active"},
    },
    "automation": {"completion_message": "Please test it."},
    "resolution": {"confirmed_label": "tester-confirmed", "reopened_label": "feedback-reopened"},
}


class FakeJira:
    def __init__(self, issues=None, properties=None):
        self.issues = {item["key"]: item for item in (issues or [])}
        self.properties = properties or {}
        self.actions = []

    def statuses(self):
        return [{"statuses": [
            {"id": "11", "name": "Inbox"}, {"id": "12", "name": "Being handled"}, {"id": "13", "name": "Verify"},
        ]}]

    def issue(self, key):
        return self.issues[key]

    def search(self, _jql, fields=None):
        return list(self.issues.values())

    def property(self, key, name):
        return self.properties.get((key, name), {})

    def set_property(self, key, name, value):
        self.actions.append(("property", key, name, value)); self.properties[(key, name)] = value

    def update(self, key, fields):
        self.actions.append(("update", key, fields))

    def comment(self, key, text):
        self.actions.append(("comment", key, text))

    def transition(self, key, target):
        self.actions.append(("transition", key, target))

    def link(self, feed_key, bot_key, link_type):
        self.actions.append(("link", feed_key, bot_key, link_type))


class FeedbackOperationsTests(unittest.TestCase):
    def test_feedback_settings_reuse_credentials_but_not_bot_project_identity(self):
        environment = {
            "JIRA_BASE_URL": "https://example.atlassian.net",
            "JIRA_EMAIL": "agent@example.invalid",
            "JIRA_API_TOKEN": "secret",
            "JIRA_PROJECT_KEY": "BOT",
            "JIRA_BOARD_ID": "12",
        }
        with patch.dict("os.environ", environment, clear=True):
            self.assertEqual(settings("BOT")["project"], "BOT")
            feedback = settings("FEED")
        self.assertEqual(feedback["project"], "FEED")
        self.assertEqual(feedback["board_id"], "")
        self.assertEqual(feedback["email"], environment["JIRA_EMAIL"])

    def test_repository_policy_loads_without_third_party_packages(self):
        policy = load_policy(ROOT / "docs/product/feedback-policy.yaml")
        self.assertEqual(policy["schema_version"], 2)
        self.assertEqual(policy["workflow"]["feedback_status_roles"]["active"], ["In Progress"])

    def test_policy_roles_survive_renamed_and_reordered_columns(self):
        roles = resolve_roles(FakeJira(), POLICY["workflow"]["feedback_status_roles"])
        self.assertEqual(roles["active"]["id"], "12")

    def test_role_resolution_rejects_ambiguous_statuses(self):
        jira = FakeJira()
        jira.statuses = lambda: [{"statuses": [{"id": "1", "name": "Inbox"}]}, {"statuses": [{"id": "2", "name": "Inbox"}]}]
        with self.assertRaises(JiraError):
            resolve_roles(jira, POLICY["workflow"]["feedback_status_roles"])

    def test_delivery_status_validation_requires_every_policy_status(self):
        jira = FakeJira()
        jira.statuses = lambda: [{"statuses": [
            {"id": "20", "name": "Queued"}, {"id": "21", "name": "Building"},
            {"id": "22", "name": "Review"}, {"id": "23", "name": "Shipped"},
        ]}]
        roles = validate_delivery_roles(jira, POLICY["workflow"]["delivery_status_roles"])
        self.assertEqual([item["id"] for item in roles["ready_to_test"]], ["22", "23"])
        with self.assertRaises(JiraError):
            validate_delivery_roles(jira, {"ready_to_test": ["Missing"]})

    def test_delivery_stage_waits_for_every_linked_parent(self):
        roles = POLICY["workflow"]["delivery_status_roles"]
        self.assertEqual(delivery_stage(["Review", "Shipped"], roles), "ready_to_test")
        self.assertEqual(delivery_stage(["Queued", "Shipped"], roles), "active")
        self.assertEqual(delivery_stage(["Building", "Shipped"], roles), "active")

    def test_triage_requires_public_note_for_a_transition(self):
        jira = FakeJira([issue()])
        with self.assertRaises(JiraError):
            triage(jira, POLICY, "FEED-1", "save-flow", "Save flow", 4, "candidate", "Common blocker", "", False)

    def test_triage_preserves_multiple_concept_labels(self):
        jira = FakeJira([issue()], {("FEED-1", TRIAGE_PROPERTY): {"evaluations": [
            {"concept": "first", "title": "First", "impact": 2, "decision": "candidate", "rationale": "Existing"},
        ]}})
        triage(jira, POLICY, "FEED-1", "second", "Second", 4, "candidate", "New", "Thanks", True)
        update = next(action for action in jira.actions if action[0] == "update")
        self.assertIn("feedback-concept-first", update[2]["labels"])
        self.assertIn("feedback-concept-second", update[2]["labels"])

    def test_legacy_comments_migrate_to_property_and_native_link(self):
        value = issue()
        value["fields"]["comment"]["comments"] = [
            {"body": "[Launch LMS internal note] Triage: concept=save-flow; impact=4/5; decision=candidate; rationale=Common blocker"},
            {"body": "[Launch LMS internal note] Delivery link: https://example.atlassian.net/browse/BOT-9"},
        ]
        feed = FakeJira([value])
        changes = migrate_legacy(feed, FakeJira(), POLICY, True)
        self.assertEqual(changes[0]["native_links"], ["BOT-9"])
        self.assertTrue(any(action[0] == "property" for action in feed.actions))
        self.assertTrue(any(action[0] == "link" for action in feed.actions))

    def test_plain_bot_mention_is_not_treated_as_native_link(self):
        value = issue()
        value["fields"]["comment"]["comments"] = [
            {"body": "Triage rationale: BOT-248 owns the replacement surface."}
        ]
        self.assertFalse(already_linked(value, "BOT-248"))

    def test_created_work_uses_native_adf_sections(self):
        value = story_description("Outcome text", "Context text", "Build text", ["Owner test"])
        self.assertEqual(value["content"][0]["type"], "heading")
        self.assertEqual(value["content"][-1]["type"], "bulletList")

    def test_ready_to_test_is_idempotent(self):
        link = {"outwardIssue": {"key": "BOT-9"}}
        feed_issue = issue(links=[link])
        feed = FakeJira([feed_issue], {("FEED-1", TRIAGE_PROPERTY): {"notified_stage": "active"}})
        bot = FakeJira([issue("BOT-9", "Review", "21")])
        first = reconcile(feed, bot, POLICY, True)
        self.assertEqual(first[0]["stage"], "ready_to_test")
        self.assertEqual(len([item for item in feed.actions if item[0] == "comment"]), 1)
        feed.issues["FEED-1"]["fields"]["status"] = {"id": "13", "name": "Verify"}
        self.assertEqual(reconcile(feed, bot, POLICY, True), [])

    def test_reopened_feedback_waits_for_delivery_to_leave_review(self):
        link = {"outwardIssue": {"key": "BOT-9"}}
        feed_issue = issue(labels=["launchlms-feedback", "feedback-reopened"], links=[link])
        feed = FakeJira([feed_issue], {("FEED-1", TRIAGE_PROPERTY): {"notified_stage": "ready_to_test"}})
        bot = FakeJira([issue("BOT-9", "Review", "21")])
        self.assertEqual(reconcile(feed, bot, POLICY, True), [])
        bot.issues["BOT-9"]["fields"]["status"] = {"id": "22", "name": "Building"}
        value = reconcile(feed, bot, POLICY, True)
        self.assertTrue(value[0]["reopened_reset"])
        self.assertTrue(any(action[0] == "update" for action in feed.actions))


if __name__ == "__main__":
    unittest.main()

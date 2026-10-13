"""Launch LMS MCP server: badges, ways to earn, collections, organization switching and the no-delete baseline."""

from copy import deepcopy

from sqlmodel import select

from src.db.badge_routes import BadgeRoute
from src.db.learning import LearningBadge, LearningBadgeVersion, LearningPage, LearningPageProgress, LearningRun
from src.db.user_organizations import UserOrganization
from src.tests.test_badge_marketplace import NOW
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)
from src.tests.test_mcp_plan_templates import templates  # noqa: F401  (fixture)


def _badge_document(**credential) -> dict:
    return {
        "badge": {
            "name": "Workplace Communicator",
            "description": "Communicates clearly and professionally at work.",
            "criteria": "Finish every step of the Workplace Communicator plan.",
            "image_url": "https://example.org/badge.png",
            "achievement_type": "Competency",
            **credential,
        },
        "marketing": {
            "subtitle": "Speak up, write well, run a meeting",
            "estimated_time": "~3 hrs",
            "highlights": [{"title": "Clear emails", "body": "Writes concise messages."}, {"title": ""}],
        },
    }


def test_create_badge_writes_editor_fields_and_starts_a_draft(templates):  # noqa: F811
    session, call, _, _ = templates
    created = call("create_badge", {"document": _badge_document()})
    assert not created.get("isError"), created
    result = created["structuredContent"]
    assert "Created badge \"Workplace Communicator\" (not published yet" in created["content"][0]["text"]
    assert result["context"]["working_version"]["state"] == "draft"
    assert result["context"]["next_semantic_versions"] == {"first": "1.0.0"}
    assert result["document"]["marketing"]["highlights"] == [{"title": "Clear emails", "body": "Writes concise messages.", "media_url": "", "image_side": "left"}]
    badge = session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == result["context"]["badge_uuid"])).one()
    metadata = session.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id)).one().definition["badge_metadata"]
    # The admin editor's keys, legacy mirrors included.
    assert metadata["certification_type"] == "mastery" and metadata["badge_criteria_text"] == "Finish every step of the Workplace Communicator plan."
    assert metadata["overview_subtitle"] == "Speak up, write well, run a meeting" and metadata["estimated_time_label"] == "~3 hrs"
    assert result["editor_url"].endswith(f"/admin/badges/badge/{badge.badge_uuid.removeprefix('badge_')}/definition")
    listed = call("list_badges", {"query": "communicator"})["structuredContent"]["badges"]
    assert [(item["name"], item["status"], item["has_unpublished_draft"]) for item in listed] == [("Workplace Communicator", "draft", True)]


def test_validation_reports_errors_and_publish_gaps(templates):  # noqa: F811
    _, call, _, _ = templates
    report = call("validate_badge", {"document": _badge_document(image_url="ftp://nope", achievement_type="Trophy", description="")})["structuredContent"]
    assert not report["valid"] and report["errors"][0]["path"] == "badge.achievement_type"
    report = call("validate_badge", {"document": {**_badge_document(image_url="ftp://nope", description=""), "listing": {"collection_uuid": "badge_collection_missing"}}})["structuredContent"]
    assert {item["path"] for item in report["errors"]} == {"badge.image_url", "listing.collection_uuid"}
    assert {"path": "badge.description", "message": "A description is required before the badge can be published"} in report["warnings"]


def test_route_publish_then_edit_starts_a_new_draft(templates):  # noqa: F811
    session, call, _, template_uuid = templates
    created = call("create_badge", {"document": _badge_document()})["structuredContent"]
    badge_uuid = created["context"]["badge_uuid"]

    routed = call("set_badge_routes", {"badge_uuid": badge_uuid, "routes": [{"template_uuid": template_uuid}]})["structuredContent"]
    assert routed["context"]["routes"] == [{"template_uuid": template_uuid, "name": "Career Ready", "recommended": True, "step_count": 2, "activity_count": 0}]
    template = call("get_plan_template", {"template_uuid": template_uuid})["structuredContent"]
    assert template["context"]["earns_badges"] == [{"badge_uuid": badge_uuid, "name": "Workplace Communicator", "recommended": True}]

    published = call("publish_badge", {"badge_uuid": badge_uuid})
    assert "Published version 1.0.0 of badge" in published["content"][0]["text"]
    live = published["structuredContent"]
    assert live["context"]["status"] == "published" and live["warnings"] == []
    assert live["context"]["working_version"]["is_live"] and not live["context"]["has_unpublished_draft"]
    assert call("publish_badge", {"badge_uuid": badge_uuid})["isError"]  # nothing left to publish

    edited = deepcopy(live["document"])
    edited["badge"]["criteria"] = "Finish the plan and a reviewed mock meeting."
    saved = call("save_badge", {"badge_uuid": badge_uuid, "document": edited, "base_etag": live["etag"]})["structuredContent"]
    assert saved["started_draft"] and saved["context"]["has_unpublished_draft"]
    assert saved["context"]["live_version"]["semantic_version"] == "1.0.0"
    badge = session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == badge_uuid)).one()
    assert badge.criteria == "Finish every step of the Workplace Communicator plan."  # learners still see the live version
    assert call("save_badge", {"badge_uuid": badge_uuid, "document": edited, "base_etag": live["etag"]})["isError"]  # stale etag
    unchanged = call("save_badge", {"badge_uuid": badge_uuid, "document": edited, "base_etag": saved["etag"]})["structuredContent"]
    assert unchanged["changed"] is False

    second = call("publish_badge", {"badge_uuid": badge_uuid, "semantic_version": "2.0.0"})["structuredContent"]
    session.refresh(badge)
    assert second["published_semantic_version"] == "2.0.0" and badge.criteria == "Finish the plan and a reviewed mock meeting."


def test_routes_can_be_added_but_never_removed(templates):  # noqa: F811
    session, call, _, template_uuid = templates
    other = call("create_plan_template", {"document": {"template": {"name": "Fast track"}, "phases": [{"name": "Do it", "objectives": [{"title": "Step"}]}]}})
    other_uuid = other["structuredContent"]["context"]["template_uuid"]
    badge_uuid = call("create_badge", {"document": _badge_document()})["structuredContent"]["context"]["badge_uuid"]
    call("set_badge_routes", {"badge_uuid": badge_uuid, "routes": [{"template_uuid": template_uuid}]})
    both = call("set_badge_routes", {"badge_uuid": badge_uuid, "routes": [{"template_uuid": template_uuid}, {"template_uuid": other_uuid, "recommended": True}]})
    assert [(item["name"], item["recommended"]) for item in both["structuredContent"]["context"]["routes"]] == [("Career Ready", False), ("Fast track", True)]
    refused = call("set_badge_routes", {"badge_uuid": badge_uuid, "routes": [{"template_uuid": other_uuid}]})
    assert refused["isError"] and "only adds routes" in refused["content"][0]["text"]
    assert len(session.exec(select(BadgeRoute)).all()) == 2


def test_collections(templates):  # noqa: F811
    _, call, _, _ = templates
    created = call("save_badge_collection", {"name": "Work Ready", "credibility": "Built with employers", "endorsers": [{"name": "Acme", "url": "https://acme.test"}]})["structuredContent"]["collection"]
    assert created["endorsers"] == [{"name": "Acme", "url": "https://acme.test"}]
    document = {**_badge_document(), "listing": {"collection_uuid": created["collection_uuid"]}}
    badge = call("create_badge", {"document": document})["structuredContent"]
    assert badge["document"]["listing"]["collection_uuid"] == created["collection_uuid"]
    collections = call("list_badge_collections")["structuredContent"]["collections"]
    assert [(item["name"], [b["name"] for b in item["badges"]]) for item in collections] == [("Work Ready", ["Workplace Communicator"])]
    renamed = call("save_badge_collection", {"collection_uuid": created["collection_uuid"], "name": "Work Ready 2"})["structuredContent"]["collection"]
    assert renamed["name"] == "Work Ready 2" and renamed["credibility"] == "Built with employers"


def test_org_switching_is_limited_to_orgs_the_user_administers(templates):  # noqa: F811
    session, call, alice, _ = templates
    orgs = call("list_organizations")["structuredContent"]
    assert orgs["default_org"] == "creator" and [item["slug"] for item in orgs["organizations"]] == ["creator"]
    refused = call("list_plan_templates", {"org": "issuer"})
    assert refused["isError"] and "Organizations you can manage: creator" in refused["content"][0]["text"]

    session.add(UserOrganization(user_id=alice.id, org_id=2, role_id=1, creation_date=NOW, update_date=NOW))
    session.commit()
    assert [item["slug"] for item in call("list_organizations")["structuredContent"]["organizations"]] == ["creator", "issuer"]
    created = call("create_plan_template", {"org": "issuer", "document": {"template": {"name": "Issuer plan"}, "phases": [{"name": "One", "objectives": [{"title": "Step"}]}]}})
    assert "/orgs/issuer/admin/plans/" in created["structuredContent"]["editor_url"]
    assert [item["name"] for item in call("list_plan_templates", {"org": "issuer"})["structuredContent"]["templates"]] == ["Issuer plan"]
    assert "Issuer plan" not in [item["name"] for item in call("list_plan_templates")["structuredContent"]["templates"]]
    # A template in another org reads as not found unless that org is named.
    uuid = created["structuredContent"]["context"]["template_uuid"]
    assert call("get_plan_template", {"template_uuid": uuid})["isError"]
    assert not call("get_plan_template", {"template_uuid": uuid, "org": "issuer"}).get("isError")


def test_save_activity_refuses_to_delete_pages_learners_answered(mcp):  # noqa: F811
    _, session, _, call, alice = mcp
    current = call("get_activity", {"activity_uuid": "learning_activity_draft"})["structuredContent"]
    document = deepcopy(current["document"])
    removed = document["pages"].pop(2)
    document["activity"]["settings"].pop("flow", None)
    for page in document["pages"]:
        for block in page["content"].get("blocks") or []:
            if block.get("type") == "button":
                block["content"].pop("revisit_page_uuid", None)
    page = session.exec(select(LearningPage).where(LearningPage.page_uuid == removed["page_uuid"])).one()
    run = LearningRun(run_uuid="run_1", activity_id=50, org_id=1, plan_id=1, plan_objective_id=1, user_id=alice.id)
    for model in (LearningRun, LearningPageProgress):
        model.__table__.create(session.get_bind(), checkfirst=True)
    session.add(run)
    session.flush()
    session.add(LearningPageProgress(run_id=run.id, page_id=page.id))
    session.commit()
    refused = call("save_activity", {"activity_uuid": "learning_activity_draft", "document": document, "base_etag": current["etag"]})
    assert refused["isError"] and "never deletes learner work" in refused["content"][0]["text"]
    assert session.exec(select(LearningPage).where(LearningPage.page_uuid == removed["page_uuid"])).first() is not None

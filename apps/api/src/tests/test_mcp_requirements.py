"""Launch LMS MCP server: requirement frameworks, objective links and the global library."""

import json
from copy import deepcopy

import pytest

from src.db.requirements import (
    ProgramObjectiveRequirement,
    RequirementAssignmentBatch,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementFramework,
    RequirementFrameworkVersion,
    RequirementNode,
)
from src.tests.test_mcp_plan_templates import templates  # noqa: F401  (fixture)
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)

LEVELS = [
    {"name": "Domain", "code_style": "upper_alpha"},
    {"name": "Standard", "metadata_fields": [{"field_uuid": "hours", "name": "Hours", "required": True}]},
]


def _framework_document(**overrides) -> dict:
    document = {
        "framework": {"name": "WBL Standards", "levels": LEVELS},
        "nodes": [
            {"node_uuid": "new-pro", "title": "Professionalism"},
            {"node_uuid": "new-comm", "parent_node_uuid": "new-pro", "title": "Communicates professionally", "metadata": {"hours": "10"}},
            {"node_uuid": "new-time", "parent_node_uuid": "new-pro", "title": "Manages time", "metadata": {"hours": "5"}},
        ],
    }
    document.update(overrides)
    return document


@pytest.fixture
def world(templates):  # noqa: F811
    session, call, alice, template_uuid = templates
    for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode, ProgramObjectiveRequirement, RequirementAssignmentBatch, RequirementEnrollment, RequirementAttainmentSource):
        model.__table__.create(session.get_bind(), checkfirst=True)
    return session, call, alice, template_uuid


def test_create_framework_numbers_codes_and_replaces_placeholders(world):
    _, call, _, _ = world
    created = call("create_requirement_framework", {"document": _framework_document()})
    assert "Saved requirement framework \"WBL Standards\" version 1 (draft, 3 requirements)" in created["content"][0]["text"]
    nodes = created["structuredContent"]["document"]["nodes"]
    assert [(node["code"], node["title"]) for node in nodes] == [("A", "Professionalism"), ("A.1", "Communicates professionally"), ("A.2", "Manages time")]
    assert all(node["node_uuid"].startswith("requirement_node_") for node in nodes)
    assert nodes[1]["parent_node_uuid"] == nodes[0]["node_uuid"]
    listed = call("list_requirement_frameworks")["structuredContent"]["frameworks"][0]
    assert [(item["code"], item["leaf"]) for item in listed["requirements"]] == [("A", False), ("A.1", True), ("A.2", True)]
    assert listed["editor_url"].endswith(f"/admin/plans/requirements/{listed['framework_uuid']}/details")


def test_validation_reports_paths(world):
    _, call, _, _ = world
    broken = _framework_document()
    broken["nodes"][1]["metadata"] = {}
    broken["nodes"][2]["parent_node_uuid"] = "nope"
    errors = call("validate_requirement_framework", {"document": broken})["structuredContent"]["errors"]
    assert {"path": "nodes[2].parent_node_uuid", "message": "No node in this document has node_uuid nope"} in errors
    broken["nodes"][2]["parent_node_uuid"] = "new-pro"
    errors = call("validate_requirement_framework", {"document": broken})["structuredContent"]["errors"]
    assert errors == [{"path": "nodes[1].metadata", "message": "Fill in the required Standard fields: Hours"}]
    too_deep = _framework_document()
    too_deep["nodes"].append({"title": "Detail", "parent_node_uuid": "new-comm"})
    assert "enough hierarchy levels" in call("validate_requirement_framework", {"document": too_deep})["structuredContent"]["errors"][0]["message"]


def test_link_objectives_and_see_coverage_then_edit_and_publish(world):
    _, call, _, template_uuid = world
    framework = call("create_requirement_framework", {"document": _framework_document()})["structuredContent"]
    framework_uuid = framework["context"]["framework_uuid"]
    domain, communicates, time = framework["document"]["nodes"]
    template = call("get_plan_template", {"template_uuid": template_uuid})["structuredContent"]
    resume, interview = template["document"]["phases"][0]["objectives"]

    linked = call("set_objective_requirements", {"template_uuid": template_uuid, "objective_uuid": interview["objective_uuid"], "node_uuids": [communicates["node_uuid"]]})
    assert linked["structuredContent"]["requirement_mappings"][0]["node_code"] == "A.1"
    assert linked["structuredContent"]["template_etag"] != template["etag"]

    # A template document can link too; linking a grouping node is allowed but flagged.
    document = call("get_plan_template", {"template_uuid": template_uuid})["structuredContent"]["document"]
    document["phases"][0]["objectives"][0]["requirement_node_uuids"] = [domain["node_uuid"]]
    report = call("validate_plan_template", {"template_uuid": template_uuid, "document": document})["structuredContent"]
    assert report["valid"] is True and "Only leaf requirements earn credit" in report["warnings"][0]["message"]

    current = call("get_requirement_framework", {"framework_uuid": framework_uuid})["structuredContent"]
    assert current["context"]["linked_objectives"] == {
        communicates["node_uuid"]: [{"template_uuid": template_uuid, "template_name": "Career Ready", "objective_uuid": interview["objective_uuid"], "objective_title": "Mock interview"}]
    }
    assert [node["code"] for node in current["context"]["unlinked_leaf_nodes"]] == ["A.2"]

    unchanged = call("save_requirement_framework", {"framework_uuid": framework_uuid, "document": current["document"], "base_etag": current["etag"]})
    assert unchanged["structuredContent"]["changed"] is False

    published = call("publish_requirement_framework", {"framework_uuid": framework_uuid})
    assert "Published requirement framework" in published["content"][0]["text"]
    assert published["structuredContent"]["context"]["status"] == "published"

    # Editing a published version starts a new draft; removing a linked node is flagged.
    edited = deepcopy(published["structuredContent"]["document"])
    edited["nodes"] = [node for node in edited["nodes"] if node["node_uuid"] != communicates["node_uuid"]]
    edited["nodes"].append({"parent_node_uuid": domain["node_uuid"], "title": "Collaborates", "metadata": {"hours": "3"}})
    warnings = call("validate_requirement_framework", {"framework_uuid": framework_uuid, "document": edited})["structuredContent"]["warnings"]
    assert "Career Ready: Mock interview" in warnings[0]["message"]
    saved = call("save_requirement_framework", {"framework_uuid": framework_uuid, "document": edited, "base_etag": published["structuredContent"]["etag"]})
    context = saved["structuredContent"]["context"]
    assert (context["version"], context["status"], context["published_version"]) == (2, "draft", 1)
    assert [(node["code"], node["title"]) for node in saved["structuredContent"]["document"]["nodes"]] == [("A", "Professionalism"), ("A.1", "Manages time"), ("A.2", "Collaborates")]

    stale = call("save_requirement_framework", {"framework_uuid": framework_uuid, "document": edited, "base_etag": current["etag"]})
    assert stale["isError"] is True and json.loads(stale["content"][0]["text"])["status"] == 409


def test_library_round_trip_and_owner_only_publishing(world):
    session, call, alice, template_uuid = world
    framework = call("create_requirement_framework", {"document": _framework_document()})["structuredContent"]
    framework_uuid = framework["context"]["framework_uuid"]
    unpublished = call("publish_to_library", {"kind": "requirement_framework", "uuid": framework_uuid})
    assert unpublished["isError"] is True and "Publish a framework version" in unpublished["content"][0]["text"]
    call("publish_requirement_framework", {"framework_uuid": framework_uuid})
    assert call("publish_to_library", {"kind": "requirement_framework", "uuid": framework_uuid})["structuredContent"]["published_to_library"] is True
    assert call("publish_to_library", {"kind": "plan_template", "uuid": template_uuid})["structuredContent"]["published_to_library"] is True

    found = call("search_library", {"kind": "plan_template", "query": "career"})["structuredContent"]["items"]
    assert [item["name"] for item in found] == ["Career Ready"]
    copied = call("copy_from_library", {"kind": "plan_template", "uuid": found[0]["uuid"]})["structuredContent"]
    assert copied["context"]["template_uuid"] != template_uuid and copied["editor_url"].endswith("/objectives")
    frameworks = call("search_library", {"kind": "requirement_framework", "query": "wbl"})["structuredContent"]["items"]
    framework_copy = call("copy_from_library", {"kind": "requirement_framework", "uuid": frameworks[0]["uuid"]})["structuredContent"]
    assert framework_copy["context"]["framework_uuid"] != framework_uuid and len(framework_copy["document"]["nodes"]) == 3
    assert call("search_library", {"kind": "badge"})["isError"] is True


def test_requirement_tools_need_plan_scopes(world):
    session, call, alice, _ = world
    from src.tests.test_mcp import _token

    activities_only = _token(session, alice.id, 1, scope="activities:read")
    blocked = call("list_requirement_frameworks", auth=activities_only)
    assert blocked["isError"] is True and "plans:read" in blocked["content"][0]["text"]
    read_only = _token(session, alice.id, 1, scope="plans:read")
    assert "plans:write" in call("publish_requirement_framework", {"framework_uuid": "x"}, auth=read_only)["content"][0]["text"]

"""The connector's plan template tools on goal templates (ported from test_mcp_plan_templates)."""

import asyncio
from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import GoalTemplate
from src.db.learning import LearningActivity, LearningBadge
from src.services.goals import mcp_library, mcp_templates as tools, templates
from src.services.oauth.server import AccessContext
from src.tests.test_goals import ADMIN, LEARNER, NOW, _session, _user


def _ctx(user_id: int = ADMIN, org_id: int = 1) -> AccessContext:
    return AccessContext(user=_user(user_id), org_id=org_id, scopes={"plans:read", "plans:write"}, client_id="lmc_test", client_name="Claude")


def call(db, handler, args=None, ctx=None):
    return asyncio.run(handler(None, db, ctx or _ctx(), args or {}))


def _career(db) -> str:
    created = templates.create_template(db, _user(ADMIN), 1, {
        "template": {"title": "Career Ready", "description": "Get ready"},
        "stages": [{"key": "explore", "title": "Explore", "duration_weeks": 4, "steps": [
            {"key": "resume", "type": "upload", "title": "Draft a resume", "config": {"slots": [{"key": "resume", "label": "Resume", "kinds": ["document"]}]}},
            {"key": "interview", "type": "task", "title": "Mock interview", "completed_by": "staff", "due_week": 3},
        ]}],
    })
    return created["template_uuid"]


def test_list_and_schema_use_the_goal_document():
    with _session() as db:
        uuid = _career(db)
        listed = call(db, tools.list_plan_templates, {"query": "career"})["templates"]
        assert [(item["title"], item["stage_count"], item["step_count"]) for item in listed] == [("Career Ready", 1, 2)]
        assert listed[0]["editor_url"].endswith(f"/admin/plans/{uuid}")
        schema = call(db, tools.get_plan_template_schema)
        assert schema["format_version"] == "launch-lms.goal-template/1"
        assert "## Step types" in schema["guide"] and "TemplateStep" in schema["schema"]["$defs"]


def test_read_edit_and_save_round_trip_with_etags():
    with _session() as db:
        uuid = _career(db)
        current = call(db, tools.get_plan_template, {"template_uuid": uuid})
        document = current["document"]
        assert [step["type"] for step in document["stages"][0]["steps"]] == ["upload", "task"]
        assert current["context"]["versioning"]["published_version"] is None and current["context"]["versioning"]["has_unpublished_changes"]

        unchanged = call(db, tools.save_plan_template, {"template_uuid": uuid, "document": document, "base_etag": current["etag"]})
        assert unchanged["changed"] is False and unchanged["etag"] == current["etag"]
        assert tools.summary("save_plan_template", {**unchanged, "editor_url": "x"}).startswith("No changes to plan template")

        edited = deepcopy(document)
        explore = edited["stages"][0]
        interview = explore["steps"].pop(1)
        interview["due_week"] = None
        explore["steps"][0]["review_required"] = True
        edited["stages"].insert(0, {"title": "Launch", "timing": "First week", "steps": [
            interview, {"type": "write", "title": "Set a goal", "config": {"prompt": "What do you want next?"}},
        ]})
        edited["template"]["instructions"] = "Meet weekly."
        assert call(db, tools.validate_plan_template, {"template_uuid": uuid, "document": edited}) == {"valid": True, "errors": [], "warnings": []}
        saved = call(db, tools.save_plan_template, {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})
        assert saved["changed"] is True
        assert "Saved plan template \"Career Ready\" (2 stages, 3 steps)" in tools.summary("save_plan_template", saved)
        result = saved["document"]
        assert [stage["title"] for stage in result["stages"]] == ["Launch", "Explore"]
        assert result["stages"][0]["steps"][1]["key"].startswith("step_") and result["stages"][1]["steps"][0]["review_required"] is True

        with pytest.raises(HTTPException) as stale:
            call(db, tools.save_plan_template, {"template_uuid": uuid, "document": edited, "base_etag": current["etag"]})
        assert stale.value.status_code == 409 and stale.value.detail["current"]["etag"] == saved["etag"]


def test_validation_reports_every_error_with_paths_and_warns_about_removals():
    with _session() as db:
        uuid = _career(db)
        current = call(db, tools.get_plan_template, {"template_uuid": uuid})
        broken = deepcopy(current["document"])
        steps = broken["stages"][0]["steps"]
        steps[0]["config"] = {"slots": []}
        steps[1]["due_week"] = 9
        steps.append({"type": "badge", "title": "Earn it", "config": {"badge_uuid": "badge_missing"}, "after": ["nope"]})
        steps.append({"type": "task", "title": "Meet", "completed_by": "staff", "review_required": True})
        report = call(db, tools.validate_plan_template, {"template_uuid": uuid, "document": broken})
        assert report["valid"] is False
        assert {error["path"] for error in report["errors"]} >= {
            "stages[0].steps[0].config", "stages[0].steps[1].due_week", "stages[0].steps[2].config",
            "stages[0].steps[2].after", "stages[0].steps[3].review_required",
        }
        schema_error = deepcopy(current["document"])
        schema_error["stages"][0]["steps"][0]["essay"] = True
        assert call(db, tools.validate_plan_template, {"document": schema_error})["errors"][0]["path"] == "stages[0].steps[0].essay"
        unknown_type = deepcopy(current["document"])
        unknown_type["stages"][0]["steps"][0]["type"] = "quiz"
        assert call(db, tools.validate_plan_template, {"document": unknown_type})["errors"][0]["path"] == "stages[0].steps[0].type"

        reshaped = deepcopy(current["document"])
        reshaped["stages"] = [{"title": "Launch", "steps": reshaped["stages"][0]["steps"][:1]}]
        report = call(db, tools.validate_plan_template, {"template_uuid": uuid, "document": reshaped})
        assert report["valid"] and {item["message"] for item in report["warnings"]} == {
            'Removes stage "Explore"', 'Removes step "Mock interview"; goals already issued keep it',
        }
        with pytest.raises(HTTPException) as refused:
            call(db, tools.save_plan_template, {"template_uuid": uuid, "document": broken, "base_etag": current["etag"]})
        assert refused.value.status_code == 422 and refused.value.detail["errors"]
        saved = call(db, tools.save_plan_template, {"template_uuid": uuid, "document": reshaped, "base_etag": current["etag"]})
        assert "Warning at stages: Removes step" in tools.summary("save_plan_template", saved)


def test_create_copies_a_document_with_badge_and_new_activity_steps():
    with _session() as db:
        db.add(LearningBadge(id=1, org_id=1, badge_uuid="badge_1", name="Explorer", creation_date=NOW, update_date=NOW))
        db.commit()
        uuid = _career(db)
        document = call(db, tools.get_plan_template, {"template_uuid": uuid})["document"]
        document["template"]["title"] = "Career Ready (Spring)"
        document["stages"][0]["steps"] += [
            {"type": "badge", "title": "Explorer badge", "config": {"badge_uuid": "badge_1"}},
            {"type": "activity", "title": "Spot the change", "after": ["resume"]},
        ]
        created = call(db, tools.create_plan_template, {"document": document})
        assert created["context"]["template_uuid"] != uuid and created["changed"] is True
        steps = created["document"]["stages"][0]["steps"]
        assert [step["type"] for step in steps] == ["upload", "task", "badge", "activity"]
        assert steps[3]["config"]["activity_uuid"].startswith("learning_activity_") and steps[3]["after"] == ["resume"]

        listed = call(db, tools.list_activities, {"template_uuid": created["context"]["template_uuid"]})["activities"]
        assert [(item["title"], item["step_key"], item["page_count"]) for item in listed] == [("Spot the change", steps[3]["key"], 0)]

        # A copy's activity steps get their own activities, never the source's.
        again = call(db, tools.create_plan_template, {"document": created["document"]})
        assert again["document"]["stages"][0]["steps"][3]["config"]["activity_uuid"] != steps[3]["config"]["activity_uuid"]

        bumped = call(db, tools.update_template_badge_versions, {"template_uuid": created["context"]["template_uuid"], "accept_previous_major_versions": True})
        assert bumped["changed"] and bumped["document"]["stages"][0]["steps"][2]["config"]["accept_previous_major_versions"] is True


def test_other_organizations_and_non_admins_are_refused():
    with _session() as db:
        uuid = _career(db)
        with pytest.raises(HTTPException) as other_org:
            call(db, tools.get_plan_template, {"template_uuid": uuid}, ctx=_ctx(ADMIN, 2))
        assert other_org.value.status_code in {403, 404}
        with pytest.raises(HTTPException):
            call(db, tools.get_plan_template, {"template_uuid": uuid}, ctx=_ctx(LEARNER))


def test_publish_list_and_roll_back_versions():
    with _session() as db:
        uuid = _career(db)
        first = call(db, tools.publish_plan_template, {"template_uuid": uuid, "note": "Launch"})
        assert first["published"]["number"] == 1 and not first["has_unpublished_changes"]
        with pytest.raises(HTTPException) as nothing:
            call(db, tools.publish_plan_template, {"template_uuid": uuid})
        assert nothing.value.status_code == 409

        current = call(db, tools.get_plan_template, {"template_uuid": uuid})
        document = deepcopy(current["document"])
        document["stages"][0]["steps"].append({"type": "write", "title": "Reflect"})
        saved = call(db, tools.save_plan_template, {"template_uuid": uuid, "document": document, "base_etag": current["etag"]})
        assert saved["context"]["versioning"]["has_unpublished_changes"]
        second = call(db, tools.publish_plan_template, {"template_uuid": uuid, "note": "Add reflection"})
        assert [(item["number"], item["step_count"], item["is_published"]) for item in second["versions"]] == [(2, 3, True), (1, 2, False)]

        rolled = call(db, tools.restore_plan_template_version, {"template_uuid": uuid, "number": 1})
        assert (rolled["published"]["number"], rolled["published"]["restored_from_number"], rolled["published"]["step_count"]) == (3, 1, 2)
        with pytest.raises(HTTPException):
            call(db, tools.restore_plan_template_version, {"template_uuid": uuid, "number": 3})
        assert [item["number"] for item in call(db, tools.list_plan_template_versions, {"template_uuid": uuid})["versions"]] == [3, 2, 1]


def test_set_objective_requirements_sets_a_steps_links_by_key_or_objective_uuid():
    from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode

    with _session() as db:
        for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode):
            model.__table__.create(db.get_bind(), checkfirst=True)
        db.add(RequirementFramework(id=1, framework_uuid="framework_1", org_id=1, name="Readiness", creation_date=NOW, update_date=NOW))
        db.add(RequirementFrameworkVersion(id=1, version_uuid="fv_1", framework_id=1, version_number=1, creation_date=NOW, update_date=NOW))
        db.add(RequirementNode(node_version_uuid="nv_1", node_uuid="node_resume", version_id=1, title="Has a resume", creation_date=NOW, update_date=NOW))
        db.commit()
        uuid = _career(db)
        linked = call(db, tools.set_objective_requirements, {"template_uuid": uuid, "objective_uuid": "resume", "node_uuids": ["node_resume"]})
        assert linked["step_key"] == "resume" and [link["node_uuid"] for link in linked["requirement_links"]] == ["node_resume"]
        template = templates.template_or_404(db, 1, uuid)
        assert template.document["stages"][0]["steps"][0]["requirement_node_uuids"] == ["node_resume"]
        assert linked["template_etag"] == templates.etag(template)
        with pytest.raises(HTTPException) as unknown:
            call(db, tools.set_objective_requirements, {"template_uuid": uuid, "step_key": "resume", "node_uuids": ["node_other"]})
        assert unknown.value.status_code == 422
        with pytest.raises(HTTPException):
            call(db, tools.set_objective_requirements, {"template_uuid": uuid, "step_key": "nope", "node_uuids": []})


def test_library_publish_search_and_copy_make_independent_templates():
    from src.tests.test_goal_templates_extra import _marketplace_tables

    with _session() as db:
        _marketplace_tables(db)
        uuid = _career(db)
        template = templates.template_or_404(db, 1, uuid)
        document = deepcopy(template.document)
        document["stages"][0]["steps"].append({"type": "activity", "title": "Quiz"})
        templates.save_template(db, _user(ADMIN), 1, uuid, document)
        assert call(db, mcp_library.publish_to_library, {"kind": "plan_template", "uuid": uuid})["published_to_library"]
        found = call(db, mcp_library.search_library, {"kind": "plan_template", "query": "career"})["items"]
        assert [(item["uuid"], item["step_count"]) for item in found] == [(uuid, 3)]

        copied = call(db, mcp_library.copy_from_library, {"kind": "plan_template", "uuid": uuid})
        new_uuid = copied["context"]["template_uuid"]
        assert new_uuid != uuid and copied["kind"] == "plan_template"
        copy = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == new_uuid)).one()
        assert copy.source_template_uuid == uuid
        activity_uuid = copy.document["stages"][0]["steps"][2]["config"]["activity_uuid"]
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == activity_uuid)).one()
        assert activity.goal_template_id == copy.id and activity.frozen_from_id is None
        with pytest.raises(HTTPException):
            call(db, mcp_library.search_library, {"kind": "course"})

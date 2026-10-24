"""Activity Document v1: lossless export, validated saves, concurrency and editor access."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.goals import GoalAssignment, GoalTemplate, GoalTemplateVersion
from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.db.learning_previews import LearningActivityPreview
from src.services.learning_documents import store
from src.services.learning_documents.document import prepare_document
from src.services.learning_documents.models import (
    ActivityDocument,
    ActivityDocumentSave,
    activity_document_json_schema,
)
from src.services.learning_documents.references import rewrite_page_references
from src.tests.plan_world import NOW, _create_tables, _request, _setup

P1, P2, P3 = (f"learning_page_0000000{n}-0000-4000-8000-000000000000" for n in (1, 2, 3))


def _text(block_id: str, text: str) -> dict:
    return {"id": block_id, "type": "text", "content": {"nodes": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}}


def _choice_page() -> dict:
    return {
        "version": 2,
        "blocks": [
            _text("blk_intro001", "What do you enjoy?"),
            {
                "id": "blk_choice01",
                "type": "question",
                "kind": "multiple_choice",
                "content": {"options": [{"id": "opt_make", "text": "Making"}, {"id": "opt_help", "text": "Helping"}]},
                "scoring": {"mode": "off", "points": 0, "correct_option_ids": []},
                "completion": {"min_selections": 1, "max_selections": 1, "question_mode": "variable"},
            },
        ],
    }


def _flow(made: str = P2, other: str = P3, entry: str = P1) -> dict:
    return {
        "version": 1,
        "entry": f"page:{entry}",
        "nodes": [
            {"id": f"page:{entry}", "type": "page", "page_uuid": entry},
            {"id": f"page:{made}", "type": "page", "page_uuid": made},
            {"id": f"page:{other}", "type": "page", "page_uuid": other},
            {"id": "complete", "type": "complete"},
        ],
        "edges": [
            {"from": f"page:{entry}", "to": f"page:{made}", "priority": 10, "condition": {"op": "contains", "left": {"source": "answer", "key": f"{entry}.result.option_ids"}, "right": "opt_make"}},
            {"from": f"page:{entry}", "to": f"page:{other}", "priority": 0},
            {"from": f"page:{made}", "to": "complete", "priority": 0},
            {"from": f"page:{other}", "to": "complete", "priority": 0},
        ],
    }


def _goal_template(session: Session, template_id: int, template_uuid: str, org_id: int, title: str, activity_id: int, activity_uuid: str, step_key: str,
                   system_type: str | None = None) -> None:
    """The goal template an activity belongs to, with the activity as its one step."""
    for model in (GoalTemplate, GoalTemplateVersion, GoalAssignment):
        model.__table__.create(session.get_bind(), checkfirst=True)
    session.add(GoalTemplate(id=template_id, template_uuid=template_uuid, org_id=org_id, title=title, system_type=system_type, document={
        "format": "launch-lms.goal-template", "format_version": 1, "template": {"title": title},
        "stages": [{"key": f"stage_{template_id}", "title": "Explore", "steps": [{"key": step_key, "type": "activity", "title": "Career interests", "config": {"activity_uuid": activity_uuid}}]}],
    }))
    session.flush()
    session.get(LearningActivity, activity_id).goal_template_id = template_id
    session.commit()


def _world(system_type: str | None = None):
    """Org 1's goal template "Career Ready" with one activity step whose activity has three branching pages."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    LearningActivityPreview.__table__.create(engine)
    session = Session(engine)
    _, _, alice, bob, carol, badge = _setup(session)
    session.add(LearningActivity(
        id=50, activity_uuid="learning_activity_draft", org_id=1,
        title="Career interests", settings={"flow": _flow(), "grading": {"minimum_score_percent": 60}},
        creation_date=NOW, update_date=NOW,
    ))
    for order, (page_uuid, content) in enumerate(
        [(P1, _choice_page()), (P2, {"version": 2, "blocks": [_text("blk_made0001", "Makers make.")]}), (P3, {"version": 2, "blocks": [_text("blk_help0001", "Helpers help."), {"id": "blk_back0001", "type": "button", "content": {"label": "Back", "action": "revisit", "revisit_page_uuid": P1}}]})],
        start=1,
    ):
        session.add(LearningPage(
            activity_id=50, org_id=1, page_type=LearningPageType.STANDARD,
            title=f"Page {order}", order=order, content=content,
            page_uuid=page_uuid, creation_date=NOW, update_date=NOW,
        ))
    session.commit()
    _goal_template(session, 50, "goal_template_career", 1, "Career Ready", 50, "learning_activity_draft", "career_interests", system_type)
    return session, alice, carol


async def _read(session, alice) -> dict:
    return await store.get_activity_document(_request(), "learning_activity_draft", alice, session)


async def test_export_round_trips_losslessly_with_template_context():
    session, alice, _ = _world()
    first = await _read(session, alice)
    document = first["document"]
    assert first["context"] == {
        "activity_uuid": "learning_activity_draft", "org_id": 1, "template_uuid": "goal_template_career", "template_name": "Career Ready",
    }
    assert document["activity"]["settings"] == {"flow": _flow(), "grading": {"minimum_score_percent": 60}}
    assert "required" not in document["activity"]
    ActivityDocument.model_validate(document)

    saved = await store.save_activity_document(
        _request(), "learning_activity_draft", ActivityDocumentSave(document=document, base_etag=first["etag"]), alice, session
    )
    assert saved["document"] == document
    assert saved["etag"] == first["etag"]
    pages = session.exec(select(LearningPage).where(LearningPage.activity_id == 50).order_by(LearningPage.order)).all()
    assert [page.page_uuid for page in pages] == [P1, P2, P3]


async def test_new_pages_use_placeholders_that_resolve_everywhere():
    session, alice, _ = _world()
    current = await _read(session, alice)
    document = deepcopy(current["document"])
    document["pages"].insert(1, {"page_uuid": "new-unsure", "title": "Not sure yet", "content": {"version": 2, "blocks": [_text("blk_unsure01", "That's fine!")]}})
    flow = document["activity"]["settings"]["flow"]
    flow["nodes"].insert(1, {"id": "page:new-unsure", "type": "page", "page_uuid": "new-unsure"})
    flow["edges"][0]["to"] = "page:new-unsure"
    flow["edges"].insert(1, {"from": "page:new-unsure", "to": f"page:{P2}", "priority": 0})
    document["pages"][2]["content"]["blocks"].append({"id": "blk_again001", "type": "button", "content": {"label": "Not sure after all", "action": "revisit", "revisit_page_uuid": "new-unsure"}})

    saved = await store.save_activity_document(
        _request(), "learning_activity_draft", ActivityDocumentSave(document=document, base_etag=current["etag"]), alice, session
    )
    pages = saved["document"]["pages"]
    new_uuid = pages[1]["page_uuid"]
    assert new_uuid.startswith("learning_page_") and [page["title"] for page in pages][:2] == ["Page 1", "Not sure yet"]
    saved_flow = saved["document"]["activity"]["settings"]["flow"]
    assert {"id": f"page:{new_uuid}", "type": "page", "page_uuid": new_uuid} in saved_flow["nodes"]
    assert saved_flow["edges"][0]["to"] == f"page:{new_uuid}"
    assert pages[2]["content"]["blocks"][-1]["content"]["revisit_page_uuid"] == new_uuid
    assert "new-unsure" not in str(saved["document"])


async def test_stale_etag_returns_current_document():
    session, alice, _ = _world()
    current = await _read(session, alice)
    edited = deepcopy(current["document"])
    edited["activity"]["title"] = "Someone else"
    await store.save_activity_document(_request(), "learning_activity_draft", ActivityDocumentSave(document=edited, base_etag=current["etag"]), alice, session)

    mine = deepcopy(current["document"])
    mine["activity"]["description"] = "Mine"
    with pytest.raises(HTTPException) as exc:
        await store.save_activity_document(_request(), "learning_activity_draft", ActivityDocumentSave(document=mine, base_etag=current["etag"]), alice, session)
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "stale_document"
    assert exc.value.detail["current"]["document"]["activity"]["title"] == "Someone else"


async def test_invalid_documents_report_every_problem_with_a_path():
    session, alice, _ = _world()
    current = await _read(session, alice)
    document = deepcopy(current["document"])
    document["pages"][1]["content"]["blocks"].append(_text("blk_made0001", "duplicate id"))
    document["pages"][2]["content"]["blocks"][1]["content"]["revisit_page_uuid"] = "nowhere"
    document["pages"].append({"page_uuid": "new-orphan", "title": "Orphan", "content": {"version": 2, "blocks": []}})
    with pytest.raises(HTTPException) as exc:
        await store.save_activity_document(_request(), "learning_activity_draft", ActivityDocumentSave(document=document, base_etag=current["etag"]), alice, session)
    paths = {error["path"] for error in exc.value.detail["errors"]}
    assert {"pages[1].content", "pages[2].content", "activity.settings.flow"} <= paths
    assert len(session.exec(select(LearningPage).where(LearningPage.activity_id == 50)).all()) == 3


def test_schema_errors_and_foreign_page_uuids_are_rejected():
    missing = prepare_document({"format": "launch-lms.activity", "format_version": 1, "activity": {"title": ""}, "pages": []}, existing_page_uuids=set(), allow_system_blocks=False)
    assert {issue.path for issue in missing.errors} >= {"activity.title", "pages"}
    foreign = prepare_document(
        {"activity": {"title": "A"}, "pages": [{"page_uuid": "learning_page_ffffffff-0000-4000-8000-000000000000", "title": "x", "content": {"version": 2, "blocks": []}}]},
        existing_page_uuids=set(),
        allow_system_blocks=False,
    )
    assert foreign.errors[0].path == "pages[0].page_uuid"


async def test_only_org_admins_can_read_or_save():
    session, alice, carol = _world()
    current = await _read(session, alice)
    with pytest.raises(HTTPException) as forbidden:
        await store.get_activity_document(_request(), "learning_activity_draft", carol, session)
    assert forbidden.value.status_code in {401, 403}
    with pytest.raises(HTTPException) as blocked:
        await store.save_activity_document(_request(), "learning_activity_draft", ActivityDocumentSave(document=current["document"], base_etag=current["etag"]), carol, session)
    assert blocked.value.status_code in {401, 403}


def test_activity_level_required_is_not_part_of_the_document():
    document = {"activity": {"title": "A", "required": True}, "pages": [{"page_uuid": "p", "title": "P", "required": False, "content": {"version": 2, "blocks": []}}]}
    prepared = prepare_document(document, existing_page_uuids=set(), allow_system_blocks=False)
    assert not prepared.ok and any(issue.path.startswith("activity") for issue in prepared.errors)
    del document["activity"]["required"]
    assert prepare_document(document, existing_page_uuids=set(), allow_system_blocks=False).ok


@pytest.mark.parametrize(("system_type", "allowed"), [(None, False), ("starter", True)])
async def test_portfolio_previews_are_limited_to_system_templates(system_type, allowed):
    session, alice, _ = _world(system_type)
    document = deepcopy((await _read(session, alice))["document"])
    document["pages"][1]["content"]["blocks"].append({"id": "blk_preview1", "type": "portfolio_preview", "content": {"variant": "timeline_card", "bindings": {}}})
    report = await store.validate_activity_document(_request(), document, alice, session, activity_uuid="learning_activity_draft")
    assert report["valid"] is allowed, report
    if not allowed:
        assert report["errors"][0]["path"] == "pages[1].content"


def test_scored_choice_without_correct_options_warns():
    document = {"activity": {"title": "A"}, "pages": [{"page_uuid": "p", "title": "Q", "content": {"version": 2, "blocks": [{"id": "blk_q", "type": "question", "kind": "multiple_choice", "content": {"options": [{"id": "a", "text": "A"}]}, "scoring": {"mode": "points", "points": 1}}]}}]}
    prepared = prepare_document(document, existing_page_uuids=set(), allow_system_blocks=False)
    assert prepared.ok and "cannot earn" in prepared.warnings[0].message


def test_reference_rewrite_handles_prefixed_and_dotted_forms():
    value = {"a": "old", "b": "page:old", "c": "old.result.option_ids", "d": "answer:old.result.text", "e": "bold", "f": "old-ish", "g": "see old."}
    assert rewrite_page_references(value, {"old": "new"}) == {"a": "new", "b": "page:new", "c": "new.result.option_ids", "d": "answer:new.result.text", "e": "bold", "f": "old-ish", "g": "see old."}


def test_published_schema_describes_blocks_and_flow():
    schema = activity_document_json_schema()
    assert {"$ref": "#/$defs/StandardPageContent"} in schema["$defs"]["ActivityDocumentPage"]["properties"]["content"]["anyOf"]
    assert "QuestionBlock" in schema["$defs"] and "Flow" in schema["$defs"]


def test_design_language_fields_validate():
    question = {"id": "blk_q", "type": "question", "kind": "multiple_choice", "design": {"style": "cards", "entrance": "fade"},
                "content": {"options": [{"id": "a", "text": "Calm", "icon": "🌊", "description": "Slow and steady"}]}}
    footer = {"id": "blk_skip", "type": "button", "design": {"placement": "footer"}, "content": {"label": "Skip", "action": "continue"}}
    page = {"page_uuid": "p", "title": "Q", "design": {"background": {"color": "#0f172a", "scene": "starfield"}, "celebrate": True, "auto_advance_ms": 5000},
            "content": {"version": 2, "blocks": [question, footer]}}
    document = {"activity": {"title": "A", "settings": {"design": {"progress": "segments", "exit": {"label": "Later"}}}}, "pages": [page]}
    assert prepare_document(document, existing_page_uuids=set(), allow_system_blocks=False).ok
    question["design"]["style"] = "carousel"
    bad = prepare_document(document, existing_page_uuids=set(), allow_system_blocks=False)
    assert not bad.ok and "design.style" in bad.errors[0].message

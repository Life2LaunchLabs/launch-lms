"""Activity Document v1: lossless export, validated saves, concurrency and draft locking."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.learning import (
    LearningActivity,
    LearningBadgeVersion,
    LearningPage,
    LearningPageType,
    LearningPath,
)
from src.db.learning_previews import LearningActivityPreview
from src.services.learning import _clone_version_graph
from src.services.learning_documents import store
from src.services.learning_documents.document import prepare_document
from src.services.learning_documents.models import (
    ActivityDocument,
    ActivityDocumentCreate,
    ActivityDocumentSave,
    activity_document_json_schema,
)
from src.services.learning_documents.references import rewrite_page_references
from src.tests.test_badge_marketplace import NOW, _create_tables, _request, _setup

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


def _world(state: str = "draft"):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _create_tables(engine)
    LearningActivityPreview.__table__.create(engine)
    session = Session(engine)
    _, _, alice, bob, carol, badge = _setup(session)
    draft = LearningBadgeVersion(
        id=50, version_uuid="badge_version_draft", badge_id=badge.id, org_id=1, state=state,
        title="Next", definition={}, revision=3, creation_date=NOW, update_date=NOW,
    )
    session.add(draft)
    session.add(LearningPath(id=50, path_uuid="path_draft", badge_id=badge.id, version_id=50, org_id=1, title="Path", creation_date=NOW, update_date=NOW))
    session.add(LearningActivity(
        id=50, activity_uuid="learning_activity_draft", path_id=50, badge_id=badge.id, version_id=50, org_id=1,
        title="Career interests", settings={"flow": _flow(), "grading": {"minimum_score_percent": 60}, "system_required": True},
        creation_date=NOW, update_date=NOW,
    ))
    for order, (page_uuid, content) in enumerate(
        [(P1, _choice_page()), (P2, {"version": 2, "blocks": [_text("blk_made0001", "Makers make.")]}), (P3, {"version": 2, "blocks": [_text("blk_help0001", "Helpers help."), {"id": "blk_back0001", "type": "button", "content": {"label": "Back", "action": "revisit", "revisit_page_uuid": P1}}]})],
        start=1,
    ):
        session.add(LearningPage(
            activity_id=50, badge_id=badge.id, version_id=50, org_id=1, page_type=LearningPageType.STANDARD,
            title=f"Page {order}", order=order, content={**content, "version_lineage_uuid": f"lineage_{order}"},
            page_uuid=page_uuid, creation_date=NOW, update_date=NOW,
        ))
    session.commit()
    return session, alice, carol


async def _read(session, alice) -> dict:
    return await store.get_activity_document(_request(), "learning_activity_draft", alice, session)


async def test_export_hides_platform_keys_and_round_trips_losslessly():
    session, alice, _ = _world()
    first = await _read(session, alice)
    document = first["document"]
    assert "system_required" not in document["activity"]["settings"]
    assert all("version_lineage_uuid" not in page["content"] for page in document["pages"])
    assert first["context"]["editable"] is True and first["context"]["version_uuid"] == "badge_version_draft"
    ActivityDocument.model_validate(document)

    saved = await store.save_activity_document(
        _request(), "learning_activity_draft", ActivityDocumentSave(document=document, base_etag=first["etag"]), alice, session
    )
    assert saved["document"] == document
    assert saved["etag"] == first["etag"]
    activity = session.get(LearningActivity, 50)
    assert activity.settings["system_required"] is True
    pages = session.exec(select(LearningPage).where(LearningPage.activity_id == 50).order_by(LearningPage.order)).all()
    assert [page.content["version_lineage_uuid"] for page in pages] == ["lineage_1", "lineage_2", "lineage_3"]
    assert session.get(LearningBadgeVersion, 50).revision == 4


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
    assert session.get(LearningBadgeVersion, 50).revision == 3


def test_schema_errors_and_foreign_page_uuids_are_rejected():
    missing = prepare_document({"format": "launch-lms.activity", "format_version": 1, "activity": {"title": ""}, "pages": []}, existing_page_uuids=set(), allow_system_blocks=False)
    assert {issue.path for issue in missing.errors} >= {"activity.title", "pages"}
    foreign = prepare_document(
        {"activity": {"title": "A"}, "pages": [{"page_uuid": "learning_page_ffffffff-0000-4000-8000-000000000000", "title": "x", "content": {"version": 2, "blocks": []}}]},
        existing_page_uuids=set(),
        allow_system_blocks=False,
    )
    assert foreign.errors[0].path == "pages[0].page_uuid"


async def test_published_versions_and_non_admins_cannot_save():
    session, alice, carol = _world(state="published")
    current = await _read(session, alice)
    assert current["context"]["editable"] is False
    with pytest.raises(HTTPException) as locked:
        await store.save_activity_document(_request(), "learning_activity_draft", ActivityDocumentSave(document=current["document"], base_etag=current["etag"]), alice, session)
    assert locked.value.status_code == 409
    with pytest.raises(HTTPException) as forbidden:
        await store.get_activity_document(_request(), "learning_activity_draft", carol, session)
    assert forbidden.value.status_code in {401, 403}


async def test_create_adds_activity_to_newest_draft():
    session, alice, _ = _world()
    created = await store.create_activity_from_document(
        _request(),
        ActivityDocumentCreate(badge_uuid="badge_1", document={"activity": {"title": "Reflection"}, "pages": [{"page_uuid": "intro", "title": "Intro", "content": {"version": 2, "blocks": [_text("blk_x0000001", "Hi")]}}]}),
        alice,
        session,
    )
    assert created["context"]["version_uuid"] == "badge_version_draft"
    activity = session.exec(select(LearningActivity).where(LearningActivity.activity_uuid == created["context"]["activity_uuid"])).one()
    assert activity.order == 2 and activity.published is False

    current = await _read(session, alice)
    copied = await store.create_activity_from_document(_request(), ActivityDocumentCreate(badge_uuid="badge_1", document=current["document"]), alice, session)
    copy_pages = copied["document"]["pages"]
    assert {page["page_uuid"] for page in copy_pages}.isdisjoint({P1, P2, P3})
    flow = copied["document"]["activity"]["settings"]["flow"]
    assert flow["edges"][0]["condition"]["left"]["key"] == f"{copy_pages[0]['page_uuid']}.result.option_ids"


def test_scored_choice_without_correct_options_warns():
    document = {"activity": {"title": "A"}, "pages": [{"page_uuid": "p", "title": "Q", "content": {"version": 2, "blocks": [{"id": "blk_q", "type": "question", "kind": "multiple_choice", "content": {"options": [{"id": "a", "text": "A"}]}, "scoring": {"mode": "points", "points": 1}}]}}]}
    prepared = prepare_document(document, existing_page_uuids=set(), allow_system_blocks=False)
    assert prepared.ok and "cannot earn" in prepared.warnings[0].message


def test_reference_rewrite_handles_prefixed_and_dotted_forms():
    value = {"a": "old", "b": "page:old", "c": "old.result.option_ids", "d": "answer:old.result.text", "e": "bold", "f": "old-ish", "g": "see old."}
    assert rewrite_page_references(value, {"old": "new"}) == {"a": "new", "b": "page:new", "c": "new.result.option_ids", "d": "answer:new.result.text", "e": "bold", "f": "old-ish", "g": "see old."}


def test_cloned_drafts_keep_answer_branching_and_lineage():
    session, _, _ = _world(state="published")
    badge = session.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.id == 50)).one()
    from src.db.learning import LearningBadge

    learning_badge = session.get(LearningBadge, badge.badge_id)
    target = LearningBadgeVersion(id=51, version_uuid="badge_version_next", badge_id=badge.badge_id, org_id=1, state="draft", title="Next", definition={}, creation_date=NOW, update_date=NOW)
    session.add(target)
    session.flush()
    _clone_version_graph(session, learning_badge, badge, target)
    session.commit()
    pages = session.exec(select(LearningPage).where(LearningPage.version_id == 51).order_by(LearningPage.order)).all()
    activity = session.exec(select(LearningActivity).where(LearningActivity.version_id == 51)).one()
    condition = activity.settings["flow"]["edges"][0]["condition"]
    assert condition["left"]["key"] == f"{pages[0].page_uuid}.result.option_ids"
    assert [page.content["version_lineage_uuid"] for page in pages] == ["lineage_1", "lineage_2", "lineage_3"]


def test_published_schema_describes_blocks_and_flow():
    schema = activity_document_json_schema()
    assert {"$ref": "#/$defs/StandardPageContent"} in schema["$defs"]["ActivityDocumentPage"]["properties"]["content"]["anyOf"]
    assert "QuestionBlock" in schema["$defs"] and "Flow" in schema["$defs"]

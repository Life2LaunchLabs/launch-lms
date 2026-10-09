"""Question settings live only on blocks: normalizer, data migration and zip packages."""

import importlib.util
import io
import json
import zipfile
from pathlib import Path

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import text
from sqlmodel import create_engine, select
from starlette.datastructures import UploadFile

from src.db.learning import BadgeCollection, LearningActivity, LearningBadge, LearningPage
from src.services import learning_transfer
from src.services.learning_documents import store
from src.services.learning_page_convert import normalize_question_settings
from src.tests.test_learning_documents import P1, _world
from src.tests.test_badge_marketplace import NOW, _request

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "k3n4o5r6m7q8_normalize_learning_question_settings.py"


def _question(block_id="blk_q", **settings):
    return {"id": block_id, "type": "question", "kind": "multiple_choice", "content": {"options": [{"id": "a", "text": "A"}]}, **settings}


def test_block_values_win_and_page_values_fill_gaps():
    content = {"version": 2, "blocks": [_question("q1"), _question("q2", scoring={"mode": "points", "points": 2})]}
    normalized = normalize_question_settings(content, {"correctOptionIds": ["a"], "points": 1}, {"minSelections": 1})
    first, second = normalized["blocks"]
    assert first["scoring"] == {"correct_option_ids": ["a"], "points": 1}
    assert first["completion"] == {"min_selections": 1}
    assert second["scoring"] == {"mode": "points", "points": 2}


def test_bindings_fall_back_separately_and_content_bindings_are_folded():
    content = {
        "version": 2,
        "variable_bindings": {"options": {"a": [{"target": "user.details.variables.x", "value": "a"}]}},
        "blocks": [_question(completion={"min_selections": 1}), {"id": "blk_t", "type": "question", "kind": "text_input", "content": {"inputs": [{"id": "i", "inputType": "email"}]}, "completion": {"inputs": {"i": {"minWords": 2}}}}],
    }
    normalized = normalize_question_settings(content)
    assert "variable_bindings" not in normalized
    assert normalized["blocks"][0]["completion"]["variable_bindings"]["options"]["a"][0]["value"] == "a"
    assert normalized["blocks"][1]["content"]["inputs"][0] == {"id": "i", "input_type": "email"}
    assert normalized["blocks"][1]["completion"]["inputs"]["i"] == {"min_words": 2}


def test_data_migration_moves_page_settings_onto_blocks(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'db.sqlite'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE learningpage (id INTEGER PRIMARY KEY, page_type TEXT, content TEXT, scoring TEXT, completion TEXT)"))
        rows = [
            (1, "standard", {"version": 2, "blocks": [_question()]}, {"correctOptionIds": ["a"]}, {"maxSelections": 1}),
            (2, "video", {"video_url": "x"}, {}, {"required": True}),
            (3, "standard", {"version": 2, "blocks": [_question(scoring={"mode": "off"})]}, {}, {}),
        ]
        for page_id, page_type, content, scoring, completion in rows:
            connection.execute(text("INSERT INTO learningpage VALUES (:i, :t, :c, :s, :p)"), {"i": page_id, "t": page_type, "c": json.dumps(content), "s": json.dumps(scoring), "p": json.dumps(completion)})
        spec = importlib.util.spec_from_file_location("normalize_migration", MIGRATION)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        stored = {row[0]: row[1:] for row in connection.execute(text("SELECT id, content, scoring, completion FROM learningpage"))}
    block = json.loads(stored[1][0])["blocks"][0]
    assert block["scoring"] == {"correct_option_ids": ["a"]} and block["completion"] == {"max_selections": 1}
    assert json.loads(stored[1][1]) == {} and json.loads(stored[1][2]) == {}
    assert json.loads(stored[2][2]) == {"required": True}, "video pages are untouched"
    assert json.loads(stored[3][0])["blocks"][0]["scoring"] == {"mode": "off"}


async def _import_zip(session, alice, content: bytes, name_prefix: str):
    session.add(BadgeCollection(id=9, org_id=1, collection_uuid="badge_collection_target", name="Target", creation_date=NOW, update_date=NOW))
    session.commit()
    analysis = await learning_transfer.analyze_badge_import_package(_request(), UploadFile(io.BytesIO(content), filename="p.zip"), 1, alice, session)
    result = await learning_transfer.import_badge_package(
        _request(), 1, {"temp_id": analysis["temp_id"], "collection_uuid": "badge_collection_target", "badge_uuids": [b["badge_uuid"] for b in analysis["badges"]], "name_prefix": name_prefix}, alice, session
    )
    assert result["successful"] == len(analysis["badges"]), result
    return analysis, result


@pytest.fixture(autouse=True)
def _temp_imports(tmp_path, monkeypatch):
    monkeypatch.setattr(learning_transfer, "TEMP_IMPORT_DIR", str(tmp_path / "imports"))


async def test_collection_package_round_trip_keeps_branching(monkeypatch):
    session, alice, _ = _world()
    monkeypatch.setattr(learning_transfer.learning_service.badge_service, "_require_badge_creation_access", lambda *_args: None)
    badge = session.get(LearningBadge, 1)
    badge.collection_id = None
    session.add(BadgeCollection(id=8, org_id=1, collection_uuid="badge_collection_source", name="Source", creation_date=NOW, update_date=NOW))
    badge.collection_id, badge.active_version_id = 8, 50
    session.add(badge)
    session.commit()

    package = await learning_transfer.export_badge_collection(_request(), "badge_collection_source", alice, session)
    names = zipfile.ZipFile(io.BytesIO(package)).namelist()
    assert "badges/badge_1/activities/01.activity.json" in names

    analysis, result = await _import_zip(session, alice, package, "Copy of")
    assert analysis["badges"][0]["activities_count"] == 1 and analysis["badges"][0]["pages_count"] == 3
    imported = session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == result["badges"][0]["new_uuid"])).one()
    assert imported.name.startswith("Copy of")
    activity = session.exec(select(LearningActivity).where(LearningActivity.badge_id == imported.id)).one()
    envelope = await store.get_activity_document(_request(), activity.activity_uuid, alice, session)
    assert envelope["context"]["editable"] is True
    pages = envelope["document"]["pages"]
    assert P1 not in {page["page_uuid"] for page in pages}
    edge = envelope["document"]["activity"]["settings"]["flow"]["edges"][0]
    assert edge["condition"]["left"]["key"] == f"{pages[0]['page_uuid']}.result.option_ids"


async def test_format_one_packages_are_converted_on_import(monkeypatch):
    session, alice, _ = _world()
    monkeypatch.setattr(learning_transfer.learning_service.badge_service, "_require_badge_creation_access", lambda *_args: None)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as package:
        package.writestr("manifest.json", json.dumps({"format": "launch-lms-badge-export", "version": "1.0.0", "badges": [{"badge_uuid": "badge_old", "path": "badges/badge_old"}]}))
        package.writestr("badges/badge_old/badge.json", json.dumps({"badge_uuid": "badge_old", "name": "Old badge"}))
        package.writestr("badges/badge_old/activities/a/activity.json", json.dumps({"title": "Old activity", "order": 1}))
        package.writestr("badges/badge_old/activities/a/pages/p1.json", json.dumps({"page_uuid": "learning_page_old", "page_type": "multiple_choice", "title": "Pick", "order": 1, "content": {"heading": "Pick one", "options": [{"id": "x", "text": "X"}]}, "scoring": {"correctOptionIds": ["x"], "points": 1}}))
    _analysis, result = await _import_zip(session, alice, buffer.getvalue(), "")
    imported = session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == result["badges"][0]["new_uuid"])).one()
    page = session.exec(select(LearningPage).where(LearningPage.badge_id == imported.id)).one()
    question = [block for block in page.content["blocks"] if block["type"] == "question"][0]
    assert page.page_type == "standard" and question["scoring"] == {"correct_option_ids": ["x"], "points": 1}
    assert page.scoring == {} and page.version_id is not None


BUTTON_MIGRATION = MIGRATION.with_name("k4b5u6t7t8n9_route_buttons_through_flow.py")


def _button_page(button_id, destination=None):
    content = {"label": "Go"}
    if destination:
        content["destination_page_uuid"] = destination
    return {"version": 2, "blocks": [{"id": button_id, "type": "button", "content": content}]}


def test_button_migration_turns_destinations_into_edges_and_revisits(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'db.sqlite'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE learningactivity (id INTEGER PRIMARY KEY, settings TEXT)"))
        connection.execute(text('CREATE TABLE learningpage (id INTEGER PRIMARY KEY, activity_id INTEGER, page_uuid TEXT, "order" INTEGER, content TEXT)'))
        connection.execute(text("INSERT INTO learningactivity VALUES (1, '{}'), (2, '{}')"))
        pages = [
            (1, 1, "learning_page_a", 1, _button_page("btn_skip", "learning_page_c")),
            (2, 1, "learning_page_b", 2, {"version": 2, "blocks": []}),
            (3, 1, "learning_page_c", 3, _button_page("btn_back", "learning_page_a")),
            (4, 2, "learning_page_x", 1, _button_page("btn_plain")),
        ]
        for row in pages:
            connection.execute(text("INSERT INTO learningpage VALUES (:i, :a, :u, :o, :c)"), {"i": row[0], "a": row[1], "u": row[2], "o": row[3], "c": json.dumps(row[4])})
        spec = importlib.util.spec_from_file_location("button_migration", BUTTON_MIGRATION)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        content = {row[0]: json.loads(row[1])["blocks"][0]["content"] for row in connection.execute(text("SELECT id, content FROM learningpage WHERE id != 2"))}
        settings = {row[0]: json.loads(row[1]) for row in connection.execute(text("SELECT id, settings FROM learningactivity"))}
    assert content[1] == {"label": "Go", "action": "continue"}
    assert content[3] == {"label": "Go", "action": "revisit", "revisit_page_uuid": "learning_page_a"}
    assert content[4] == {"label": "Go", "action": "continue"}
    edge = [edge for edge in settings[1]["flow"]["edges"] if edge.get("condition")][0]
    assert (edge["from"], edge["to"]) == ("page:learning_page_a", "page:learning_page_c")
    assert edge["condition"]["left"]["key"] == "learning_page_a.button" and edge["condition"]["right"] == "btn_skip"
    assert settings[2] == {}, "activities without forward routes keep page order"

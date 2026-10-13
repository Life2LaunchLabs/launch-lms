"""Question settings live only on blocks: normalizer and data migrations."""

import importlib.util
import json
from pathlib import Path

from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import text
from sqlmodel import create_engine

from src.services.learning_page_convert import normalize_question_settings

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

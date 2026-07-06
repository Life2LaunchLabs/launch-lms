"""Repair legacy learning page_type enum-name storage

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
Create Date: 2026-07-06 00:00:00.000000

SQLModel previously mapped LearningPageType as a SQLAlchemy Enum, which stored
member names like INFO and MULTIPLE_CHOICE. The standard-page migration now
expects plain string values like standard/video. This repair revision handles
dev databases where the earlier migration was already marked applied before it
learned to normalize uppercase enum-name rows.
"""
import json
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "o6p7q8r9s0t1"
down_revision: Union[str, None] = "n5o6p7q8r9s0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEGACY_SIMPLE_TYPES = {"info", "multiple_choice", "text_input"}
QUESTION_KINDS = {"multiple_choice", "text_input"}
PAGE_TYPE_ALIASES = {
    "INFO": "info",
    "MULTIPLE_CHOICE": "multiple_choice",
    "TEXT_INPUT": "text_input",
    "QUESTION_RESPONSE": "question_response",
    "VIDEO": "video",
    "STANDARD": "standard",
}


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _normalize_page_type(page_type: str) -> str:
    raw = str(page_type or "").strip()
    return PAGE_TYPE_ALIASES.get(raw, raw.lower())


def _block_id() -> str:
    return f"blk_{uuid4().hex[:8]}"


def _text_block(node: dict) -> dict:
    return {"id": _block_id(), "type": "text", "design": {}, "content": {"node": node}}


def _image_block(src: str, height) -> dict:
    design = {"height": int(height)} if height else {}
    return {"id": _block_id(), "type": "image", "design": design, "content": {"src": src or "", "alt": ""}}


def _question_block(kind: str, content: dict) -> dict:
    return {"id": _block_id(), "type": "question", "kind": kind, "design": {}, "content": content}


def _heading_node(text: str) -> dict:
    node = {"type": "heading", "attrs": {"level": 1}}
    if text:
        node["content"] = [{"type": "text", "text": str(text)}]
    return node


def _paragraph_node(text: str) -> dict:
    if not text:
        return {"type": "paragraph"}
    return {"type": "paragraph", "content": [{"type": "text", "text": str(text)}]}


def _rich_text_nodes(content: dict) -> list:
    rich_text = (content or {}).get("rich_text")
    if isinstance(rich_text, dict) and isinstance(rich_text.get("content"), list):
        return rich_text["content"]
    return []


def _nodes_to_blocks(nodes: list, question_factory=None) -> list:
    blocks = []
    question_added = False
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = node.get("type")
        if node_type == "learningImage":
            attrs = node.get("attrs") or {}
            blocks.append(_image_block(str(attrs.get("src") or ""), attrs.get("height")))
        elif node_type == "learningQuestion":
            if question_factory and not question_added:
                blocks.append(question_factory())
                question_added = True
        else:
            blocks.append(_text_block(node))
    if question_factory and not question_added:
        blocks.append(question_factory())
    return blocks


def _fallback_blocks(content: dict) -> list:
    blocks = []
    heading = str(content.get("heading") or content.get("prompt") or "").strip()
    body = str(content.get("body") or "").strip()
    if heading:
        blocks.append(_text_block(_heading_node(heading)))
    if body:
        blocks.append(_text_block(_paragraph_node(body)))
    return blocks


def _convert_simple(page_type: str, content: dict) -> dict:
    question_factory = None
    if page_type in QUESTION_KINDS:
        question_content = {"options": content.get("options") or []} if page_type == "multiple_choice" else {"inputs": content.get("inputs") or []}
        question_factory = lambda: _question_block(page_type, question_content)  # noqa: E731

    nodes = _rich_text_nodes(content)
    if nodes:
        blocks = _nodes_to_blocks(nodes, question_factory)
    else:
        blocks = _fallback_blocks(content)
        if question_factory:
            blocks.append(question_factory())
    return {"version": 2, "blocks": blocks}


def _find_question(content: dict):
    for block in (content or {}).get("blocks") or []:
        if isinstance(block, dict) and block.get("type") == "question":
            return block
    return None


def _convert_question_response(content: dict, question_block_by_uuid: dict) -> dict:
    nodes = _rich_text_nodes(content)
    blocks = _nodes_to_blocks(nodes) if nodes else _fallback_blocks(content)
    new_content = {"version": 2, "blocks": blocks}

    linked_page_uuid = content.get("linked_page_uuid") or content.get("linkedPageUuid")
    raw_variants = content.get("response_variants") or {}
    overrides = {}
    if isinstance(raw_variants, dict):
        for key, variant in raw_variants.items():
            if key == "default" or not isinstance(variant, dict) or not variant.get("enabled"):
                continue
            variant_nodes = _rich_text_nodes(variant)
            if variant_nodes:
                overrides[str(key)] = {"blocks": _nodes_to_blocks(variant_nodes)}

    if linked_page_uuid or overrides:
        variants = {"overrides": overrides}
        if linked_page_uuid:
            source = {"page_uuid": str(linked_page_uuid)}
            source_question = question_block_by_uuid.get(str(linked_page_uuid))
            if source_question:
                source["block_id"] = source_question.get("id")
            variants["source"] = source
        new_content["variants"] = variants
    return new_content


def _load_content(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except ValueError:
            return {}
    return {}


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(inspect(bind), "learningpage"):
        return

    rows = bind.execute(sa.text("SELECT id, page_uuid, page_type, content FROM learningpage")).fetchall()
    converted: dict[int, tuple[str, dict]] = {}
    question_block_by_uuid: dict[str, dict] = {}

    for row in rows:
        page_id, page_uuid, raw_page_type, raw_content = row
        page_type = _normalize_page_type(raw_page_type)
        content = _load_content(raw_content)
        if page_type in LEGACY_SIMPLE_TYPES:
            new_content = _convert_simple(page_type, content)
            converted[page_id] = ("standard", new_content)
            question = _find_question(new_content)
        else:
            question = _find_question(content)
            if page_type in {"video", "standard"} and raw_page_type != page_type:
                converted[page_id] = (page_type, content)
        if question and page_uuid:
            question_block_by_uuid[str(page_uuid)] = question

    for row in rows:
        page_id, _page_uuid, raw_page_type, raw_content = row
        page_type = _normalize_page_type(raw_page_type)
        if page_type != "question_response":
            continue
        converted[page_id] = ("standard", _convert_question_response(_load_content(raw_content), question_block_by_uuid))

    for page_id, (new_type, new_content) in converted.items():
        bind.execute(
            sa.text("UPDATE learningpage SET page_type = :page_type, content = :content WHERE id = :id"),
            {"page_type": new_type, "content": json.dumps(new_content), "id": page_id},
        )


def downgrade() -> None:
    # Data repair only; leave normalized page types in place.
    pass

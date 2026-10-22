"""Builders and converters for the block-based learning page content model.

Standard pages store `content = {"version": 2, "blocks": [...], "variants": {...}}`.
Blocks are `{"id", "type": "text"|"image"|"question", "design": {...}, ...}`.
This module is the single source of truth for producing that shape.
"""

from copy import deepcopy
from uuid import uuid4

RESERVED_VARIANT_KEYS = {"correct", "incorrect"}


def make_block_id() -> str:
    return f"blk_{uuid4().hex[:8]}"


def text_block(node: dict, design: dict | None = None, block_id: str | None = None) -> dict:
    return {
        "id": block_id or make_block_id(),
        "type": "text",
        "design": design or {},
        "content": {"node": node},
    }


def image_block(src: str = "", alt: str = "", height: int | None = None, design: dict | None = None, block_id: str | None = None) -> dict:
    block_design = dict(design or {})
    if height is not None:
        block_design["height"] = height
    return {
        "id": block_id or make_block_id(),
        "type": "image",
        "design": block_design,
        "content": {"src": src or "", "alt": alt or ""},
    }


def question_block(
    kind: str,
    content: dict,
    block_id: str | None = None,
    scoring: dict | None = None,
    completion: dict | None = None,
) -> dict:
    block = {
        "id": block_id or make_block_id(),
        "type": "question",
        "kind": kind,
        "design": {},
        "content": content or {},
    }
    if scoring is not None:
        block["scoring"] = scoring
    if completion is not None:
        block["completion"] = completion
    return block


def paragraph_node(text: str) -> dict:
    if not text:
        return {"type": "paragraph"}
    return {"type": "paragraph", "content": [{"type": "text", "text": str(text)}]}


def find_question_block(content: dict | None) -> dict | None:
    blocks = find_question_blocks(content)
    return blocks[0] if blocks else None


def find_question_blocks(content: dict | None) -> list[dict]:
    return [
        block
        for block in (content or {}).get("blocks") or []
        if isinstance(block, dict) and block.get("type") == "question"
    ]


def iter_block_stacks(content: dict | None):
    """Yield every blocks array in a standard page: default + all variant overrides."""
    content = content or {}
    blocks = content.get("blocks")
    if isinstance(blocks, list):
        yield blocks
    overrides = ((content.get("variants") or {}).get("overrides")) or {}
    if isinstance(overrides, dict):
        for override in overrides.values():
            override_blocks = (override or {}).get("blocks") if isinstance(override, dict) else None
            if isinstance(override_blocks, list):
                yield override_blocks


def _node_has_text(node: dict) -> bool:
    if node.get("text"):
        return True
    return any(_node_has_text(child) for child in node.get("content") or [] if isinstance(child, dict))


SNAKE_CASE_SETTING_KEYS = {
    "correctOptionIds": "correct_option_ids",
    "scorePolicy": "score_policy",
    "acceptedAnswers": "accepted_answers",
    "minSelections": "min_selections",
    "maxSelections": "max_selections",
    "variableBindings": "variable_bindings",
    "questionMode": "question_mode",
    "minWords": "min_words",
    "maxWords": "max_words",
    "inputType": "input_type",
    "sectionId": "section_id",
}


def _snake_keys(value):
    if not isinstance(value, dict):
        return value
    renamed = {}
    for key, item in value.items():
        target = SNAKE_CASE_SETTING_KEYS.get(key, key)
        if target not in renamed or key == target:
            renamed[target] = item
    return renamed


def normalize_question_settings(content: dict | None, page_scoring: dict | None = None, page_completion: dict | None = None) -> dict:
    """Make every question block carry its own snake_case scoring/completion.

    Older pages kept a single question's settings (and variable bindings) on
    the page or in the page content, and some used camelCase keys. Readers now
    only look at the block, so this folds those older shapes in, applying the
    same precedence the old fallbacks used: a non-empty block value wins.
    """
    content = deepcopy(content or {})
    page_scoring = _snake_keys(page_scoring or {})
    page_completion = _snake_keys(page_completion or {})
    page_bindings = page_completion.get("variable_bindings")
    if not isinstance(page_bindings, dict):
        page_bindings = _snake_keys(content).get("variable_bindings")
    page_bindings = page_bindings if isinstance(page_bindings, dict) else {}
    for stack in iter_block_stacks(content):
        for block in stack:
            if not isinstance(block, dict) or block.get("type") != "question":
                continue
            scoring = _snake_keys(block.get("scoring")) if isinstance(block.get("scoring"), dict) else {}
            completion = _snake_keys(block.get("completion")) if isinstance(block.get("completion"), dict) else {}
            scoring = scoring or deepcopy(page_scoring)
            completion = completion or deepcopy(page_completion)
            if isinstance(completion.get("inputs"), dict):
                completion["inputs"] = {key: _snake_keys(rules) for key, rules in completion["inputs"].items()}
            bindings = completion.get("variable_bindings")
            if not (isinstance(bindings, dict) and bindings) and page_bindings:
                completion["variable_bindings"] = deepcopy(page_bindings)
            block_content = block.get("content")
            if isinstance(block_content, dict) and isinstance(block_content.get("inputs"), list):
                block_content["inputs"] = [_snake_keys(item) for item in block_content["inputs"]]
            if scoring:
                block["scoring"] = scoring
            if completion:
                block["completion"] = completion
    content.pop("variable_bindings", None)
    content.pop("variableBindings", None)
    return content

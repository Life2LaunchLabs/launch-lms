"""normalize learning question settings onto blocks

Revision ID: k3n4o5r6m7q8
Revises: k2o3a4u5t6h7

Question blocks become the only place scoring, completion and variable
bindings live: page-level values and content-level bindings are folded into
each question block that lacks its own (the precedence the read-time fallbacks
used), camelCase setting keys become snake_case, and the page-level columns of
standard pages are cleared. Preview session documents are normalized the same
way. Helpers are frozen copies so later code changes cannot alter this
migration. Downgrade is a no-op: the data stays valid for the old readers.
"""

import json
from copy import deepcopy

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "k3n4o5r6m7q8"
down_revision = "k2o3a4u5t6h7"
branch_labels = None
depends_on = None


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


def _load(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        try:
            value = json.loads(raw)
        except ValueError:
            return {}
        return value if isinstance(value, dict) else {}
    return {}


def upgrade() -> None:
    bind = op.get_bind()
    tables = inspect(bind).get_table_names()
    if "learningpage" in tables:
        rows = bind.execute(sa.text("SELECT id, page_type, content, scoring, completion FROM learningpage")).fetchall()
        for page_id, page_type, raw_content, raw_scoring, raw_completion in rows:
            if str(page_type).lower() != "standard":
                continue
            content, scoring, completion = _load(raw_content), _load(raw_scoring), _load(raw_completion)
            normalized = normalize_question_settings(content, scoring, completion)
            if normalized == content and not scoring and not completion:
                continue
            bind.execute(
                sa.text("UPDATE learningpage SET content = :content, scoring = :empty, completion = :empty WHERE id = :id"),
                {"content": json.dumps(normalized), "empty": "{}", "id": page_id},
            )
    if "learningactivitypreview" in tables:
        for preview_id, raw_document in bind.execute(sa.text("SELECT id, document FROM learningactivitypreview")).fetchall():
            document = _load(raw_document)
            pages = document.get("pages") or []
            for page in pages:
                if isinstance(page, dict) and page.get("page_type", "standard") == "standard":
                    page["content"] = normalize_question_settings(page.get("content"), page.pop("scoring", None), page.pop("completion", None))
            bind.execute(sa.text("UPDATE learningactivitypreview SET document = :document WHERE id = :id"), {"document": json.dumps(document), "id": preview_id})


def downgrade() -> None:
    pass

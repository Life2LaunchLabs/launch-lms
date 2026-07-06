"""Move page-level scoring/completion into the question block

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
Create Date: 2026-07-06 00:00:00.000000

Standard pages may now contain multiple question blocks, each carrying its own
`scoring` and `completion`. Existing pages keyed these at page level for their
single question block — relocate them into the block (page columns are cleared;
the grading engine still falls back to page level for imported legacy data).
Downgrade is a documented no-op (pre-release dev data only).
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "p7q8r9s0t1u2"
down_revision: Union[str, None] = "o6p7q8r9s0t1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _load_json(raw):
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
    inspector = inspect(bind)
    if "learningpage" not in inspector.get_table_names():
        return

    rows = bind.execute(sa.text(
        "SELECT id, page_type, content, scoring, completion FROM learningpage"
    )).fetchall()

    for page_id, page_type, raw_content, raw_scoring, raw_completion in rows:
        if page_type != "standard":
            continue
        content = _load_json(raw_content)
        scoring = _load_json(raw_scoring)
        completion = _load_json(raw_completion)
        if not scoring and not completion:
            continue

        blocks = content.get("blocks") if isinstance(content.get("blocks"), list) else []
        questions = [block for block in blocks if isinstance(block, dict) and block.get("type") == "question"]
        if len(questions) != 1:
            continue

        question = questions[0]
        changed = False
        if scoring and not question.get("scoring"):
            question["scoring"] = scoring
            changed = True
        if completion and not question.get("completion"):
            question["completion"] = completion
            changed = True
        if not changed:
            continue

        bind.execute(
            sa.text("UPDATE learningpage SET content = :content, scoring = :scoring, completion = :completion WHERE id = :id"),
            {"content": json.dumps(content), "scoring": json.dumps({}), "completion": json.dumps({}), "id": page_id},
        )


def downgrade() -> None:
    # Relocation is not reversed (pre-release dev data only).
    pass

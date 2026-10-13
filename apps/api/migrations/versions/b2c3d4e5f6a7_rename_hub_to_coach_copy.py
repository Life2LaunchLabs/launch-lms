"""rename the learner-facing Hub to Coach in saved platform copy

Revision ID: b2c3d4e5f6a7
Revises: a1f2e3d4c5b6

Saved advisor instructions and Hub-home launch cards were written with the old
"Hub" name, and the advisor introduces itself from them. Rewrite the word in
place; tables and code identifiers keep their internal hub_* names.
"""

import json
import re

from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a7"
down_revision = "a1f2e3d4c5b6"
branch_labels = None
depends_on = None

_PHRASES = (
    (re.compile(r"\bthe Launch LMS Hub advisor\b"), "Coach, the Launch LMS learning coach"),
    (re.compile(r"\b[Tt]he Hub coach\b"), "Coach"),
    (re.compile(r"\bHub coach\b"), "Coach"),
    (re.compile(r"\bHub Ask\b"), "Coach"),
    (re.compile(r"\b[Tt]he Hub\b"), "Coach"),
    (re.compile(r"\bHub\b"), "Coach"),
)


def _rename(text: str) -> str:
    for pattern, replacement in _PHRASES:
        text = pattern.sub(replacement, text)
    return text


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, instructions, launch_cards FROM hubadvisorconfiguration")
    ).fetchall()
    for row_id, instructions, launch_cards in rows:
        cards = launch_cards
        if isinstance(cards, str):
            cards = json.loads(cards)
        new_cards = json.loads(_rename(json.dumps(cards))) if cards is not None else None
        new_instructions = _rename(instructions or "")
        if new_instructions == instructions and new_cards == cards:
            continue
        connection.execute(
            sa.text(
                "UPDATE hubadvisorconfiguration SET instructions = :instructions, "
                "launch_cards = :launch_cards WHERE id = :id"
            ).bindparams(sa.bindparam("launch_cards", type_=sa.JSON())),
            {"instructions": new_instructions, "launch_cards": new_cards, "id": row_id},
        )


def downgrade() -> None:
    # Copy edits are not reversed; "Coach" text stays valid on older code.
    pass

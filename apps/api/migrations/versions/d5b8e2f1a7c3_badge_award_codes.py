"""badge award codes: each award gets a short public code, for its page at /b/<code>

Revision ID: d5b8e2f1a7c3
Revises: c3f7a9e2b1d4

Existing awards get a random code here; new ones get theirs when they're made
(``db/badges.new_award_code``).
"""
from __future__ import annotations

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5b8e2f1a7c3"
down_revision: Union[str, None] = "c3f7a9e2b1d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def upgrade() -> None:
    op.add_column("badge_award", sa.Column("code", sa.String(), nullable=True))
    bind = op.get_bind()
    used: set[str] = set()
    for (award_id,) in bind.execute(sa.text("SELECT id FROM badge_award")).fetchall():
        code = ""
        while not code or code in used:
            code = "".join(secrets.choice(ALPHABET) for _ in range(8))
        used.add(code)
        bind.execute(sa.text("UPDATE badge_award SET code = :code WHERE id = :id"), {"code": code, "id": award_id})
    op.alter_column("badge_award", "code", nullable=False)
    op.create_unique_constraint("uq_badge_award_code", "badge_award", ["code"])


def downgrade() -> None:
    op.drop_constraint("uq_badge_award_code", "badge_award", type_="unique")
    op.drop_column("badge_award", "code")

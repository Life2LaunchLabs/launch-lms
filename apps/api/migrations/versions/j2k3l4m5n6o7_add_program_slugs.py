"""add stable program slugs

Revision ID: j2k3l4m5n6o7
Revises: i1j2k3l4m5n6
"""

import re

from alembic import op
import sqlalchemy as sa


revision = "j2k3l4m5n6o7"
down_revision = "i1j2k3l4m5n6"
branch_labels = None
depends_on = None


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-") or "program"


def upgrade() -> None:
    op.add_column("program", sa.Column("slug", sa.String(), nullable=True))
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, name FROM program ORDER BY id")).mappings()
    used: set[str] = set()
    for row in rows:
        base = _slugify(row["name"])
        slug = base
        suffix = 2
        while slug in used:
            slug = f"{base}-{suffix}"
            suffix += 1
        connection.execute(
            sa.text("UPDATE program SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row["id"]},
        )
        used.add(slug)
    with op.batch_alter_table("program") as batch_op:
        batch_op.alter_column("slug", existing_type=sa.String(), nullable=False)
        batch_op.create_index("ix_program_slug", ["slug"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("program") as batch_op:
        batch_op.drop_index("ix_program_slug")
        batch_op.drop_column("slug")

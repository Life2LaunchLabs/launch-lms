"""add target lifestyle framework

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g2h3i4j5k6l7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LIFESTYLE_ROWS = [
    (16, "target_lifestyle", None, "Target Lifestyle", "The life you are intentionally designing toward.", "domain", 200),
    (17, "target_lifestyle.environment", 16, "Environment", "The places, spaces, and sensory conditions that help you thrive.", "lifestyle", 210),
    (18, "target_lifestyle.relationships", 16, "Relationships", "The people, communities, and support patterns you want around you.", "lifestyle", 220),
    (19, "target_lifestyle.purpose", 16, "Purpose", "The contribution, meaning, and direction you want your life to hold.", "lifestyle", 230),
    (20, "target_lifestyle.rhythms", 16, "Rhythms", "The routines, pacing, seasons, and rituals that make life workable.", "lifestyle", 240),
    (21, "target_lifestyle.health", 16, "Health", "The wellbeing foundations that support your energy and capacity.", "lifestyle", 250),
]


def upgrade() -> None:
    table = sa.table(
        "lifeframeworknode",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("parent_id", sa.Integer),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("node_type", sa.String),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("creation_date", sa.String),
        sa.column("update_date", sa.String),
    )
    bind = op.get_bind()
    existing_keys = {
        row[0]
        for row in bind.execute(
            sa.text("SELECT key FROM lifeframeworknode WHERE key LIKE 'target_lifestyle%'")
        )
    }
    rows_to_insert = [
        {
            "id": row[0],
            "key": row[1],
            "parent_id": row[2],
            "title": row[3],
            "description": row[4],
            "node_type": row[5],
            "sort_order": row[6],
            "is_active": True,
            "creation_date": "2026-05-12T00:00:00+00:00",
            "update_date": "2026-05-12T00:00:00+00:00",
        }
        for row in LIFESTYLE_ROWS
        if row[1] not in existing_keys
    ]
    if rows_to_insert:
        op.bulk_insert(table, rows_to_insert)
    if bind.dialect.name == "postgresql":
        op.execute("SELECT setval(pg_get_serial_sequence('lifeframeworknode', 'id'), (SELECT max(id) FROM lifeframeworknode))")


def downgrade() -> None:
    op.execute("DELETE FROM lifeframeworknode WHERE key LIKE 'target_lifestyle%'")

"""catalog releases side by side: a career or school can be in more than one release

O*NET careers were unique by code and Scorecard schools by unitid, so importing a new release
deleted the reviewed rows and added drafts in their place, hiding them from learners until the new
release was approved. Each row is now unique within its release; readers use the newest reviewed
release that has the code.

Revision ID: m2r4e6l8s0a1
Revises: k7c3a9r5e1e2
"""

import sqlalchemy as sa
from alembic import op


revision = "m2r4e6l8s0a1"
down_revision = "k7c3a9r5e1e2"
branch_labels = None
depends_on = None

TABLES = (("careerentry", "code"), ("schoolentry", "unitid"))


def _unique_on(table: str, columns: list[str]) -> str | None:
    for constraint in sa.inspect(op.get_bind()).get_unique_constraints(table):
        if constraint["column_names"] == columns:
            return constraint["name"]
    return None


def upgrade() -> None:
    for table, key in TABLES:
        with op.batch_alter_table(table) as batch:
            old = _unique_on(table, [key])
            if old:
                batch.drop_constraint(old, type_="unique")
            if not _unique_on(table, [key, "source_id"]):
                batch.create_unique_constraint(f"uq_{table}_{key}_source", [key, "source_id"])


def downgrade() -> None:
    # Only the newest release of each code can stay under the old one-row-per-code rule.
    for table, key in TABLES:
        op.execute(
            f"DELETE FROM {table} WHERE id NOT IN (SELECT MAX(id) FROM {table} GROUP BY {key})"
        )
        with op.batch_alter_table(table) as batch:
            if _unique_on(table, [key, "source_id"]):
                batch.drop_constraint(f"uq_{table}_{key}_source", type_="unique")
            batch.create_unique_constraint(f"{table}_{key}_key", [key])

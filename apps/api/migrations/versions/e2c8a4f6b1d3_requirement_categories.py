"""requirement categories: per-node numbering and rules instead of levels; locked copies, library editable, flagged gaps

Frameworks used to keep one code style per depth (`requirement_levels`). Each node with children now says how they
are numbered, the framework says how its top level is numbered, and level fields become framework fields. Codes are
already stored on every node, so nothing renumbers.

Revision ID: e2c8a4f6b1d3
Revises: d5b9e3f1a7c4
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2c8a4f6b1d3"
down_revision: Union[str, None] = "d5b9e3f1a7c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

frameworks = sa.table(
    "requirementframework",
    sa.column("id", sa.Integer), sa.column("source_metadata", sa.JSON), sa.column("library_snapshot", sa.JSON),
)
versions = sa.table("requirementframeworkversion", sa.column("id", sa.Integer), sa.column("framework_id", sa.Integer))
nodes = sa.table(
    "requirementnode",
    sa.column("id", sa.Integer), sa.column("version_id", sa.Integer), sa.column("node_uuid", sa.String),
    sa.column("parent_node_uuid", sa.String), sa.column("metadata", sa.JSON),
)


def upgrade() -> None:
    op.add_column("requirementframework", sa.Column("library_editable", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("requirementframework", sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("requirementframework", sa.Column("flagged_node_uuids", sa.JSON(), nullable=False, server_default="[]"))

    from src.services.requirement_codes import upgrade_levels

    conn = op.get_bind()
    for framework_id, source_metadata, snapshot in conn.execute(sa.select(frameworks.c.id, frameworks.c.source_metadata, frameworks.c.library_snapshot)).all():
        changes = {}
        if (source_metadata or {}).get("requirement_levels") is not None:
            version_ids = [row[0] for row in conn.execute(sa.select(versions.c.id).where(versions.c.framework_id == framework_id)).all()]
            for version_id in version_ids:
                rows = conn.execute(sa.select(nodes.c.id, nodes.c.node_uuid, nodes.c.parent_node_uuid, nodes.c.metadata).where(nodes.c.version_id == version_id)).all()
                items = [{"id": row[0], "node_uuid": row[1], "parent_node_uuid": row[2], "metadata": row[3] or {}} for row in rows]
                _, upgraded = upgrade_levels(source_metadata, items)
                for before, after in zip(items, upgraded):
                    if after["metadata"] != before["metadata"]:
                        conn.execute(nodes.update().where(nodes.c.id == before["id"]).values(metadata=after["metadata"]))
            changes["source_metadata"], _ = upgrade_levels(source_metadata, [])
        if snapshot and (snapshot.get("source_metadata") or {}).get("requirement_levels") is not None:
            meta, upgraded = upgrade_levels(snapshot["source_metadata"], [{**node, "metadata": node.get("metadata") or {}} for node in snapshot.get("nodes") or []])
            changes["library_snapshot"] = {**snapshot, "source_metadata": meta, "nodes": upgraded}
        if changes:
            conn.execute(frameworks.update().where(frameworks.c.id == framework_id).values(**changes))


def downgrade() -> None:
    # Numbering stays in node metadata, where older code ignores it; only the new columns go.
    op.drop_column("requirementframework", "flagged_node_uuids")
    op.drop_column("requirementframework", "locked")
    op.drop_column("requirementframework", "library_editable")

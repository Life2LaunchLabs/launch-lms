"""template-owned objectives; live plan objectives carry their requirement links

Revision ID: n1t2o3w4n5e6
Revises: k4b5u6t7t8n9

Objectives stop being shared between plan templates. Every template objective
that is used by more than one template is copied, so each template owns its
own row; the oldest template keeps the original. Live plans and assignment
snapshots keep pointing at the row they were created from.

Live plan objectives gain ``requirement_mappings``: the requirement nodes they
count toward, copied from the assignment snapshot they were materialized from.
Requirement credit is read from there instead of the assignment snapshot.

Downgrade drops the column; split objectives stay split.
"""

import json
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "n1t2o3w4n5e6"
down_revision = "k4b5u6t7t8n9"
branch_labels = None
depends_on = None

OBJECTIVE_COLUMNS = (
    "org_id", "title", "description", "kind", "completion_policy", "evidence_policy",
    "allow_learner_confirmation", "custom_fields", "badge_id", "archived",
    "created_by_user_id", "creation_date", "update_date",
)


def _json(value, default):
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return default
    return value


def _split_shared_objectives(connection) -> None:
    shared = connection.execute(sa.text(
        "SELECT objective_id FROM programobjective GROUP BY objective_id HAVING COUNT(*) > 1"
    )).scalars().all()
    columns = ", ".join(OBJECTIVE_COLUMNS)
    for objective_id in shared:
        relations = connection.execute(sa.text(
            "SELECT id FROM programobjective WHERE objective_id = :id ORDER BY id"
        ), {"id": objective_id}).scalars().all()
        for relation_id in relations[1:]:
            new_id = connection.execute(sa.text(
                f"INSERT INTO objective (objective_uuid, {columns}) "
                f"SELECT :uuid, {columns} FROM objective WHERE id = :id RETURNING id"
            ), {"uuid": f"objective_{uuid4()}", "id": objective_id}).scalar_one()
            connection.execute(sa.text(
                "UPDATE programobjective SET objective_id = :new WHERE id = :relation"
            ), {"new": new_id, "relation": relation_id})


def _mapping(item: dict) -> dict | None:
    if not item.get("node_uuid") or item.get("framework_id") is None:
        return None
    return {"framework_id": int(item["framework_id"]), "framework_uuid": item.get("framework_uuid"), "node_uuid": item["node_uuid"]}


def _backfill_plan_objective_mappings(connection) -> None:
    rows = connection.execute(sa.text(
        "SELECT plan.id AS plan_id, programassignment.objective_snapshot AS snapshot "
        "FROM plan JOIN programassignment ON programassignment.id = plan.source_assignment_id"
    )).mappings().all()
    update = sa.text(
        "UPDATE planobjective SET requirement_mappings = :mappings WHERE plan_id = :plan AND source_objective_id = :source"
    ).bindparams(sa.bindparam("mappings", type_=sa.JSON()))
    for row in rows:
        for item in _json(row["snapshot"], []):
            mappings = [mapping for raw in item.get("requirement_mappings") or [] if (mapping := _mapping(raw))]
            if mappings and item.get("id") is not None:
                connection.execute(update, {"mappings": mappings, "plan": row["plan_id"], "source": int(item["id"])})


def upgrade() -> None:
    op.add_column("planobjective", sa.Column("requirement_mappings", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    connection = op.get_bind()
    _split_shared_objectives(connection)
    _backfill_plan_objective_mappings(connection)


def downgrade() -> None:
    op.drop_column("planobjective", "requirement_mappings")

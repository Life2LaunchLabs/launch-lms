"""unify plan assignment definitions

Revision ID: a831f72c9e4d
Revises: p1a2n3m4e5d6
"""

from alembic import op
import sqlalchemy as sa


revision = "a831f72c9e4d"
down_revision = "p1a2n3m4e5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("programassignment", sa.Column("definition_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("programassignment", sa.Column("definition_audit", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("programassignment", sa.Column("collaborators", sa.JSON(), nullable=False, server_default="[]"))
    bind = op.get_bind()
    import json

    # Assignment schedules use target dates only. Remove retired phase/objective
    # start fields and clear already-materialized phase starts.
    update_schedule = sa.text("UPDATE programassignment SET schedule = :schedule WHERE id = :id").bindparams(
        sa.bindparam("schedule", type_=sa.JSON())
    )
    assignment_rows = bind.execute(sa.text(
        "SELECT pa.id, pa.owner_user_id, pa.staff_user_ids, pa.schedule, p.default_staff_role_key "
        "FROM programassignment pa JOIN program p ON p.id = pa.program_id"
    )).mappings().all()
    update_collaborators = sa.text("UPDATE programassignment SET collaborators = :collaborators WHERE id = :id").bindparams(
        sa.bindparam("collaborators", type_=sa.JSON())
    )
    for row in assignment_rows:
        schedule = row["schedule"] or {}
        if isinstance(schedule, str):
            schedule = json.loads(schedule)
        for phase in schedule.get("phases") or []:
            phase.pop("start_date", None)
        for objective in schedule.get("objectives") or []:
            objective.pop("start_rule", None)
            objective.pop("start_date", None)
            objective.pop("effective_start_date", None)
        update = {"id": row["id"], "schedule": schedule}
        bind.execute(update_schedule, update)
        staff_ids = row["staff_user_ids"] or []
        if isinstance(staff_ids, str):
            staff_ids = json.loads(staff_ids)
        owner_id = row["owner_user_id"]
        people = list(dict.fromkeys([*([owner_id] if owner_id else []), *staff_ids]))
        collaborators = [{
            "user_id": user_id,
            "role_key": "plan_admin" if user_id == owner_id else row["default_staff_role_key"] or "reviewer",
        } for user_id in people]
        bind.execute(update_collaborators, {"id": row["id"], "collaborators": collaborators})
    bind.execute(sa.text(
        "UPDATE planphase SET start_date = NULL WHERE plan_id IN "
        "(SELECT id FROM plan WHERE source_assignment_id IS NOT NULL)"
    ))

    # Templates now represent badges as supporting steps on regular objectives.
    badge_rows = bind.execute(sa.text("""
        SELECT o.id, o.objective_uuid, o.title, o.custom_fields, o.badge_id, lb.badge_uuid,
               po.badge_major_version, po.accept_previous_major_versions
        FROM objective o
        LEFT JOIN learningbadge lb ON lb.id = o.badge_id
        LEFT JOIN programobjective po ON po.objective_id = o.id
        WHERE o.kind = 'badge'
    """)).mappings().all()
    for row in badge_rows:
        fields = row["custom_fields"] or []
        if isinstance(fields, str):
            fields = json.loads(fields)
        if row["badge_uuid"] and not any(str(item.get("type")) == "badge" for item in fields):
            fields.append({
                "field_uuid": f"badge_requirement_{row['objective_uuid']}",
                "title": row["title"],
                "type": "badge",
                "badge_uuid": row["badge_uuid"],
                "badge_major_version": row["badge_major_version"] or 1,
                "accept_previous_major_versions": bool(row["accept_previous_major_versions"]),
                "restricted": False,
                "access": "contributor",
            })
        update_objective = sa.text(
            "UPDATE objective SET kind = 'custom', custom_fields = :fields, allow_learner_confirmation = true WHERE id = :id"
        ).bindparams(sa.bindparam("fields", type_=sa.JSON()))
        bind.execute(update_objective, {"fields": fields, "id": row["id"]})
    # Normalize the old media vocabulary without changing the shape of stored fields.
    for row in bind.execute(sa.text("SELECT id, custom_fields FROM objective WHERE custom_fields IS NOT NULL")).mappings():
        fields = row["custom_fields"] or []
        if isinstance(fields, str):
            fields = json.loads(fields)
        changed = False
        for field in fields:
            allowed = field.get("allowed_types") or []
            normalized = ["document" if item == "pdf" else item for item in allowed]
            if normalized != allowed:
                field["allowed_types"] = normalized
                changed = True
        if changed:
            update_fields = sa.text("UPDATE objective SET custom_fields = :fields WHERE id = :id").bindparams(
                sa.bindparam("fields", type_=sa.JSON())
            )
            bind.execute(update_fields, {"fields": fields, "id": row["id"]})


def downgrade() -> None:
    op.drop_column("programassignment", "collaborators")
    op.drop_column("programassignment", "definition_audit")
    op.drop_column("programassignment", "definition_version")

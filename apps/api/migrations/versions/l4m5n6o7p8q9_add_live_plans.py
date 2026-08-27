"""add standalone live plans

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
"""

from datetime import date
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "l4m5n6o7p8q9"
down_revision = "k3l4m5n6o7p8"
branch_labels = None
depends_on = None


def _uuid(prefix: str) -> str:
    return f"{prefix}_{uuid4()}"


def _as_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def upgrade() -> None:
    op.create_table(
        "plan",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plan_uuid", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("subject_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_program_id", sa.Integer(), sa.ForeignKey("program.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_assignment_id", sa.Integer(), sa.ForeignKey("programassignment.id", ondelete="SET NULL"), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("plan_uuid"),
        sa.UniqueConstraint("slug"),
    )
    for column in ("plan_uuid", "slug", "status", "subject_user_id", "owner_user_id", "source_org_id", "source_program_id", "source_assignment_id"):
        op.create_index(f"ix_plan_{column}", "plan", [column])

    op.create_table(
        "planrole",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("grantable_role_keys", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("role_uuid"), sa.UniqueConstraint("plan_id", "key"),
    )
    op.create_index("ix_planrole_role_uuid", "planrole", ["role_uuid"])
    op.create_index("ix_planrole_plan_id", "planrole", ["plan_id"])

    op.create_table(
        "plancollaborator",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("collaborator_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("planrole.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("collaborator_uuid"), sa.UniqueConstraint("plan_id", "user_id"),
    )
    for column in ("collaborator_uuid", "plan_id", "user_id", "role_id"):
        op.create_index(f"ix_plancollaborator_{column}", "plancollaborator", [column])

    op.create_table(
        "planphase",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phase_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("phase_uuid"),
    )
    op.create_index("ix_planphase_phase_uuid", "planphase", ["phase_uuid"])
    op.create_index("ix_planphase_plan_id", "planphase", ["plan_id"])

    op.create_table(
        "planobjective",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("objective_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phase_id", sa.Integer(), sa.ForeignKey("planphase.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_objective_id", sa.Integer(), sa.ForeignKey("objective.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("kind", sa.String(), nullable=False, server_default="custom"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True),
        sa.Column("badge_major_version", sa.Integer(), nullable=True),
        sa.Column("fields", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("allow_late", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("objective_uuid"),
    )
    for column in ("objective_uuid", "plan_id", "phase_id", "source_objective_id", "kind", "badge_id", "due_date"):
        op.create_index(f"ix_planobjective_{column}", "planobjective", [column])

    op.create_table(
        "planobjectiveprogress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("progress_uuid", sa.String(), nullable=False),
        sa.Column("plan_objective_id", sa.Integer(), sa.ForeignKey("planobjective.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="not_started"),
        sa.Column("field_values", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("subject_note", sa.String(), nullable=False, server_default=""),
        sa.Column("reviewer_note", sa.String(), nullable=False, server_default=""),
        sa.Column("feedback_history", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("progress_uuid"), sa.UniqueConstraint("plan_objective_id"),
    )
    for column in ("progress_uuid", "plan_objective_id", "status"):
        op.create_index(f"ix_planobjectiveprogress_{column}", "planobjectiveprogress", [column])

    op.create_table(
        "planinvitation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invitation_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("email_normalized", sa.String(), nullable=False),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("planrole.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("invited_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("viewed_at", sa.DateTime(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("invitation_uuid"),
    )
    for column in ("invitation_uuid", "plan_id", "kind", "email_normalized", "target_user_id", "role_id", "status", "invited_by_user_id"):
        op.create_index(f"ix_planinvitation_{column}", "planinvitation", [column])

    op.create_table(
        "planattachment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("mediaasset.id", ondelete="CASCADE"), nullable=False),
        sa.Column("added_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("plan_id", "asset_id"),
    )
    op.create_index("ix_planattachment_plan_id", "planattachment", ["plan_id"])
    op.create_index("ix_planattachment_asset_id", "planattachment", ["asset_id"])

    op.create_table(
        "planactivity",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("activity_uuid", sa.String(), nullable=False),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plan.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("activity_uuid"),
    )
    for column in ("activity_uuid", "plan_id", "actor_user_id", "action"):
        op.create_index(f"ix_planactivity_{column}", "planactivity", [column])

    op.add_column("learningrun", sa.Column("plan_id", sa.Integer(), nullable=True))
    op.add_column("learningrun", sa.Column("plan_objective_id", sa.Integer(), nullable=True))
    op.create_index("ix_learningrun_plan_id", "learningrun", ["plan_id"])
    op.create_index("ix_learningrun_plan_objective_id", "learningrun", ["plan_objective_id"])
    op.create_foreign_key("fk_learningrun_plan", "learningrun", "plan", ["plan_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_learningrun_plan_objective", "learningrun", "planobjective", ["plan_objective_id"], ["id"], ondelete="SET NULL")

    _backfill()


def _backfill() -> None:
    connection = op.get_bind()
    assignments = connection.execute(sa.text("SELECT * FROM programassignment ORDER BY id")).mappings().all()
    for assignment in assignments:
        program = connection.execute(sa.text("SELECT * FROM program WHERE id=:id"), {"id": assignment["program_id"]}).mappings().first()
        if not program:
            continue
        owner_id = assignment.get("created_by_user_id") or program.get("created_by_user_id")
        if not owner_id:
            owner_id = connection.execute(sa.text(
                "SELECT uo.user_id FROM userorganization uo WHERE uo.org_id=:org_id ORDER BY CASE WHEN uo.role_id IN (1,2) THEN 0 ELSE 1 END, uo.user_id LIMIT 1"
            ), {"org_id": assignment["org_id"]}).scalar()
        if not owner_id:
            continue
        participants = connection.execute(sa.text("SELECT * FROM programparticipant WHERE assignment_id=:id"), {"id": assignment["id"]}).mappings().all()
        for participant in participants:
            _backfill_participant(connection, program, assignment, participant, int(owner_id))


def _backfill_participant(connection, program, assignment, participant, owner_id: int) -> None:
    status_map = {"invited": "pending", "active": "active", "completed": "completed", "declined": "archived", "left": "archived"}
    now = participant.get("update_date") or participant.get("creation_date") or program.get("update_date") or ""
    plan_uuid = _uuid("plan")
    slug = f"{program.get('slug') or 'plan'}-{str(participant['participant_uuid']).split('_')[-1][:8]}"
    result = connection.execute(sa.text(
        "INSERT INTO plan (plan_uuid,slug,name,description,status,priority,subject_user_id,owner_user_id,source_org_id,source_program_id,source_assignment_id,start_date,due_date,creation_date,update_date) "
        "VALUES (:uuid,:slug,:name,:description,:status,1,:subject,:owner,:org,:program,:assignment,:start,:due,:created,:updated) RETURNING id"
    ), {
        "uuid": plan_uuid, "slug": slug, "name": program["name"], "description": program.get("description") or "",
        "status": status_map.get(str(participant.get("status")), "archived"), "subject": participant["user_id"], "owner": owner_id,
        "org": assignment["org_id"], "program": program["id"], "assignment": assignment["id"],
        "start": _as_date(assignment.get("start_date")), "due": _as_date(assignment.get("due_date")),
        "created": participant.get("creation_date") or "", "updated": now,
    })
    plan_id = result.scalar_one()
    caps = {
        "subject": ["view_plan", "comment", "contribute_fields", "update_progress", "request_collaborators"],
        "reviewer": ["view_plan", "comment", "contribute_fields", "update_progress", "contribute_reviewer_fields", "review_objectives", "review_badge_submissions"],
        "plan_admin": ["view_plan", "comment", "contribute_fields", "update_progress", "contribute_reviewer_fields", "review_objectives", "review_badge_submissions", "edit_plan_details", "edit_structure", "edit_schedule", "complete_plan", "archive_plan", "manage_collaborators", "manage_roles"],
        "viewer": ["view_plan"],
    }
    role_ids = {}
    for key, name in (("subject", "Subject"), ("reviewer", "Reviewer"), ("plan_admin", "Plan admin"), ("viewer", "Viewer")):
        role_insert = sa.text(
            "INSERT INTO planrole (role_uuid,plan_id,key,name,capabilities,grantable_role_keys,creation_date,update_date) VALUES (:uuid,:plan,:key,:name,:caps,:grants,:created,:updated) RETURNING id"
        ).bindparams(
            sa.bindparam("caps", type_=sa.JSON()),
            sa.bindparam("grants", type_=sa.JSON()),
        )
        role_ids[key] = connection.execute(
            role_insert,
            {"uuid": _uuid("plan_role"), "plan": plan_id, "key": key, "name": name, "caps": caps[key], "grants": ["subject", "reviewer", "viewer"] if key == "plan_admin" else [], "created": now, "updated": now},
        ).scalar_one()
    collaborator_roles = {owner_id: "plan_admin"}
    if str(participant.get("status")) in {"active", "completed"}:
        collaborator_roles.setdefault(int(participant["user_id"]), "subject")
    for staff_id in assignment.get("staff_user_ids") or []:
        collaborator_roles.setdefault(int(staff_id), "reviewer")
    for user_id, role_key in collaborator_roles.items():
        connection.execute(sa.text(
            "INSERT INTO plancollaborator (collaborator_uuid,plan_id,user_id,role_id,active,creation_date,update_date) VALUES (:uuid,:plan,:user,:role,true,:created,:updated)"
        ), {"uuid": _uuid("plan_collaborator"), "plan": plan_id, "user": user_id, "role": role_ids[role_key], "created": now, "updated": now})

    schedule = assignment.get("schedule") or {}
    phase_schedule = {item.get("phase_uuid"): item for item in schedule.get("phases", [])}
    objective_schedule = {item.get("objective_uuid"): item for item in schedule.get("objectives", [])}
    phase_ids = {}
    snapshots = assignment.get("objective_snapshot") or []
    phase_keys = []
    for item in snapshots:
        key = item.get("phase_uuid") or "legacy"
        if key not in phase_keys:
            phase_keys.append(key)
    for position, key in enumerate(phase_keys or ["legacy"]):
        scheduled = phase_schedule.get(key, {})
        phase_ids[key] = connection.execute(sa.text(
            "INSERT INTO planphase (phase_uuid,plan_id,name,description,position,start_date,due_date,creation_date,update_date) VALUES (:uuid,:plan,:name,'',:position,:start,:due,:created,:updated) RETURNING id"
        ), {"uuid": _uuid("plan_phase"), "plan": plan_id, "name": next((i.get("phase_name") for i in snapshots if (i.get("phase_uuid") or "legacy") == key), None) or "Phase 1", "position": position, "start": _as_date(scheduled.get("start_date")), "due": _as_date(scheduled.get("end_date")), "created": now, "updated": now}).scalar_one()
    for position, snapshot in enumerate(snapshots):
        sched = objective_schedule.get(snapshot.get("objective_uuid"), {})
        fields = []
        for field in snapshot.get("custom_fields") or []:
            fields.append({**field, "access": "either" if field.get("allow_student_upload") else "reviewer"})
        objective_insert = sa.text(
            "INSERT INTO planobjective (objective_uuid,plan_id,phase_id,source_objective_id,title,description,kind,position,priority,badge_id,badge_major_version,fields,start_date,due_date,allow_late,blocked,creation_date,update_date) "
            "VALUES (:uuid,:plan,:phase,:source,:title,:description,:kind,:position,1,:badge,:major,:fields,:start,:due,:late,false,:created,:updated) RETURNING id"
        ).bindparams(sa.bindparam("fields", type_=sa.JSON()))
        objective_id = connection.execute(
            objective_insert,
            {"uuid": _uuid("plan_objective"), "plan": plan_id, "phase": phase_ids[snapshot.get("phase_uuid") or "legacy"], "source": snapshot.get("id"), "title": snapshot.get("title") or "Objective", "description": snapshot.get("description") or "", "kind": snapshot.get("kind") or "custom", "position": position, "badge": snapshot.get("badge_id"), "major": snapshot.get("badge_major_version"), "fields": fields, "start": _as_date(sched.get("effective_start_date")), "due": _as_date(sched.get("effective_due_date")), "late": bool(sched.get("allow_late")), "created": now, "updated": now},
        ).scalar_one()
        old_progress = connection.execute(sa.text(
            "SELECT * FROM objectiveprogress WHERE org_id=:org AND objective_id=:objective AND user_id=:user LIMIT 1"
        ), {"org": assignment["org_id"], "objective": snapshot.get("id"), "user": participant["user_id"]}).mappings().first()
        old_status = str(old_progress.get("status")) if old_progress else "not_started"
        mapped = {"flagged": "changes_requested", "ready_for_review": "submitted"}.get(old_status, old_status)
        progress_insert = sa.text(
            "INSERT INTO planobjectiveprogress (progress_uuid,plan_objective_id,status,field_values,subject_note,reviewer_note,feedback_history,completed_at,updated_by_user_id,creation_date,update_date) "
            "VALUES (:uuid,:objective,:status,:values,:subject_note,:reviewer_note,:history,:completed,:updated_by,:created,:updated)"
        ).bindparams(
            sa.bindparam("values", type_=sa.JSON()),
            sa.bindparam("history", type_=sa.JSON()),
        )
        connection.execute(
            progress_insert,
            {"uuid": _uuid("plan_progress"), "objective": objective_id, "status": mapped, "values": {"legacy_evidence": old_progress.get("evidence") or []} if old_progress else {}, "subject_note": old_progress.get("learner_note") or "" if old_progress else "", "reviewer_note": old_progress.get("staff_note") or "" if old_progress else "", "history": old_progress.get("feedback_history") or [] if old_progress else [], "completed": old_progress.get("completed_at") if old_progress else None, "updated_by": old_progress.get("completed_by_user_id") if old_progress else None, "created": old_progress.get("creation_date") or now if old_progress else now, "updated": old_progress.get("update_date") or now if old_progress else now},
        )
    invitation_status = {"invited": "pending", "declined": "declined", "left": "revoked"}.get(str(participant.get("status")))
    if invitation_status:
        user = connection.execute(sa.text('SELECT email FROM "user" WHERE id=:id'), {"id": participant["user_id"]}).mappings().first()
        if user:
            connection.execute(sa.text(
                "INSERT INTO planinvitation (invitation_uuid,plan_id,kind,email,email_normalized,target_user_id,role_id,status,invited_by_user_id,viewed_at,responded_at,creation_date,update_date) "
                "VALUES (:uuid,:plan,'subject',:email,:normalized,:user,:role,:status,:inviter,:viewed,:responded,:created,:updated)"
            ), {"uuid": _uuid("plan_invitation"), "plan": plan_id, "email": user["email"], "normalized": str(user["email"]).strip().lower(), "user": participant["user_id"], "role": role_ids["subject"], "status": invitation_status, "inviter": owner_id, "viewed": participant.get("viewed_at"), "responded": participant.get("responded_at"), "created": participant.get("creation_date") or now, "updated": now})


def downgrade() -> None:
    op.drop_constraint("fk_learningrun_plan_objective", "learningrun", type_="foreignkey")
    op.drop_constraint("fk_learningrun_plan", "learningrun", type_="foreignkey")
    op.drop_index("ix_learningrun_plan_objective_id", table_name="learningrun")
    op.drop_index("ix_learningrun_plan_id", table_name="learningrun")
    op.drop_column("learningrun", "plan_objective_id")
    op.drop_column("learningrun", "plan_id")
    for table in ("planactivity", "planattachment", "planinvitation", "planobjectiveprogress", "planobjective", "planphase", "plancollaborator", "planrole", "plan"):
        op.drop_table(table)

"""retire badge learning paths

Revision ID: w7x8y9z0a1b2
Revises: v6z7a8b9c0d1

Badges are earned by finishing a plan made from one of their routes (plan
templates); activities live on those templates' objectives. This retires the
old model in which a badge owned a learning path of activities:

1. Every badge whose published version still has a path, and no routes yet,
   gets a route: an in-order plan template with one activity objective per path
   activity. The activities are moved onto the objectives, not copied.
2. Learner runs that were not on a plan step (badge path runs and guest runs)
   are deleted with their page progress and answers. Awards are kept.
3. Activities still on no objective (older badge versions, the onboarding
   badge) are deleted, as are the onboarding badge and its collection:
   onboarding is now the Launch Ready starter plan.
4. The path table, notification sign-ups, guest sessions and the
   badge/path/version/guest columns are dropped, as are badges' and
   collections' system flags (only the onboarding badge used them).
   Templates gain ``system_type`` instead: "starter" marks the Launch Ready
   starter plan template, whose activities may write to the portfolio.
5. A run plays one activity, so the per-activity run table folds into the
   run: its route, result and outcome receipts move to the run's data.

Downgrade restores the schema only; deleted rows are not restored.
"""

import json
from datetime import datetime
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "w7x8y9z0a1b2"
down_revision = "v6z7a8b9c0d1"
branch_labels = None
depends_on = None

# Frozen copy of the default plan roles at the time of this migration.
ROLE_DEFINITIONS = [
    {"key": "subject", "name": "Learner", "capabilities": ["view_plan", "comment", "contribute_fields", "update_progress", "request_collaborators"], "grantable_role_keys": []},
    {"key": "reviewer", "name": "Reviewer", "capabilities": ["view_plan", "comment", "contribute_fields", "update_progress", "contribute_restricted_fields", "complete_restricted_objectives", "review_badge_submissions"], "grantable_role_keys": []},
    {"key": "plan_admin", "name": "Plan admin", "capabilities": ["archive_plan", "comment", "complete_plan", "complete_restricted_objectives", "contribute_fields", "contribute_restricted_fields", "edit_plan_details", "edit_schedule", "edit_structure", "manage_collaborators", "manage_roles", "request_collaborators", "review_badge_submissions", "update_progress", "view_plan"], "grantable_role_keys": []},
    {"key": "viewer", "name": "Viewer", "capabilities": ["view_plan"], "grantable_role_keys": []},
]


def _convert_paths(bind) -> None:
    now = datetime.now().isoformat()
    badges = bind.execute(sa.text("""
        SELECT b.id, b.badge_uuid, b.org_id, b.name, coalesce(b.description, '') AS description, p.id AS path_id
        FROM learningbadge b JOIN learningpath p ON p.badge_id = b.id AND p.version_id = b.active_version_id
        WHERE b.deleted_at IS NULL AND coalesce(b.system_type, '') <> 'onboarding'
          AND NOT EXISTS (SELECT 1 FROM badgeroute r WHERE r.badge_id = b.id)
          AND EXISTS (SELECT 1 FROM learningactivity a WHERE a.path_id = p.id)
    """)).mappings().all()
    for badge in badges:
        program_id = bind.execute(sa.text("""
            INSERT INTO program (program_uuid, slug, org_id, name, description, thumbnail_image, instructions, role_definitions,
                                 default_subject_role_key, default_staff_role_key, status, version, step_order, creation_date, update_date)
            VALUES (:uuid, :slug, :org_id, :name, :description, '', '', :roles, 'subject', 'reviewer', 'active', 1, 'in_order', :now, :now)
            RETURNING id
        """), {
            "uuid": f"program_{uuid4()}", "slug": f"badge-{badge['badge_uuid'].removeprefix('badge_')}-{uuid4().hex[:6]}",
            "org_id": badge["org_id"], "name": badge["name"], "description": badge["description"], "roles": json.dumps(ROLE_DEFINITIONS), "now": now,
        }).scalar_one()
        phase_id = bind.execute(sa.text("""
            INSERT INTO programphase (phase_uuid, program_id, name, description, position, creation_date, update_date)
            VALUES (:uuid, :program_id, 'Steps', '', 0, :now, :now) RETURNING id
        """), {"uuid": f"program_phase_{uuid4()}", "program_id": program_id, "now": now}).scalar_one()
        activities = bind.execute(sa.text(
            "SELECT id, title, coalesce(description, '') AS description FROM learningactivity WHERE path_id = :path_id ORDER BY \"order\", id"
        ), {"path_id": badge["path_id"]}).mappings().all()
        for position, activity in enumerate(activities):
            objective_id = bind.execute(sa.text("""
                INSERT INTO objective (objective_uuid, org_id, title, description, kind, completion_policy, evidence_policy,
                                       allow_learner_confirmation, reviewer_guidance, archived, creation_date, update_date)
                VALUES (:uuid, :org_id, :title, :description, 'activity', 'either', 'none', true, '', false, :now, :now) RETURNING id
            """), {"uuid": f"objective_{uuid4()}", "org_id": badge["org_id"], "title": activity["title"], "description": activity["description"], "now": now}).scalar_one()
            bind.execute(sa.text("""
                INSERT INTO programobjective (program_id, phase_id, objective_id, position, accept_previous_major_versions,
                                              default_start_rule, default_due_rule, default_allow_late, creation_date, update_date)
                VALUES (:program_id, :phase_id, :objective_id, :position, false, 'any_time', 'phase_end', false, :now, :now)
            """), {"program_id": program_id, "phase_id": phase_id, "objective_id": objective_id, "position": position, "now": now})
            bind.execute(sa.text("UPDATE learningactivity SET objective_id = :objective_id WHERE id = :id"), {"objective_id": objective_id, "id": activity["id"]})
        bind.execute(sa.text("""
            INSERT INTO badgeroute (route_uuid, badge_id, program_id, recommended, position, creation_date, update_date)
            VALUES (:uuid, :badge_id, :program_id, true, 0, :now, :now)
        """), {"uuid": f"badge_route_{uuid4()}", "badge_id": badge["id"], "program_id": program_id, "now": now})


def _merge_activity_runs(bind) -> None:
    """A run plays one activity, so its per-activity row folds into the run.

    The route, completion result and outcome receipts move into the run's data,
    and portfolio items an outcome wrote point at the run instead.
    """
    if bind.dialect.name == "postgresql":
        # Databases built by create_all store run status as an enum, migrated ones as varchar.
        status_type = bind.execute(sa.text(
            "SELECT udt_name FROM information_schema.columns WHERE table_name = 'learningrun' AND column_name = 'status'"
        )).scalar()
        bind.execute(sa.text(
            "UPDATE learningrun r SET data = (coalesce(r.data::jsonb, '{}'::jsonb) || coalesce(ar.data::jsonb, '{}'::jsonb))::json, "
            f"status = ar.status::text::{status_type}, completed_at = ar.completed_at "
            "FROM learningactivityrun ar WHERE ar.run_id = r.id AND ar.activity_id = r.activity_id"
        ))
    for table in ("projectitem", "timelineentry", "profiletrait"):
        bind.execute(sa.text(
            f"UPDATE {table} SET source_reference = 'learning_run:' || ar.run_id || substr({table}.source_reference, length('learning_activity_run:' || ar.id) + 1) "
            f"FROM learningactivityrun ar WHERE {table}.source_reference LIKE 'learning_activity_run:' || ar.id || ':%'"
        ))


def _replace_run_plan_foreign_keys(bind, ondelete: str) -> None:
    """Point the run's plan and step keys at their rows with ``ondelete``.

    Migrated databases named these keys fk_learningrun_plan(_objective); schemas
    built from the models use PostgreSQL's learningrun_<column>_fkey. Drop
    whatever is there by looking it up.
    """
    existing = sa.inspect(bind).get_foreign_keys("learningrun")
    for column, target in (("plan_id", "plan"), ("plan_objective_id", "planobjective")):
        for key in existing:
            if key["constrained_columns"] == [column] and key.get("name"):
                op.drop_constraint(key["name"], "learningrun", type_="foreignkey")
        op.create_foreign_key(f"learningrun_{column}_fkey", "learningrun", target, [column], ["id"], ondelete=ondelete)


def upgrade() -> None:
    bind = op.get_bind()
    _convert_paths(bind)
    bind.execute(sa.text("DELETE FROM learningrun WHERE plan_id IS NULL OR plan_objective_id IS NULL OR activity_id IS NULL OR user_id IS NULL"))
    bind.execute(sa.text("DELETE FROM learningresponseattempt WHERE user_id IS NULL"))
    bind.execute(sa.text("DELETE FROM learningactivity WHERE objective_id IS NULL"))
    bind.execute(sa.text("DELETE FROM learningbadge WHERE badge_uuid = 'badge_system_onboarding'"))
    # Keys only the old versioning and onboarding badge used.
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("UPDATE learningactivity SET settings = (settings::jsonb - 'version_lineage_uuid' - 'system_required')::json"))
        bind.execute(sa.text("UPDATE learningpage SET content = (content::jsonb - 'version_lineage_uuid')::json"))
    bind.execute(sa.text("DELETE FROM badgecollection WHERE collection_uuid = 'badge_collection_system_onboarding'"))
    _merge_activity_runs(bind)

    op.drop_column("learningbadgeaward", "run_id")
    op.drop_column("learningactivitypreview", "badge_id")
    for column in ("badge_id", "path_id", "badge_version_id", "program_assignment_id", "program_participant_id", "issuer_learner_link_id", "guest_session_id"):
        op.drop_column("learningrun", column)
    op.drop_column("learningresponseattempt", "guest_session_id")
    for column in ("path_id", "badge_id", "version_id", "order", "required", "published"):
        op.drop_column("learningactivity", column)
    for column in ("badge_id", "version_id"):
        op.drop_column("learningpage", column)
    op.drop_index("ix_learningpageprogress_activity_run_id", table_name="learningpageprogress")
    op.drop_column("learningpageprogress", "activity_run_id")
    op.drop_table("learningactivityrun")
    op.drop_table("learningpath")
    op.drop_table("learningbadgenotificationsignup")
    op.drop_table("guestsession")
    for table in ("learningbadge", "badgecollection"):
        op.drop_column(table, "protected")
        op.drop_column(table, "system_type")
    op.add_column("program", sa.Column("system_type", sa.String(), nullable=True))
    op.create_index("ix_program_system_type", "program", ["system_type"])

    op.alter_column("learningactivity", "objective_id", nullable=False)
    for column in ("activity_id", "plan_id", "plan_objective_id", "user_id"):
        op.alter_column("learningrun", column, nullable=False)
    op.alter_column("learningresponseattempt", "user_id", nullable=False)
    # A run belongs to its plan step: it goes when the plan or step goes.
    _replace_run_plan_foreign_keys(bind, "CASCADE")


def downgrade() -> None:
    op.drop_index("ix_program_system_type", table_name="program")
    op.drop_column("program", "system_type")
    for table in ("learningbadge", "badgecollection"):
        op.add_column(table, sa.Column("protected", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.add_column(table, sa.Column("system_type", sa.String(), nullable=True))
    _replace_run_plan_foreign_keys(op.get_bind(), "SET NULL")
    op.alter_column("learningresponseattempt", "user_id", nullable=True)
    for column in ("activity_id", "plan_id", "plan_objective_id", "user_id"):
        op.alter_column("learningrun", column, nullable=True)
    op.alter_column("learningactivity", "objective_id", nullable=True)

    op.create_table(
        "guestsession",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("guest_session_uuid", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
    )
    op.create_index("ix_guestsession_guest_session_uuid", "guestsession", ["guest_session_uuid"], unique=True)
    op.create_table(
        "learningbadgenotificationsignup",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("signup_uuid", sa.String(), nullable=False, index=True),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("badge_id", "user_id"),
    )
    op.create_table(
        "learningpath",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("path_uuid", sa.String(), nullable=False, index=True),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("path_uuid"),
        sa.UniqueConstraint("badge_id", "version_id"),
    )
    for column in ("badge_id", "version_id"):
        target = "learningbadge" if column == "badge_id" else "learningbadgeversion"
        op.add_column("learningpage", sa.Column(column, sa.Integer(), sa.ForeignKey(f"{target}.id", ondelete="CASCADE"), nullable=True, index=True))
    op.add_column("learningactivity", sa.Column("path_id", sa.Integer(), sa.ForeignKey("learningpath.id", ondelete="CASCADE"), nullable=True, index=True))
    op.add_column("learningactivity", sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=True, index=True))
    op.add_column("learningactivity", sa.Column("version_id", sa.Integer(), sa.ForeignKey("learningbadgeversion.id", ondelete="CASCADE"), nullable=True, index=True))
    op.add_column("learningactivity", sa.Column("order", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("learningactivity", sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("learningactivity", sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("learningresponseattempt", sa.Column("guest_session_id", sa.Integer(), sa.ForeignKey("guestsession.id", ondelete="CASCADE"), nullable=True, index=True))
    run_columns = (
        ("badge_id", "learningbadge", "CASCADE"), ("path_id", "learningpath", "CASCADE"), ("badge_version_id", "learningbadgeversion", "RESTRICT"),
        ("program_assignment_id", "programassignment", "SET NULL"), ("program_participant_id", "programparticipant", "SET NULL"),
        ("issuer_learner_link_id", "badgeissuerlearnerlink", "SET NULL"), ("guest_session_id", "guestsession", "CASCADE"),
    )
    for column, target, ondelete in run_columns:
        op.add_column("learningrun", sa.Column(column, sa.Integer(), sa.ForeignKey(f"{target}.id", ondelete=ondelete), nullable=True, index=True))
    op.add_column("learningactivitypreview", sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=True))
    op.add_column("learningbadgeaward", sa.Column("run_id", sa.Integer(), sa.ForeignKey("learningrun.id", ondelete="SET NULL"), nullable=True, index=True))
    op.create_table(
        "learningactivityrun",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("learningrun.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.UniqueConstraint("run_id", "activity_id"),
    )
    op.add_column("learningpageprogress", sa.Column("activity_run_id", sa.Integer(), sa.ForeignKey("learningactivityrun.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_learningpageprogress_activity_run_id", "learningpageprogress", ["activity_run_id"])

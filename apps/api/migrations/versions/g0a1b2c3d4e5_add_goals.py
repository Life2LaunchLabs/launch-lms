"""add goals: stages of typed steps, issued from versioned template documents

Revision ID: g0a1b2c3d4e5
Revises: d4e5f6a7b8c9

The new tables sit alongside the plan tables, unused until the data migration
moves plans across. Runs, activities, requirement credit and the plan
collaboration tables get nullable goal columns so they can point at either.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'g0a1b2c3d4e5'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('goal_template',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('template_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('thumbnail_image', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('system_type', sa.String(), nullable=True),
    sa.Column('document', sa.JSON(), nullable=False),
    sa.Column('published_version_id', sa.Integer(), nullable=True),
    sa.Column('source_template_uuid', sa.String(), nullable=True),
    sa.Column('source_version', sa.Integer(), nullable=True),
    sa.Column('library_document', sa.JSON(), nullable=True),
    sa.Column('library_published_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('template_uuid')
    )
    op.create_index(op.f('ix_goal_template_library_published_at'), 'goal_template', ['library_published_at'], unique=False)
    op.create_index(op.f('ix_goal_template_org_id'), 'goal_template', ['org_id'], unique=False)
    op.create_index(op.f('ix_goal_template_source_template_uuid'), 'goal_template', ['source_template_uuid'], unique=False)
    op.create_index(op.f('ix_goal_template_status'), 'goal_template', ['status'], unique=False)
    op.create_index(op.f('ix_goal_template_system_type'), 'goal_template', ['system_type'], unique=False)
    op.create_index(op.f('ix_goal_template_template_uuid'), 'goal_template', ['template_uuid'], unique=False)
    op.create_table('goal_template_version',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('version_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('template_id', sa.Integer(), nullable=True),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('document', sa.JSON(), nullable=False),
    sa.Column('content_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('note', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('restored_from_number', sa.Integer(), nullable=True),
    sa.Column('private', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('published_by_user_id', sa.Integer(), nullable=True),
    sa.Column('published_at', sa.DateTime(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['published_by_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['template_id'], ['goal_template.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('template_id', 'number'),
    sa.UniqueConstraint('version_uuid')
    )
    op.create_index(op.f('ix_goal_template_version_org_id'), 'goal_template_version', ['org_id'], unique=False)
    op.create_index(op.f('ix_goal_template_version_template_id'), 'goal_template_version', ['template_id'], unique=False)
    op.create_index(op.f('ix_goal_template_version_version_uuid'), 'goal_template_version', ['version_uuid'], unique=False)
    op.create_table('goal_assignment',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('assignment_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.Column('template_id', sa.Integer(), nullable=True),
    sa.Column('version_id', sa.Integer(), nullable=True),
    sa.Column('usergroup_id', sa.Integer(), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('subject_email', sa.String(), nullable=True),
    sa.Column('welcome_message', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('staff_user_ids', sa.JSON(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('stage_dates', sa.JSON(), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('owner_user_id', sa.Integer(), nullable=True),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['template_id'], ['goal_template.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usergroup_id'], ['usergroup.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['version_id'], ['goal_template_version.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('assignment_uuid')
    )
    op.create_index(op.f('ix_goal_assignment_assignment_uuid'), 'goal_assignment', ['assignment_uuid'], unique=False)
    op.create_index(op.f('ix_goal_assignment_org_id'), 'goal_assignment', ['org_id'], unique=False)
    op.create_index(op.f('ix_goal_assignment_owner_user_id'), 'goal_assignment', ['owner_user_id'], unique=False)
    op.create_index(op.f('ix_goal_assignment_subject_email'), 'goal_assignment', ['subject_email'], unique=False)
    op.create_index(op.f('ix_goal_assignment_template_id'), 'goal_assignment', ['template_id'], unique=False)
    op.create_index(op.f('ix_goal_assignment_user_id'), 'goal_assignment', ['user_id'], unique=False)
    op.create_index(op.f('ix_goal_assignment_usergroup_id'), 'goal_assignment', ['usergroup_id'], unique=False)
    op.create_index(op.f('ix_goal_assignment_version_id'), 'goal_assignment', ['version_id'], unique=False)
    op.create_table('goal',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('goal_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.Column('owner_user_id', sa.Integer(), nullable=True),
    sa.Column('subject_user_id', sa.Integer(), nullable=True),
    sa.Column('ownership', sa.String(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('template_id', sa.Integer(), nullable=True),
    sa.Column('version_id', sa.Integer(), nullable=True),
    sa.Column('assignment_id', sa.Integer(), nullable=True),
    sa.Column('badge_id', sa.Integer(), nullable=True),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('step_order', sa.String(), server_default='any', nullable=False),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('target_date', sa.Date(), nullable=True),
    sa.Column('finished_at', sa.DateTime(), nullable=True),
    sa.Column('finish', sa.JSON(), nullable=False),
    sa.Column('celebrated_at', sa.DateTime(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['assignment_id'], ['goal_assignment.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['badge_id'], ['learningbadge.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['owner_user_id'], ['user.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['subject_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['template_id'], ['goal_template.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['version_id'], ['goal_template_version.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('goal_uuid')
    )
    op.create_index(op.f('ix_goal_assignment_id'), 'goal', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_goal_badge_id'), 'goal', ['badge_id'], unique=False)
    op.create_index(op.f('ix_goal_goal_uuid'), 'goal', ['goal_uuid'], unique=False)
    op.create_index(op.f('ix_goal_org_id'), 'goal', ['org_id'], unique=False)
    op.create_index(op.f('ix_goal_owner_user_id'), 'goal', ['owner_user_id'], unique=False)
    op.create_index(op.f('ix_goal_ownership'), 'goal', ['ownership'], unique=False)
    op.create_index(op.f('ix_goal_source'), 'goal', ['source'], unique=False)
    op.create_index(op.f('ix_goal_status'), 'goal', ['status'], unique=False)
    op.create_index(op.f('ix_goal_subject_user_id'), 'goal', ['subject_user_id'], unique=False)
    op.create_index(op.f('ix_goal_template_id'), 'goal', ['template_id'], unique=False)
    op.create_index(op.f('ix_goal_version_id'), 'goal', ['version_id'], unique=False)
    op.create_table('goal_stage',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('stage_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('goal_id', sa.Integer(), nullable=True),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('timing', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('template_key', sa.String(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['goal_id'], ['goal.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('stage_uuid')
    )
    op.create_index(op.f('ix_goal_stage_goal_id'), 'goal_stage', ['goal_id'], unique=False)
    op.create_index(op.f('ix_goal_stage_stage_uuid'), 'goal_stage', ['stage_uuid'], unique=False)
    op.create_table('goal_story',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('story_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('goal_id', sa.Integer(), nullable=True),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('slides', sa.JSON(), nullable=False),
    sa.Column('inputs_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('model', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('error', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['goal_id'], ['goal.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('goal_id', 'version'),
    sa.UniqueConstraint('story_uuid')
    )
    op.create_index(op.f('ix_goal_story_goal_id'), 'goal_story', ['goal_id'], unique=False)
    op.create_index(op.f('ix_goal_story_story_uuid'), 'goal_story', ['story_uuid'], unique=False)
    op.create_table('goal_step',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('step_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('goal_id', sa.Integer(), nullable=True),
    sa.Column('stage_id', sa.Integer(), nullable=True),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('config', sa.JSON(), nullable=False),
    sa.Column('materials', sa.JSON(), nullable=False),
    sa.Column('completed_by', sa.String(), nullable=False),
    sa.Column('review_required', sa.Boolean(), nullable=False),
    sa.Column('reviewer_guidance', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('allow_late', sa.Boolean(), nullable=False),
    sa.Column('held', sa.Boolean(), nullable=False),
    sa.Column('after_step_uuids', sa.JSON(), nullable=False),
    sa.Column('requirement_links', sa.JSON(), nullable=False),
    sa.Column('activity_id', sa.Integer(), nullable=True),
    sa.Column('badge_id', sa.Integer(), nullable=True),
    sa.Column('template_key', sa.String(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['activity_id'], ['learningactivity.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['badge_id'], ['learningbadge.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['goal_id'], ['goal.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['stage_id'], ['goal_stage.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('step_uuid')
    )
    op.create_index(op.f('ix_goal_step_activity_id'), 'goal_step', ['activity_id'], unique=False)
    op.create_index(op.f('ix_goal_step_badge_id'), 'goal_step', ['badge_id'], unique=False)
    op.create_index(op.f('ix_goal_step_due_date'), 'goal_step', ['due_date'], unique=False)
    op.create_index(op.f('ix_goal_step_goal_id'), 'goal_step', ['goal_id'], unique=False)
    op.create_index(op.f('ix_goal_step_stage_id'), 'goal_step', ['stage_id'], unique=False)
    op.create_index(op.f('ix_goal_step_step_uuid'), 'goal_step', ['step_uuid'], unique=False)
    op.create_index(op.f('ix_goal_step_type'), 'goal_step', ['type'], unique=False)
    op.create_table('step_entry',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('entry_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('step_id', sa.Integer(), nullable=True),
    sa.Column('kind', sa.String(), nullable=False),
    sa.Column('slot', sa.String(), nullable=True),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('url', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('asset_id', sa.Integer(), nullable=True),
    sa.Column('resource_uuid', sa.String(), nullable=True),
    sa.Column('note', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('done', sa.Boolean(), nullable=False),
    sa.Column('period_start', sa.Date(), nullable=True),
    sa.Column('follow_up_status', sa.String(), nullable=True),
    sa.Column('follow_up_due', sa.Date(), nullable=True),
    sa.Column('data', sa.JSON(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id'], ['mediaasset.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['step_id'], ['goal_step.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('entry_uuid')
    )
    op.create_index(op.f('ix_step_entry_asset_id'), 'step_entry', ['asset_id'], unique=False)
    op.create_index(op.f('ix_step_entry_entry_uuid'), 'step_entry', ['entry_uuid'], unique=False)
    op.create_index(op.f('ix_step_entry_period_start'), 'step_entry', ['period_start'], unique=False)
    op.create_index(op.f('ix_step_entry_step_id'), 'step_entry', ['step_id'], unique=False)
    op.create_table('step_progress',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('progress_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('step_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('submission', sa.JSON(), nullable=False),
    sa.Column('answer', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('learner_note', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('reviewer_note', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('feedback_history', sa.JSON(), nullable=False),
    sa.Column('staff_notes', sa.JSON(), nullable=False),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('completed_by_user_id', sa.Integer(), nullable=True),
    sa.Column('completion_method', sa.String(), nullable=True),
    sa.Column('updated_by_user_id', sa.Integer(), nullable=True),
    sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    sa.ForeignKeyConstraint(['completed_by_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['step_id'], ['goal_step.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['updated_by_user_id'], ['user.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('progress_uuid'),
    sa.UniqueConstraint('step_id')
    )
    op.create_index(op.f('ix_step_progress_progress_uuid'), 'step_progress', ['progress_uuid'], unique=False)
    op.create_index(op.f('ix_step_progress_status'), 'step_progress', ['status'], unique=False)
    op.create_index(op.f('ix_step_progress_step_id'), 'step_progress', ['step_id'], unique=False)
    op.add_column('learningactivity', sa.Column('goal_template_id', sa.Integer(), nullable=True))
    op.add_column('learningactivity', sa.Column('frozen_from_id', sa.Integer(), nullable=True))
    op.add_column('learningactivity', sa.Column('frozen_hash', sa.String(), nullable=True))
    op.alter_column('learningactivity', 'objective_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.create_index(op.f('ix_learningactivity_frozen_from_id'), 'learningactivity', ['frozen_from_id'], unique=False)
    op.create_index(op.f('ix_learningactivity_goal_template_id'), 'learningactivity', ['goal_template_id'], unique=False)
    op.create_foreign_key('fk_learningactivity_goal_template_id', 'learningactivity', 'goal_template', ['goal_template_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_learningactivity_frozen_from_id', 'learningactivity', 'learningactivity', ['frozen_from_id'], ['id'], ondelete='SET NULL')
    op.add_column('learningrun', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.add_column('learningrun', sa.Column('goal_step_id', sa.Integer(), nullable=True))
    op.alter_column('learningrun', 'plan_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.alter_column('learningrun', 'plan_objective_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.create_index(op.f('ix_learningrun_goal_id'), 'learningrun', ['goal_id'], unique=False)
    op.create_index(op.f('ix_learningrun_goal_step_id'), 'learningrun', ['goal_step_id'], unique=False)
    op.create_foreign_key('fk_learningrun_goal_id', 'learningrun', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_learningrun_goal_step_id', 'learningrun', 'goal_step', ['goal_step_id'], ['id'], ondelete='CASCADE')
    op.add_column('planactivity', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_planactivity_goal_id'), 'planactivity', ['goal_id'], unique=False)
    op.create_foreign_key('fk_planactivity_goal_id', 'planactivity', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.add_column('planattachment', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_planattachment_goal_id'), 'planattachment', ['goal_id'], unique=False)
    op.create_unique_constraint('uq_planattachment_goal_id_asset_id', 'planattachment', ['goal_id', 'asset_id'])
    op.create_foreign_key('fk_planattachment_goal_id', 'planattachment', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.add_column('plancollaborator', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_plancollaborator_goal_id'), 'plancollaborator', ['goal_id'], unique=False)
    op.create_unique_constraint('uq_plancollaborator_goal_id_user_id', 'plancollaborator', ['goal_id', 'user_id'])
    op.create_foreign_key('fk_plancollaborator_goal_id', 'plancollaborator', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.add_column('plancollaboratorrequest', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_plancollaboratorrequest_goal_id'), 'plancollaboratorrequest', ['goal_id'], unique=False)
    op.create_foreign_key('fk_plancollaboratorrequest_goal_id', 'plancollaboratorrequest', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.add_column('planinvitation', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_planinvitation_goal_id'), 'planinvitation', ['goal_id'], unique=False)
    op.create_foreign_key('fk_planinvitation_goal_id', 'planinvitation', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.add_column('planrole', sa.Column('goal_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_planrole_goal_id'), 'planrole', ['goal_id'], unique=False)
    op.create_unique_constraint('uq_planrole_goal_id_key', 'planrole', ['goal_id', 'key'])
    op.create_foreign_key('fk_planrole_goal_id', 'planrole', 'goal', ['goal_id'], ['id'], ondelete='CASCADE')
    op.add_column('requirementattainmentsource', sa.Column('step_progress_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_requirementattainmentsource_step_progress_id'), 'requirementattainmentsource', ['step_progress_id'], unique=False)
    op.create_unique_constraint('uq_requirementsource_step_progress', 'requirementattainmentsource', ['enrollment_id', 'node_uuid', 'step_progress_id'])
    op.create_foreign_key('fk_requirementattainmentsource_step_progress_id', 'requirementattainmentsource', 'step_progress', ['step_progress_id'], ['id'], ondelete='CASCADE')
    # Goal rows in the collaboration tables have no plan; plan_id goes when the plan tables are dropped.
    for table in ("planrole", "plancollaborator", "planinvitation", "plancollaboratorrequest", "planattachment", "planactivity"):
        op.alter_column(table, "plan_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    for table in ("planrole", "plancollaborator", "planinvitation", "plancollaboratorrequest", "planattachment", "planactivity"):
        op.execute(f"DELETE FROM {table} WHERE plan_id IS NULL")
        op.alter_column(table, "plan_id", existing_type=sa.Integer(), nullable=False)
        op.drop_column(table, "goal_id")
    op.drop_column("requirementattainmentsource", "step_progress_id")
    op.execute("DELETE FROM learningrun WHERE plan_id IS NULL OR plan_objective_id IS NULL")
    op.alter_column("learningrun", "plan_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("learningrun", "plan_objective_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("learningrun", "goal_step_id")
    op.drop_column("learningrun", "goal_id")
    op.execute("DELETE FROM learningactivity WHERE objective_id IS NULL")
    op.alter_column("learningactivity", "objective_id", existing_type=sa.Integer(), nullable=False)
    for column in ("frozen_hash", "frozen_from_id", "goal_template_id"):
        op.drop_column("learningactivity", column)
    for table in ("goal_story", "step_entry", "step_progress", "goal_step", "goal_stage", "goal", "goal_assignment", "goal_template_version", "goal_template"):
        op.drop_table(table)

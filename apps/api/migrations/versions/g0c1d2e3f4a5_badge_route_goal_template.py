"""badge routes point at goal templates: nullable goal_template_id, program_id becomes optional

Routes keep their legacy program_id until the plan tables are dropped. Routes whose
program already has a goal template (same uuid) are linked here; the move-plans-to-goals
migration links the rest after it copies the templates.

Revision ID: g0c1d2e3f4a5
Revises: g0b1c2d3e4f5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g0c1d2e3f4a5'
down_revision: Union[str, None] = 'g0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LINK_ROUTES = (
    "UPDATE badgeroute SET goal_template_id = (SELECT goal_template.id FROM goal_template JOIN program ON program.program_uuid = goal_template.template_uuid "
    "WHERE program.id = badgeroute.program_id) WHERE goal_template_id IS NULL AND program_id IS NOT NULL"
)


def upgrade() -> None:
    with op.batch_alter_table('badgeroute') as batch:
        batch.add_column(sa.Column('goal_template_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_badgeroute_goal_template_id', 'goal_template', ['goal_template_id'], ['id'], ondelete='CASCADE')
        batch.create_index('ix_badgeroute_goal_template_id', ['goal_template_id'])
        batch.create_unique_constraint('uq_badgeroute_badge_id_goal_template_id', ['badge_id', 'goal_template_id'])
        batch.alter_column('program_id', existing_type=sa.Integer(), nullable=True)
    op.execute(LINK_ROUTES)


def downgrade() -> None:
    op.execute("DELETE FROM badgeroute WHERE program_id IS NULL")
    with op.batch_alter_table('badgeroute') as batch:
        batch.alter_column('program_id', existing_type=sa.Integer(), nullable=False)
        batch.drop_constraint('uq_badgeroute_badge_id_goal_template_id', type_='unique')
        batch.drop_index('ix_badgeroute_goal_template_id')
        batch.drop_constraint('fk_badgeroute_goal_template_id', type_='foreignkey')
        batch.drop_column('goal_template_id')

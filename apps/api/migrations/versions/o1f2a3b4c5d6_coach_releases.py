"""coach releases: admins edit a draft and learners get the live release

Adds the release table and the policy's pointer to the live release. The policy as it stands
becomes release 1, so nothing changes for learners and later edits wait for a release.

Revision ID: o1f2a3b4c5d6
Revises: n0e1f2a3b4c5
"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = 'o1f2a3b4c5d6'
down_revision: Union[str, None] = 'n0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

release_table = sa.table(
    'coach_release',
    sa.column('id', sa.Integer), sa.column('release_uuid', sa.String), sa.column('number', sa.Integer),
    sa.column('snapshot', sa.JSON), sa.column('changes', sa.JSON), sa.column('note', sa.Text),
    sa.column('released_at', sa.DateTime),
)
policy_table = sa.table(
    'coach_policy',
    sa.column('id', sa.Integer), sa.column('enabled', sa.Boolean), sa.column('method', sa.Text),
    sa.column('abilities', sa.JSON), sa.column('tiers', sa.JSON), sa.column('live_release_id', sa.Integer),
    sa.column('updated_at', sa.DateTime),
)


def _rows(bind, sql: str) -> list[dict]:
    return [dict(row) for row in bind.execute(sa.text(sql)).mappings().all()]


def upgrade() -> None:
    op.create_table(
        'coach_release',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('release_uuid', sa.String(), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False, unique=True),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('changes', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('note', sa.Text(), nullable=False, server_default=''),
        sa.Column('released_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('released_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_coach_release_release_uuid', 'coach_release', ['release_uuid'], unique=True)
    op.add_column('coach_policy', sa.Column('live_release_id', sa.Integer(), sa.ForeignKey('coach_release.id', ondelete='SET NULL'), nullable=True))

    bind = op.get_bind()
    now = datetime.utcnow()
    policy = bind.execute(sa.text('SELECT method, abilities, tiers FROM coach_policy WHERE id = 1')).mappings().first()
    if policy is None:
        bind.execute(policy_table.insert().values(id=1, enabled=False, method='', abilities={}, tiers={}, updated_at=now))
        policy = {'method': '', 'abilities': {}, 'tiers': {}}
    playbooks = _rows(bind, 'SELECT playbook_uuid, title, used_when, body, "always", enabled FROM coach_playbook ORDER BY position, id')
    routines = _rows(bind, 'SELECT routine_uuid, name, "trigger", instructions, tier, enabled FROM coach_routine ORDER BY position, id')
    snapshot = {
        'method': policy['method'] or '', 'abilities': policy['abilities'] or {}, 'tiers': policy['tiers'] or {},
        'playbooks': [{**row, 'always': bool(row['always']), 'enabled': bool(row['enabled'])} for row in playbooks],
        'routines': [{**row, 'enabled': bool(row['enabled'])} for row in routines],
    }
    bind.execute(release_table.insert().values(
        release_uuid=f'coach_release_{uuid4().hex}', number=1, snapshot=snapshot,
        changes=['The first release'], note='The policy as it was when releases began', released_at=now,
    ))
    release_id = bind.execute(sa.text('SELECT id FROM coach_release WHERE number = 1')).scalar()
    bind.execute(policy_table.update().where(policy_table.c.id == 1).values(live_release_id=release_id))


def downgrade() -> None:
    op.drop_column('coach_policy', 'live_release_id')
    op.drop_index('ix_coach_release_release_uuid', table_name='coach_release')
    op.drop_table('coach_release')

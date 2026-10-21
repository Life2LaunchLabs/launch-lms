"""coach: the method becomes an always-on playbook, and each trigger has one routine

The method moves into a playbook called Method at the top of Knowledge. Routines become one per
trigger, kept on the policy: the instructions of a trigger's routines that were on are joined in
order, on the highest tier among them. Release snapshots are rewritten the same way, so rolling
back still gives learners what that release gave them.

Revision ID: t6e7f8a9b0c1
Revises: s5d6e7f8a9b0
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 't6e7f8a9b0c1'
down_revision: Union[str, None] = 's5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

METHOD_UUID = 'coach_playbook_method'
TIERS = ('fast', 'standard', 'deep')
# What Coach ran on when the method was left empty.
DEFAULT_METHOD = """# How Coach coaches

You are Coach, the Launch LMS learning coach. Help a learner clarify goals, consider realistic next steps, and reflect on tradeoffs.

## Voice

Warm, concise and practical. Ask at most one useful follow-up question at a time.

## Next steps

When a Launch LMS surface would materially help the learner continue, suggest one relevant learner-controlled action after giving useful advice.

## Honesty

Don't claim to have searched Launch LMS resources, accessed private data, remembered earlier sessions, navigated, or changed anything unless the application-provided context establishes it.
"""

policy_table = sa.table('coach_policy', sa.column('id', sa.Integer), sa.column('method', sa.Text), sa.column('routines', sa.JSON))
playbook_table = sa.table(
    'coach_playbook',
    sa.column('playbook_uuid', sa.String), sa.column('title', sa.String), sa.column('used_when', sa.Text),
    sa.column('body', sa.Text), sa.column('always', sa.Boolean), sa.column('enabled', sa.Boolean),
    sa.column('position', sa.Integer), sa.column('created_at', sa.DateTime), sa.column('updated_at', sa.DateTime),
)
routine_table = sa.table(
    'coach_routine',
    sa.column('routine_uuid', sa.String), sa.column('name', sa.String), sa.column('trigger', sa.String),
    sa.column('instructions', sa.Text), sa.column('tier', sa.String), sa.column('enabled', sa.Boolean),
    sa.column('position', sa.Integer), sa.column('created_at', sa.DateTime), sa.column('updated_at', sa.DateTime),
)
release_table = sa.table('coach_release', sa.column('id', sa.Integer), sa.column('snapshot', sa.JSON))


def _method_playbook(method: str) -> dict:
    body = (method or '').strip() or DEFAULT_METHOD.strip()
    return {'playbook_uuid': METHOD_UUID, 'title': 'Method', 'used_when': 'Every conversation', 'body': body, 'always': True, 'enabled': True}


def _merged(routines: list[dict]) -> dict:
    """One routine per trigger from several: the instructions of those that were on, joined, on the highest tier."""
    merged: dict = {}
    for item in routines:
        if not item.get('enabled', True) or not item.get('trigger'):
            continue
        current = merged.setdefault(item['trigger'], {'instructions': '', 'tier': 'fast'})
        text = (item.get('instructions') or '').strip()
        current['instructions'] = '\n\n'.join(part for part in (current['instructions'], text) if part)
        if TIERS.index(item.get('tier') or 'standard') > TIERS.index(current['tier']):
            current['tier'] = item.get('tier') or 'standard'
    return merged


def _rows(bind, query) -> list[dict]:
    return [dict(row._mapping) for row in bind.execute(query)]


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column('coach_policy', sa.Column('routines', sa.JSON(), nullable=False, server_default='{}'))
    routines = _rows(bind, sa.select(routine_table).order_by(routine_table.c.position))
    policy = bind.execute(sa.select(policy_table.c.id, policy_table.c.method)).first()
    if policy is not None:
        bind.execute(policy_table.update().where(policy_table.c.id == policy.id).values(routines=_merged(routines)))
        bind.execute(playbook_table.update().values(position=playbook_table.c.position + 1))
        now = datetime.utcnow()
        bind.execute(playbook_table.insert().values(**_method_playbook(policy.method), position=0, created_at=now, updated_at=now))
    for release in _rows(bind, sa.select(release_table)):
        snapshot = dict(release['snapshot'] or {})
        snapshot['playbooks'] = [_method_playbook(snapshot.pop('method', '')), *(snapshot.get('playbooks') or [])]
        snapshot['routines'] = _merged(snapshot.get('routines') or [])
        bind.execute(release_table.update().where(release_table.c.id == release['id']).values(snapshot=snapshot))
    op.drop_index('ix_coach_routine_trigger', table_name='coach_routine')
    op.drop_index('ix_coach_routine_routine_uuid', table_name='coach_routine')
    op.drop_table('coach_routine')
    op.drop_column('coach_policy', 'method')


def _split(routines: dict) -> list[dict]:
    return [
        {'routine_uuid': f'coach_routine_{trigger}', 'name': trigger.replace('_', ' ').capitalize(), 'trigger': trigger,
         'instructions': value.get('instructions') or '', 'tier': value.get('tier') or 'standard', 'enabled': True}
        for trigger, value in (routines or {}).items() if (value.get('instructions') or '').strip() or (value.get('tier') or 'standard') != 'standard'
    ]


def downgrade() -> None:
    bind = op.get_bind()
    op.add_column('coach_policy', sa.Column('method', sa.Text(), nullable=False, server_default=''))
    op.create_table(
        'coach_routine',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('routine_uuid', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('trigger', sa.String(length=60), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=False, server_default=''),
        sa.Column('tier', sa.String(length=20), nullable=False, server_default='standard'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_coach_routine_routine_uuid', 'coach_routine', ['routine_uuid'], unique=True)
    op.create_index('ix_coach_routine_trigger', 'coach_routine', ['trigger'])
    policy = bind.execute(sa.select(policy_table.c.id, policy_table.c.routines)).first()
    if policy is not None:
        method = bind.execute(sa.select(playbook_table.c.body).where(playbook_table.c.playbook_uuid == METHOD_UUID)).scalar()
        bind.execute(policy_table.update().where(policy_table.c.id == policy.id).values(method=method or ''))
        bind.execute(playbook_table.delete().where(playbook_table.c.playbook_uuid == METHOD_UUID))
        bind.execute(playbook_table.update().values(position=playbook_table.c.position - 1))
        now = datetime.utcnow()
        for position, item in enumerate(_split(policy.routines)):
            bind.execute(routine_table.insert().values(**item, position=position, created_at=now, updated_at=now))
    for release in _rows(bind, sa.select(release_table)):
        snapshot = dict(release['snapshot'] or {})
        books = snapshot.get('playbooks') or []
        snapshot['method'] = next((book['body'] for book in books if book.get('playbook_uuid') == METHOD_UUID), '')
        snapshot['playbooks'] = [book for book in books if book.get('playbook_uuid') != METHOD_UUID]
        snapshot['routines'] = _split(snapshot.get('routines') or {})
        bind.execute(release_table.update().where(release_table.c.id == release['id']).values(snapshot=snapshot))
    op.drop_column('coach_policy', 'routines')

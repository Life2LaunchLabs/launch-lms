"""goal routines: an action on a cadence

A routine was a weekly count (target times a week, logged by Monday-started weeks) with an
optional total, end date and follow-ups. It is now an action (a list of items, a number, or
just doing it) that comes round on a cadence. Old routines become weekly on Mondays, so their
logs keep their weeks; an end date becomes the step's close date when it has none, and the
total and follow-ups are dropped, with the follow-up columns.

Revision ID: m9d0e1f2a3b4
Revises: l8c9d0e1f2a3
"""
from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm9d0e1f2a3b4'
down_revision: Union[str, None] = 'l8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

step = sa.table('goal_step', sa.column('id', sa.Integer), sa.column('type', sa.String), sa.column('config', sa.JSON), sa.column('due_date', sa.Date))
template = sa.table('goal_template', sa.column('id', sa.Integer), sa.column('document', sa.JSON))
version = sa.table('goal_template_version', sa.column('id', sa.Integer), sa.column('document', sa.JSON))


def _convert(config):
    if not isinstance(config, dict) or 'action' in config:
        return config
    target = int(config.get('target') or 1)
    named = config.get('entry_kind', 'named') == 'named'
    kind = 'list' if named or target > 1 else 'check'
    label = str(config.get('item_label') or ('' if named else 'time'))[:60]
    return {'cadence': 'weekly', 'days': [1], 'action': {'kind': kind, 'target': target if kind == 'list' else 1, 'label': label}}


def _convert_document(document):
    if not isinstance(document, dict):
        return document
    stages = []
    for stage in document.get('stages') or []:
        if isinstance(stage, dict):
            steps = []
            for item in stage.get('steps') or []:
                if isinstance(item, dict) and item.get('type') == 'routine':
                    item = {**item, 'config': _convert(item.get('config') or {})}
                steps.append(item)
            stage = {**stage, 'steps': steps}
        stages.append(stage)
    return {**document, 'stages': stages} if 'stages' in document else document


def upgrade() -> None:
    bind = op.get_bind()
    for row in bind.execute(sa.select(step.c.id, step.c.config, step.c.due_date).where(step.c.type == 'routine')).mappings():
        config = row['config'] or {}
        if 'action' in config:
            continue
        values = {'config': _convert(config)}
        end = config.get('end_date')
        if end and not row['due_date']:
            try:
                values['due_date'] = date.fromisoformat(str(end)[:10])
            except ValueError:
                pass
        bind.execute(step.update().where(step.c.id == row['id']).values(**values))
    for table in (template, version):
        for row in bind.execute(sa.select(table.c.id, table.c.document)).mappings():
            converted = _convert_document(row['document'])
            if converted != row['document']:
                bind.execute(table.update().where(table.c.id == row['id']).values(document=converted))
    with op.batch_alter_table('step_entry') as batch:
        batch.drop_column('follow_up_status')
        batch.drop_column('follow_up_due')


def downgrade() -> None:
    with op.batch_alter_table('step_entry') as batch:
        batch.add_column(sa.Column('follow_up_due', sa.Date(), nullable=True))
        batch.add_column(sa.Column('follow_up_status', sa.String(), nullable=True))

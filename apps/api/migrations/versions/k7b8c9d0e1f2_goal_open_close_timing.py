"""goal timing: stages only start, steps open and close within them

Stages lose their end date (a stage runs until the next one starts), goals lose their step
order (a step opens with its stage, on a date, or after other steps) and steps lose
allow_late. Existing plans keep their meaning:

- an "in order" goal or template has each step wait on the step before it in its stage;
- a stage's end date becomes the next stage's start date when that one had none;
- a stage picked by hand becomes a start date on the day it was picked.

Revision ID: k7b8c9d0e1f2
Revises: j6a7b8c9d0e1
"""
from datetime import date, timedelta
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k7b8c9d0e1f2'
down_revision: Union[str, None] = 'j6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

goal = sa.table('goal', sa.column('id', sa.Integer), sa.column('step_order', sa.String), sa.column('details', sa.JSON))
stage = sa.table('goal_stage', sa.column('id', sa.Integer), sa.column('goal_id', sa.Integer), sa.column('stage_uuid', sa.String), sa.column('position', sa.Integer),
                 sa.column('start_date', sa.Date), sa.column('due_date', sa.Date))
step = sa.table('goal_step', sa.column('id', sa.Integer), sa.column('goal_id', sa.Integer), sa.column('stage_id', sa.Integer), sa.column('step_uuid', sa.String),
                sa.column('position', sa.Integer), sa.column('after_step_uuids', sa.JSON))
template = sa.table('goal_template', sa.column('id', sa.Integer), sa.column('document', sa.JSON))
version = sa.table('goal_template_version', sa.column('id', sa.Integer), sa.column('document', sa.JSON))


def _day(value):
    if isinstance(value, date) or value is None:
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _upgrade_document(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get('template'), dict):
        return raw
    in_order = raw['template'].get('step_order') == 'in_order'
    document = {**raw, 'template': {key: value for key, value in raw['template'].items() if key != 'step_order'}}
    stages = []
    for item in raw.get('stages') or []:
        if not isinstance(item, dict):
            stages.append(item)
            continue
        steps, previous = [], None
        for spec in item.get('steps') or []:
            if isinstance(spec, dict):
                spec = {key: value for key, value in spec.items() if key != 'allow_late'}
                if in_order and previous and spec.get('key') and not spec.get('after'):
                    spec['after'] = [previous]
                previous = spec.get('key')
            steps.append(spec)
        stages.append({**item, 'steps': steps})
    document['stages'] = stages
    return document


def upgrade() -> None:
    bind = op.get_bind()
    stages_by_goal: dict[int, list] = {}
    for row in bind.execute(sa.select(stage.c.id, stage.c.goal_id, stage.c.stage_uuid, stage.c.position, stage.c.start_date, stage.c.due_date)).mappings():
        stages_by_goal.setdefault(row['goal_id'], []).append(dict(row))
    starts: dict[int, date | None] = {}
    for goal_id, rows in stages_by_goal.items():
        rows.sort(key=lambda item: (item['position'], item['id']))
        for row in rows:
            starts[row['id']] = _day(row['start_date'])
        for index, row in enumerate(rows[:-1]):
            ends = _day(row['due_date'])
            if ends and not starts[rows[index + 1]['id']]:
                starts[rows[index + 1]['id']] = ends + timedelta(days=1)

    for row in bind.execute(sa.select(goal.c.id, goal.c.step_order, goal.c.details)).mappings():
        details = dict(row['details'] or {})
        picked = details.pop('current_stage', None)
        rows = stages_by_goal.get(row['id'], [])
        if isinstance(picked, dict) and rows:
            set_on = _day(picked.get('set_on')) or date.today()
            target = next((index for index, item in enumerate(rows) if item['stage_uuid'] == picked.get('stage_uuid')), None)
            if target is not None:
                for index, item in enumerate(rows):
                    begins = starts[item['id']]
                    if index > target and begins and begins <= set_on:
                        starts[item['id']] = None
                    elif index == target and target > 0 and (not begins or begins > set_on):
                        starts[item['id']] = set_on
            bind.execute(goal.update().where(goal.c.id == row['id']).values(details=details))
        if row['step_order'] == 'in_order':
            steps = bind.execute(sa.select(step.c.id, step.c.stage_id, step.c.step_uuid, step.c.position, step.c.after_step_uuids).where(step.c.goal_id == row['id'])).mappings().all()
            by_stage: dict = {}
            for item in sorted(steps, key=lambda item: (item['position'], item['id'])):
                by_stage.setdefault(item['stage_id'], []).append(item)
            for items in by_stage.values():
                for previous, item in zip(items, items[1:]):
                    if not item['after_step_uuids']:
                        bind.execute(step.update().where(step.c.id == item['id']).values(after_step_uuids=[previous['step_uuid']]))

    for rows in stages_by_goal.values():
        for row in rows:
            if starts[row['id']] != _day(row['start_date']):
                bind.execute(stage.update().where(stage.c.id == row['id']).values(start_date=starts[row['id']]))

    for table in (template, version):
        for row in bind.execute(sa.select(table.c.id, table.c.document)).mappings():
            upgraded = _upgrade_document(row['document'])
            if upgraded != row['document']:
                bind.execute(table.update().where(table.c.id == row['id']).values(document=upgraded))

    op.drop_column('goal', 'step_order')
    op.drop_column('goal_stage', 'due_date')
    op.drop_column('goal_step', 'allow_late')


def downgrade() -> None:
    op.add_column('goal_step', sa.Column('allow_late', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('goal_stage', sa.Column('due_date', sa.Date(), nullable=True))
    op.add_column('goal', sa.Column('step_order', sa.String(), nullable=False, server_default='any'))

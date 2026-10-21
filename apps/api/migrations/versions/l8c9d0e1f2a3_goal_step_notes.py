"""goal steps: one note per step

Every step has the learner's note (step_progress.learner_note), added while the step is open
or after it's done. It takes over from the two places steps kept their own: a decision's
"why" (submission.reason) and an event's reflection (submission.reflection, asked for by
config.reflection_prompt). Each moves into the note, after any note already there.

Revision ID: l8c9d0e1f2a3
Revises: k7b8c9d0e1f2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l8c9d0e1f2a3'
down_revision: Union[str, None] = 'k7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

step = sa.table('goal_step', sa.column('id', sa.Integer), sa.column('type', sa.String), sa.column('config', sa.JSON))
progress = sa.table('step_progress', sa.column('id', sa.Integer), sa.column('step_id', sa.Integer), sa.column('submission', sa.JSON), sa.column('learner_note', sa.String))
template = sa.table('goal_template', sa.column('id', sa.Integer), sa.column('document', sa.JSON))
version = sa.table('goal_template_version', sa.column('id', sa.Integer), sa.column('document', sa.JSON))

MOVED = {'decision': 'reason', 'event': 'reflection'}


def _strip_prompt(document):
    if not isinstance(document, dict):
        return document
    stages = []
    for stage in document.get('stages') or []:
        if isinstance(stage, dict):
            steps = []
            for item in stage.get('steps') or []:
                if isinstance(item, dict) and item.get('type') == 'event' and isinstance(item.get('config'), dict) and 'reflection_prompt' in item['config']:
                    item = {**item, 'config': {key: value for key, value in item['config'].items() if key != 'reflection_prompt'}}
                steps.append(item)
            stage = {**stage, 'steps': steps}
        stages.append(stage)
    return {**document, 'stages': stages} if 'stages' in document else document


def upgrade() -> None:
    bind = op.get_bind()
    types = {}
    for row in bind.execute(sa.select(step.c.id, step.c.type, step.c.config).where(step.c.type.in_(list(MOVED)))).mappings():
        types[row['id']] = row['type']
        config = row['config'] or {}
        if row['type'] == 'event' and 'reflection_prompt' in config:
            bind.execute(step.update().where(step.c.id == row['id']).values(config={key: value for key, value in config.items() if key != 'reflection_prompt'}))
    if types:
        for row in bind.execute(sa.select(progress.c.id, progress.c.step_id, progress.c.submission, progress.c.learner_note).where(progress.c.step_id.in_(list(types)))).mappings():
            submission = dict(row['submission'] or {})
            field = MOVED[types[row['step_id']]]
            if field not in submission:
                continue
            moved = str(submission.pop(field) or '').strip()
            note = '\n\n'.join(part for part in (str(row['learner_note'] or '').strip(), moved) if part)
            bind.execute(progress.update().where(progress.c.id == row['id']).values(submission=submission, learner_note=note))
    for table in (template, version):
        for row in bind.execute(sa.select(table.c.id, table.c.document)).mappings():
            stripped = _strip_prompt(row['document'])
            if stripped != row['document']:
                bind.execute(table.update().where(table.c.id == row['id']).values(document=stripped))


def downgrade() -> None:
    # The note keeps what moved into it; nothing to restore.
    pass

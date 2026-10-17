"""coach policy: one platform policy, provider keys, playbooks and routines

Replaces the Hub advisor configuration. The old single provider/model becomes a key on every
tier; instructions become the Method (the old default becomes the new default Method); launch
cards move across. The safety rules seed an always-on playbook, and the voice lines that lived
in the check-in and finish-story prompts seed two routines the coaching team can edit.

Revision ID: n0e1f2a3b4c5
Revises: m9d0e1f2a3b4
"""
import json
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = 'n0e1f2a3b4c5'
down_revision: Union[str, None] = 'm9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of the texts as they were when this migration was written.
OLD_DEFAULT_INSTRUCTIONS = 'You are Coach, the Launch LMS learning coach. Help a learner clarify goals, consider realistic next steps, and reflect on tradeoffs. Be warm, concise, and practical. Ask at most one useful follow-up question at a time. When a Launch LMS surface would materially help the learner continue, suggest one relevant learner-controlled action after giving useful advice. Do not claim to have searched Launch LMS resources, accessed private data, remembered earlier sessions, navigated, or changed anything unless the application-provided context establishes it. Do not present medical, legal, financial, or crisis guidance as professional advice; encourage appropriate qualified or emergency help when needed.'
DEFAULT_METHOD = "# How Coach coaches\n\nYou are Coach, the Launch LMS learning coach. Help a learner clarify goals, consider realistic next steps, and reflect on tradeoffs.\n\n## Voice\n\nWarm, concise and practical. Ask at most one useful follow-up question at a time.\n\n## Next steps\n\nWhen a Launch LMS surface would materially help the learner continue, suggest one relevant learner-controlled action after giving useful advice.\n\n## Honesty\n\nDon't claim to have searched Launch LMS resources, accessed private data, remembered earlier sessions, navigated, or changed anything unless the application-provided context establishes it.\n"
SAFETY_PLAYBOOK = "Don't present medical, legal, financial, or crisis guidance as professional advice. Encourage the learner to reach appropriate qualified or emergency help when they need it, and a trusted adult when something feels unsafe."
PROVIDER_NAMES = {"openai": "OpenAI", "anthropic": "Anthropic"}
TIERS = ("fast", "standard", "deep")

WRITER_ROUTINES = (
    ("Check-in notes", "goal_check_in", 'Write in a warm, plain voice, speaking to the learner as "you". Notice; never nag, guilt or pressure.'),
    ("Finish story", "goal_finished", "Plain words; no exclamation marks, no clichés."),
)

policy_table = sa.table(
    'coach_policy',
    sa.column('id', sa.Integer), sa.column('enabled', sa.Boolean), sa.column('method', sa.Text),
    sa.column('abilities', sa.JSON), sa.column('tiers', sa.JSON), sa.column('launch_cards', sa.JSON),
    sa.column('updated_by_user_id', sa.Integer), sa.column('updated_at', sa.DateTime),
)
key_table = sa.table(
    'coach_provider_key',
    sa.column('key_uuid', sa.String), sa.column('provider', sa.String), sa.column('label', sa.String),
    sa.column('ciphertext', sa.Text), sa.column('last_four', sa.String), sa.column('created_at', sa.DateTime),
    sa.column('updated_at', sa.DateTime),
)
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


def _settings(raw) -> dict:
    defaults = {"max_output_tokens": 700, "reasoning_effort": "default", "verbosity": "default", "thinking_effort": "default"}
    try:
        saved = json.loads(raw or "{}")
    except (TypeError, ValueError):
        saved = {}
    return {**defaults, **{key: value for key, value in saved.items() if key in defaults}}


def upgrade() -> None:
    user_fk = sa.ForeignKey('user.id', ondelete='SET NULL')
    op.create_table(
        'coach_policy',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('method', sa.Text(), nullable=False, server_default=''),
        sa.Column('abilities', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('tiers', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('launch_cards', sa.JSON(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), user_fk, nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'coach_provider_key',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key_uuid', sa.String(), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('label', sa.String(length=120), nullable=False),
        sa.Column('ciphertext', sa.Text(), nullable=False),
        sa.Column('last_four', sa.String(length=8), nullable=False, server_default=''),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_coach_provider_key_key_uuid', 'coach_provider_key', ['key_uuid'], unique=True)
    for name, uuid_column, columns in (
        ('coach_playbook', 'playbook_uuid', [
            sa.Column('title', sa.String(length=200), nullable=False),
            sa.Column('used_when', sa.Text(), nullable=False, server_default=''),
            sa.Column('body', sa.Text(), nullable=False, server_default=''),
            sa.Column('always', sa.Boolean(), nullable=False, server_default=sa.false()),
        ]),
        ('coach_routine', 'routine_uuid', [
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('trigger', sa.String(length=60), nullable=False),
            sa.Column('instructions', sa.Text(), nullable=False, server_default=''),
            sa.Column('tier', sa.String(length=20), nullable=False, server_default='standard'),
        ]),
    ):
        op.create_table(
            name,
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column(uuid_column, sa.String(), nullable=False),
            *columns,
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
        op.create_index(f'ix_{name}_{uuid_column}', name, [uuid_column], unique=True)
    op.create_index('ix_coach_routine_trigger', 'coach_routine', ['trigger'])

    bind = op.get_bind()
    now = datetime.utcnow()
    old = bind.execute(sa.text(
        'SELECT provider, enabled, instructions, launch_cards, updated_by_user_id FROM hubadvisorconfiguration WHERE id = 1'
    )).mappings().first()
    providers = bind.execute(sa.text(
        'SELECT provider, model, api_key_ciphertext, advanced_settings FROM hubadvisorproviderconfiguration'
    )).mappings().all()

    tiers: dict = {}
    for row in providers:
        if not row['api_key_ciphertext']:
            continue
        key_uuid = f'coach_key_{uuid4().hex}'
        bind.execute(key_table.insert().values(
            key_uuid=key_uuid, provider=row['provider'], label=f"{PROVIDER_NAMES.get(row['provider'], row['provider'])} key",
            ciphertext=row['api_key_ciphertext'], last_four='', created_at=now, updated_at=now,
        ))
        if old and row['provider'] == old['provider']:
            tier = {'key_uuid': key_uuid, 'model': row['model'], 'settings': _settings(row['advanced_settings'])}
            tiers = {name: dict(tier) for name in TIERS}

    if old:
        instructions = (old['instructions'] or '').strip()
        launch_cards = old['launch_cards']
        if isinstance(launch_cards, str):
            launch_cards = json.loads(launch_cards)
        bind.execute(policy_table.insert().values(
            id=1,
            # A live Coach keeps running only if its tiers came across.
            enabled=bool(old['enabled']) and bool(tiers),
            method=DEFAULT_METHOD if not instructions or instructions == OLD_DEFAULT_INSTRUCTIONS else instructions,
            abilities={}, tiers=tiers, launch_cards=launch_cards,
            updated_by_user_id=old['updated_by_user_id'], updated_at=now,
        ))

    bind.execute(playbook_table.insert().values(
        playbook_uuid=f'coach_playbook_{uuid4().hex}', title='Safety', used_when='Every conversation',
        body=SAFETY_PLAYBOOK, always=True, enabled=True, position=0, created_at=now, updated_at=now,
    ))
    for position, (name, trigger, instructions) in enumerate(WRITER_ROUTINES):
        bind.execute(routine_table.insert().values(
            routine_uuid=f'coach_routine_{uuid4().hex}', name=name, trigger=trigger, instructions=instructions,
            tier='standard', enabled=True, position=position, created_at=now, updated_at=now,
        ))

    op.drop_table('hubadvisorproviderconfiguration')
    op.drop_table('hubadvisorconfiguration')


def downgrade() -> None:
    # Best effort: the Standard tier's key and model become the single provider again;
    # playbooks, routines and other keys are dropped.
    op.create_table(
        'hubadvisorconfiguration',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('provider', sa.String(length=50), nullable=False, server_default='openai'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('launch_cards', sa.JSON(), nullable=True),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'hubadvisorproviderconfiguration',
        sa.Column('provider', sa.String(length=50), primary_key=True),
        sa.Column('model', sa.String(length=200), nullable=False),
        sa.Column('api_key_ciphertext', sa.Text(), nullable=True),
        sa.Column('advanced_settings', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    bind = op.get_bind()
    now = datetime.utcnow()
    policy = bind.execute(sa.select(policy_table).where(policy_table.c.id == 1)).mappings().first()
    if policy:
        tiers = policy['tiers'] if isinstance(policy['tiers'], dict) else json.loads(policy['tiers'] or '{}')
        standard = tiers.get('standard') or {}
        key = bind.execute(sa.select(key_table).where(key_table.c.key_uuid == standard.get('key_uuid', ''))).mappings().first()
        provider = key['provider'] if key else 'openai'
        if key:
            bind.execute(sa.text(
                'INSERT INTO hubadvisorproviderconfiguration (provider, model, api_key_ciphertext, advanced_settings, updated_at) '
                'VALUES (:provider, :model, :ciphertext, :settings, :now)'
            ), {'provider': provider, 'model': standard.get('model') or '', 'ciphertext': key['ciphertext'],
                'settings': json.dumps(standard.get('settings') or {}), 'now': now})
        launch_cards = policy['launch_cards']
        bind.execute(sa.text(
            'INSERT INTO hubadvisorconfiguration (id, provider, enabled, instructions, launch_cards, updated_by_user_id, updated_at) '
            'VALUES (1, :provider, :enabled, :instructions, :launch_cards, :user_id, :now)'
        ), {'provider': provider, 'enabled': bool(policy['enabled']) and key is not None,
            'instructions': policy['method'] or OLD_DEFAULT_INSTRUCTIONS,
            'launch_cards': json.dumps(launch_cards) if launch_cards is not None else None,
            'user_id': policy['updated_by_user_id'], 'now': now})
    op.drop_table('coach_routine')
    op.drop_table('coach_playbook')
    op.drop_table('coach_provider_key')
    op.drop_table('coach_policy')

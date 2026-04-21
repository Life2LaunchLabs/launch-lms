"""add plan_request table

Revision ID: v1w2x3y4z5a6
Revises: p4q5r6s7t8u9
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'v1w2x3y4z5a6'
down_revision: Union[str, None] = 'p4q5r6s7t8u9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'plan_request',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('request_uuid', sqlmodel.AutoString(), nullable=False, server_default=''),
        sa.Column('request_type', sqlmodel.AutoString(), nullable=False, server_default='plan_upgrade'),
        sa.Column('requested_value', sqlmodel.AutoString(), nullable=False, server_default=''),
        sa.Column('status', sqlmodel.AutoString(), nullable=False, server_default='pending'),
        sa.Column('message', sqlmodel.AutoString(), nullable=True),
        sa.Column('creation_date', sqlmodel.AutoString(), nullable=True),
        sa.Column('update_date', sqlmodel.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_plan_request_org_id', 'plan_request', ['org_id'])
    op.create_index('ix_plan_request_status', 'plan_request', ['status'])


def downgrade() -> None:
    op.drop_index('ix_plan_request_status', 'plan_request')
    op.drop_index('ix_plan_request_org_id', 'plan_request')
    op.drop_table('plan_request')

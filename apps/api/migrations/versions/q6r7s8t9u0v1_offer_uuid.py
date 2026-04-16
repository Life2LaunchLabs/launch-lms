"""Drop legacy payments tables

Revision ID: q6r7s8t9u0v1
Revises: 0314ec7791e1, m3b4c5d6e7f8
Create Date: 2026-02-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'q6r7s8t9u0v1'
down_revision: Union[str, tuple] = ('0314ec7791e1', 'm3b4c5d6e7f8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Drop legacy tables (child before parent to respect FK constraints)
    for table_name in ('paymentscourse', 'paymentsuser', 'paymentsproduct'):
        if inspector.has_table(table_name):
            op.drop_table(table_name)


def downgrade() -> None:
    pass

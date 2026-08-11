"""merge legacy course retirement with portfolio projects rename

Revision ID: 58eae25fe62b
Revises: s4t5u6v7w8x9, s5t6u7v8w9x0
Create Date: 2026-08-05 12:34:04.888266

"""
from typing import Sequence, Union

import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = '58eae25fe62b'
down_revision: Union[str, None] = ('s4t5u6v7w8x9', 's5t6u7v8w9x0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

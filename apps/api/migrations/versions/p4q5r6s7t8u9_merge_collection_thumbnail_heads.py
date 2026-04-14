"""merge collection thumbnail migration head

Revision ID: p4q5r6s7t8u9
Revises: t2u3v4w5x6y7, b4c5d6e7f8a9
Create Date: 2026-04-14 00:00:00.000000
"""

from typing import Sequence, Union


revision: str = "p4q5r6s7t8u9"
down_revision: Union[str, tuple[str, str], None] = ("t2u3v4w5x6y7", "b4c5d6e7f8a9")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

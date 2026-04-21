"""merge resource tags and collection thumbnail heads

Revision ID: c9d8e7f6a5b4
Revises: p4q5r6s7t8u9, r1s2t3u4v5w6
Create Date: 2026-04-21 18:05:00.000000
"""

from typing import Sequence, Union


revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, tuple[str, str], None] = ("p4q5r6s7t8u9", "r1s2t3u4v5w6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""merge shared/resource/plan heads

Revision ID: y1z2a3b4c5d6
Revises: a4b5c6d7e8f9, c9d8e7f6a5b4, v1w2x3y4z5a6
Create Date: 2026-04-16
"""

from typing import Union


revision: str = "y1z2a3b4c5d6"
down_revision: Union[str, tuple[str, str, str], None] = (
    "a4b5c6d7e8f9",
    "c9d8e7f6a5b4",
    "v1w2x3y4z5a6",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

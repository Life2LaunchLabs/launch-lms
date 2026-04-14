"""add thumbnail_image to collection

Revision ID: b4c5d6e7f8a9
Revises: z9y8x7w6v5u4
Create Date: 2026-04-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b4c5d6e7f8a9'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('collection', sa.Column('thumbnail_image', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('collection', 'thumbnail_image')

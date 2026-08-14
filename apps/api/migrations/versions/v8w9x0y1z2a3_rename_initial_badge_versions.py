"""rename generated initial badge version titles

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
"""

from alembic import op
import sqlalchemy as sa

revision = "v8w9x0y1z2a3"
down_revision = "u7v8w9x0y1z2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE learningbadgeversion "
            "SET title = 'Initial Version' "
            "WHERE title IN ('Initial draft', 'Initial release')"
        )
    )


def downgrade() -> None:
    pass

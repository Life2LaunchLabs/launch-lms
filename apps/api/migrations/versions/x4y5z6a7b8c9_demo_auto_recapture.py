"""Let the demo republish itself after a product update outdates its checkpoint.

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
"""

from alembic import op
import sqlalchemy as sa

revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "democonfiguration",
        sa.Column(
            "auto_recapture", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column("democonfiguration", sa.Column("recapture_error", sa.String()))
    op.add_column(
        "democonfiguration", sa.Column("recapture_error_signature", sa.String())
    )


def downgrade():
    op.drop_column("democonfiguration", "recapture_error_signature")
    op.drop_column("democonfiguration", "recapture_error")
    op.drop_column("democonfiguration", "auto_recapture")

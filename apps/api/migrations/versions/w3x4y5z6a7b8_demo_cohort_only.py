"""Drop the single-source-user demo design; add separately stored pilot portraits.

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
"""

from alembic import op
import sqlalchemy as sa

revision = "w3x4y5z6a7b8"
down_revision = "v2w3x4y5z6a7"
branch_labels = None
depends_on = None


def upgrade():
    # Checkpoints published under the single-user design have no pilots to admit.
    op.execute(
        sa.text(
            "UPDATE democonfiguration SET enabled=false, checkpoint_id=NULL, revision=revision+1"
        )
    )
    op.drop_column("democonfiguration", "source_user_id")
    op.drop_column("democheckpoint", "source_user_id")
    op.drop_column("democheckpoint", "source_email")
    op.add_column(
        "democheckpoint",
        sa.Column("portraits", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade():
    op.drop_column("democheckpoint", "portraits")
    op.add_column(
        "democheckpoint",
        sa.Column("source_email", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "democheckpoint",
        sa.Column("source_user_id", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "democonfiguration", sa.Column("source_user_id", sa.Integer(), nullable=True)
    )

"""One fictional cohort checkpoint with independently selected visitor pilots.

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
"""

from alembic import op
import sqlalchemy as sa

revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "demomember",
        sa.Column("user_id", sa.Integer(), primary_key=True),
        sa.Column("pilotable", sa.Boolean(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
    )
    op.add_column(
        "democheckpoint",
        sa.Column("pilots", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "demosession", sa.Column("pilot_user_id", sa.Integer(), nullable=True)
    )
    # The previous source remains editable; publication must explicitly designate
    # the fictional cohort before admitting visitors under the new export policy.
    op.execute(
        sa.text(
            "UPDATE democonfiguration SET enabled=false, checkpoint_id=NULL, revision=revision+1"
        )
    )


def downgrade():
    op.execute(
        sa.text(
            "UPDATE democonfiguration SET enabled=false, checkpoint_id=NULL, revision=revision+1"
        )
    )
    op.drop_column("demosession", "pilot_user_id")
    op.drop_column("democheckpoint", "pilots")
    op.drop_table("demomember")

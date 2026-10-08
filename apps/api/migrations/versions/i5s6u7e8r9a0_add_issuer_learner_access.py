"""add learner access mode to badge issuer authorizations

Revision ID: i5s6u7e8r9a0
Revises: y5z6a7b8c9d0
"""

from alembic import op
import sqlalchemy as sa


revision = "i5s6u7e8r9a0"
down_revision = "y5z6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "badgeissuerauthorization",
        sa.Column("learner_access", sa.String(), nullable=False, server_default="invite"),
    )
    # The former switch let any learner ask an issuer for support; keep that as "request"
    # so no learner is enrolled without the issuer's acceptance.
    op.execute("UPDATE badgeissuerauthorization SET learner_access = 'request' WHERE open_to_all")
    # Programs record the creator as its own issuer; the creator stays open to everyone,
    # as it was for independent learners before issuing became an explicit setting.
    op.execute("UPDATE badgeissuerauthorization SET learner_access = 'open', open_to_all = true WHERE issuer_org_id = creator_org_id")


def downgrade() -> None:
    op.drop_column("badgeissuerauthorization", "learner_access")

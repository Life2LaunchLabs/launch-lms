"""organizations: people asking to join an invite-only organization

Revision ID: a7d3e9b2c4f1
Revises: a4d8e2f6c1b9

A request holds who asked (an account, or just an address and a name), their note, and the answer
(``db/organization_join_requests.py``).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7d3e9b2c4f1"
down_revision: Union[str, None] = "a4d8e2f6c1b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_join_request",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("email_normalized", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False, server_default=""),
        sa.Column("message", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="requested"),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_organization_join_request_request_uuid", "organization_join_request", ["request_uuid"], unique=True)
    op.create_index("ix_organization_join_request_org_id", "organization_join_request", ["org_id"])
    op.create_index("ix_organization_join_request_user_id", "organization_join_request", ["user_id"])
    op.create_index("ix_organization_join_request_email_normalized", "organization_join_request", ["email_normalized"])
    op.create_index("ix_organization_join_request_org_status", "organization_join_request", ["org_id", "status"])


def downgrade() -> None:
    op.drop_table("organization_join_request")

"""signed badge credentials: awards keep their signed credential and a status list slot, and can be revoked

Revision ID: c3f7a9e2b1d4
Revises: b8e1d4c7a2f9

Every award is now issued as a signed Open Badges 3.0 credential, kept as
issued, with a slot in its issuing organization's revocation status list.
``org_signing_key`` holds each organization's Ed25519 key (made on its first
award). A revoked award stays on record but no longer counts, so the one-award-
per-learner-per-plan rule only covers active awards. Existing awards are signed
the first time their credential is asked for, so nothing is signed here.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f7a9e2b1d4"
down_revision: Union[str, None] = "b8e1d4c7a2f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ACTIVE = sa.text("status = 'active'")


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("badge_award", sa.Column("status", sa.String(), nullable=False, server_default="active"))
    op.add_column("badge_award", sa.Column("revoked_at", sa.DateTime(), nullable=True))
    op.add_column("badge_award", sa.Column("revoked_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True))
    op.add_column("badge_award", sa.Column("revoked_reason", sa.String(), nullable=False, server_default=""))
    op.add_column("badge_award", sa.Column("status_list_index", sa.Integer(), nullable=True))
    op.add_column("badge_award", sa.Column("credential", sa.JSON(), nullable=True))
    op.create_index("ix_badge_award_status", "badge_award", ["status"])
    for constraint in sa.inspect(bind).get_unique_constraints("badge_award"):
        if sorted(constraint["column_names"]) == ["template_id", "user_id"] and constraint.get("name"):
            op.drop_constraint(constraint["name"], "badge_award", type_="unique")
    op.create_index("uq_badge_award_active_holder", "badge_award", ["template_id", "user_id"], unique=True,
                    postgresql_where=ACTIVE, sqlite_where=ACTIVE)
    op.create_unique_constraint("uq_badge_award_status_list_index", "badge_award", ["issuing_org_id", "status_list_index"])
    op.create_table(
        "org_signing_key",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("public_key_multibase", sa.String(), nullable=False),
        sa.Column("private_key_encrypted", sa.Text(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("org_signing_key")
    op.drop_constraint("uq_badge_award_status_list_index", "badge_award", type_="unique")
    op.drop_index("uq_badge_award_active_holder", table_name="badge_award")
    op.drop_index("ix_badge_award_status", table_name="badge_award")
    for column in ("credential", "status_list_index", "revoked_reason", "revoked_by_user_id", "revoked_at", "status"):
        op.drop_column("badge_award", column)
    op.create_unique_constraint("badge_award_template_id_user_id_key", "badge_award", ["template_id", "user_id"])

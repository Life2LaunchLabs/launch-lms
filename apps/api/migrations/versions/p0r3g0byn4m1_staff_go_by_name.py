"""Staff's name they go by is what learners call them (PO-3, DEV-217)

The separate "What learners call you" name (``userorganization.learner_name``) is retired. A staff member who set one
and has no name they go by gets it as their name they go by (the newest one, when they set several). The column stays
as history and is no longer read.

Revision ID: p0r3g0byn4m1
Revises: p4f3ph0n3a1
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "p0r3g0byn4m1"
down_revision = "p4f3ph0n3a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT uo.user_id, uo.learner_name FROM userorganization uo JOIN \"user\" u ON u.id = uo.user_id "
        "WHERE uo.learner_name IS NOT NULL AND uo.learner_name <> '' AND (u.preferred_name IS NULL OR u.preferred_name = '') "
        "ORDER BY uo.update_date, uo.id"
    )).fetchall()
    chosen: dict[int, str] = {}
    for user_id, name in rows:
        chosen[int(user_id)] = " ".join(str(name).split())[:80]
    for user_id, name in chosen.items():
        bind.execute(sa.text("UPDATE \"user\" SET preferred_name = :name WHERE id = :id"), {"name": name, "id": user_id})


def downgrade() -> None:
    # The old names are still in userorganization.learner_name.
    pass

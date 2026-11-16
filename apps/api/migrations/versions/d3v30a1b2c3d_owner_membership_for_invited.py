"""Give every account a learner membership in the owner organization (FEED-172, DEV-30)

Accounts made through another organization's invitation or join link only joined that organization,
which left them strangers on the main site. New accounts now join both; this adds the missing rows.

Revision ID: d3v30a1b2c3d
Revises: y1w2a3g4e5s6
Create Date: 2026-11-16
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "d3v30a1b2c3d"
down_revision = "y1w2a3g4e5s6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    owner = bind.execute(sa.text("SELECT id FROM organization ORDER BY id LIMIT 1")).scalar()
    if owner is None:
        return
    now = str(datetime.now())
    bind.execute(sa.text(
        "INSERT INTO userorganization (user_id, org_id, role_id, creation_date, update_date) "
        "SELECT u.id, :owner, 4, :now, :now FROM \"user\" u "
        "WHERE NOT EXISTS (SELECT 1 FROM userorganization m WHERE m.user_id = u.id AND m.org_id = :owner)"
    ), {"owner": owner, "now": now})


def downgrade() -> None:
    # The added rows look like any other learner membership; leave them.
    pass

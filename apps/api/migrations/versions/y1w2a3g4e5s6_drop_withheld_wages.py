"""Drop pay figures that are withheld-value codes (Oregon's wage file marks withheld pay with codes like -3)

Revision ID: y1w2a3g4e5s6
Revises: x8r9e0c1o2m3
Create Date: 2026-11-11
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "y1w2a3g4e5s6"
down_revision = "x8r9e0c1o2m3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # A median that isn't above zero is no pay figure at all.
    bind.execute(sa.text("DELETE FROM estimatefact WHERE metric = 'wage' AND value <= 0"))
    # Percentiles that aren't above zero are withheld: leave them out, keep the rest.
    rows = bind.execute(sa.text("SELECT id, percentiles FROM estimatefact WHERE metric = 'wage' AND percentiles IS NOT NULL")).fetchall()
    for fact_id, pct in rows:
        if isinstance(pct, str):
            pct = json.loads(pct)
        if not isinstance(pct, dict):
            continue
        kept = {k: v for k, v in pct.items() if isinstance(v, (int, float)) and v > 0}
        if kept != pct:
            bind.execute(sa.text("UPDATE estimatefact SET percentiles = :p WHERE id = :id"), {"p": json.dumps(kept), "id": fact_id})


def downgrade() -> None:
    # The withheld codes aren't pay; re-import the source file to bring rows back.
    pass

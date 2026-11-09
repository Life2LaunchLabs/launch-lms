"""One interest result per learner

The interest quiz and the picture sort both find the learner's six interest types, and each used to keep its own
"What I'm like" result, so a learner who did both had two. Keep the newest of the two and name it the same way
both now save it.

Revision ID: o5r1a6s2e3c4
Revises: n4a5u6d7i8t9
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "o5r1a6s2e3c4"
down_revision = "n4a5u6d7i8t9"
branch_labels = None
depends_on = None

WAYS = (("interest_quiz", "onet-mini-ip"), ("picture_sort", "l2l-picture-sort"))
NAME = "Interests (RIASEC)"
OLD_NAMES = ("Interest Profiler (RIASEC)", "Picture sort (RIASEC)")


def upgrade() -> None:
    bind = op.get_bind()
    if "portfolioresult" not in sa.inspect(bind).get_table_names():
        return
    result = sa.table("portfolioresult", sa.column("id"), sa.column("portfolio_id"), sa.column("source"), sa.column("source_reference"),
                      sa.column("name"), sa.column("update_date"), sa.column("creation_date"))
    match = sa.or_(*(sa.and_(result.c.source == source, result.c.source_reference == reference) for source, reference in WAYS))
    rows = bind.execute(sa.select(result.c.id, result.c.portfolio_id, result.c.update_date, result.c.creation_date).where(match)).fetchall()
    newest: dict[int, tuple[str, int]] = {}
    extra: list[int] = []
    for row in rows:
        stamp = (row.update_date or row.creation_date or "", row.id)
        kept = newest.get(row.portfolio_id)
        if kept is None:
            newest[row.portfolio_id] = stamp
        elif stamp > kept:
            extra.append(kept[1])
            newest[row.portfolio_id] = stamp
        else:
            extra.append(row.id)
    if extra:
        bind.execute(result.delete().where(result.c.id.in_(extra)))
    bind.execute(result.update().where(match, result.c.name.in_(OLD_NAMES)).values(name=NAME))


def downgrade() -> None:
    # The removed duplicates can't come back; the name change is harmless to keep.
    pass

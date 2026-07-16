"""repair databases stamped before portfolio tables were created

Revision ID: o1p2q3r4s5t6
Revises: n0p1q2r3s4t5

Some development databases were bootstrapped/stamped at n0p1q2r3s4t5 while
the normalized portfolio tables were absent. Keep the original revision
immutable and repair those databases at a new forward-only revision.
"""

import importlib
from typing import Sequence, Union

from alembic import context, op
from sqlalchemy import inspect


revision: str = "o1p2q3r4s5t6"
down_revision: Union[str, None] = "n0p1q2r3s4t5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PORTFOLIO_TABLES = {
    "portfolio",
    "portfoliosection",
    "workitem",
    "workitemblock",
    "portfoliolink",
    "profiletrait",
}


def upgrade() -> None:
    original = importlib.import_module(
        "migrations.versions.n0p1q2r3s4t5_add_portfolio_domain"
    )
    if context.is_offline_mode():
        original.upgrade()
        return

    existing = set(inspect(op.get_bind()).get_table_names())
    present = PORTFOLIO_TABLES & existing
    if present == PORTFOLIO_TABLES:
        return
    if present:
        missing = ", ".join(sorted(PORTFOLIO_TABLES - present))
        raise RuntimeError(
            "Partial portfolio schema detected; refusing an unsafe automatic "
            f"repair. Missing tables: {missing}"
        )

    original.upgrade()


def downgrade() -> None:
    # The repaired tables belong to n0p1q2r3s4t5. Downgrading this repair
    # revision must not remove them; the original revision owns its teardown.
    pass

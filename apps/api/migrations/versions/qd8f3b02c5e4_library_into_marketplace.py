"""one marketplace: library templates become open listings; collections remember where they came from

Revision ID: qd8f3b02c5e4
Revises: pc7e2a91b4d3

The global library was a frozen copy of a template beside its marketplace listing. Every
library template with a live version is now a listing anyone may copy without asking
(listed, open mode, open access), which is what the library offered. The old
library_document / library_published_at columns are left in place, unread.
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'qd8f3b02c5e4'
down_revision: Union[str, None] = 'pc7e2a91b4d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def backfill(bind) -> int:
    """Open listings for library templates that have a live version; returns how many changed."""
    rows = bind.execute(sa.text(
        "SELECT t.id, t.org_id, l.id FROM goal_template t LEFT JOIN goal_template_listing l ON l.template_id = t.id "
        "WHERE t.library_published_at IS NOT NULL AND t.published_version_id IS NOT NULL"
    )).fetchall()
    now = datetime.now().isoformat()
    for template_id, org_id, listing_id in rows:
        if listing_id is None:
            bind.execute(sa.text(
                "INSERT INTO goal_template_listing (template_id, org_id, listed, mode, access, listed_at, creation_date, update_date) "
                "VALUES (:template_id, :org_id, :listed, 'open', 'open', :at, :now, :now)"
            ), {"template_id": template_id, "org_id": org_id, "listed": True, "at": datetime.utcnow(), "now": now})
        else:
            bind.execute(sa.text(
                "UPDATE goal_template_listing SET listed = :listed, mode = 'open', access = 'open', "
                "listed_at = COALESCE(listed_at, :at), update_date = :now WHERE id = :id"
            ), {"id": listing_id, "listed": True, "at": datetime.utcnow(), "now": now})
    return len(rows)


def upgrade() -> None:
    op.add_column('plan_collection', sa.Column('source_collection_uuid', sa.String(), nullable=True))
    op.create_index('ix_plan_collection_source_collection_uuid', 'plan_collection', ['source_collection_uuid'])
    backfill(op.get_bind())


def downgrade() -> None:
    op.drop_index('ix_plan_collection_source_collection_uuid', table_name='plan_collection')
    op.drop_column('plan_collection', 'source_collection_uuid')

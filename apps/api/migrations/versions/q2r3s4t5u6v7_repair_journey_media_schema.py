"""repair journey media schema added after the phase 2 revision ran

Revision ID: q2r3s4t5u6v7
Revises: p2q3r4s5t6u7
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "q2r3s4t5u6v7"
down_revision: Union[str, None] = "p2q3r4s5t6u7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if context.is_offline_mode():
        return

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "journeyentry" not in tables:
        raise RuntimeError(
            "journeyentry is missing; apply p2q3r4s5t6u7 before its media repair"
        )

    journey_columns = {
        column["name"] for column in inspector.get_columns("journeyentry")
    }
    if "cover_asset_id" not in journey_columns:
        op.add_column(
            "journeyentry",
            sa.Column("cover_asset_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_journeyentry_cover_asset_id_mediaasset",
            "journeyentry",
            "mediaasset",
            ["cover_asset_id"],
            ["id"],
            ondelete="SET NULL",
        )

    if "journeyentryblock" not in tables:
        op.create_table(
            "journeyentryblock",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("block_uuid", sa.String(), nullable=False),
            sa.Column(
                "journey_entry_id",
                sa.Integer(),
                sa.ForeignKey("journeyentry.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("block_type", sa.String(), nullable=False),
            sa.Column("data", sa.JSON(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("visibility", sa.String(), nullable=False),
            sa.Column("creation_date", sa.String(), nullable=False),
            sa.Column("update_date", sa.String(), nullable=False),
            sa.UniqueConstraint("block_uuid"),
        )
        op.create_index(
            "ix_journeyentryblock_block_uuid",
            "journeyentryblock",
            ["block_uuid"],
        )
        op.create_index(
            "ix_journeyentryblock_journey_entry_id",
            "journeyentryblock",
            ["journey_entry_id"],
        )


def downgrade() -> None:
    # This repair may be a no-op on databases where p2 created the media schema.
    # Its downgrade must not remove objects owned by that earlier revision.
    pass

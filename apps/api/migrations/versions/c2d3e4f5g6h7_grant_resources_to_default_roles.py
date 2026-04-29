"""grant resources permissions to default roles

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2026-04-29
"""

from copy import deepcopy
from typing import Any

from alembic import op
import sqlalchemy as sa


revision = "c2d3e4f5g6h7"
down_revision = "b1c2d3e4f5g6"
branch_labels = None
depends_on = None


DEFAULT_RESOURCES_FULL_ACCESS = {
    "action_create": True,
    "action_read": True,
    "action_read_own": True,
    "action_update": True,
    "action_update_own": True,
    "action_delete": True,
    "action_delete_own": True,
}

DEFAULT_RESOURCE_CHANNELS_FULL_ACCESS = {
    "action_create": True,
    "action_read": True,
    "action_update": True,
    "action_delete": True,
}

DEFAULT_RESOURCES_READ_ONLY = {
    "action_create": False,
    "action_read": True,
    "action_read_own": True,
    "action_update": False,
    "action_update_own": False,
    "action_delete": False,
    "action_delete_own": False,
}

DEFAULT_RESOURCE_CHANNELS_READ_ONLY = {
    "action_create": False,
    "action_read": True,
    "action_update": False,
    "action_delete": False,
}


def _patch_role_rights(rights: Any) -> Any:
    if not isinstance(rights, dict):
        return rights

    patched = deepcopy(rights)
    patched["resources"] = DEFAULT_RESOURCES_FULL_ACCESS.copy()
    patched["resource_channels"] = DEFAULT_RESOURCE_CHANNELS_FULL_ACCESS.copy()
    return patched


def upgrade() -> None:
    role_table = sa.table(
        "role",
        sa.column("id", sa.Integer),
        sa.column("role_uuid", sa.String),
        sa.column("rights", sa.JSON),
    )
    connection = op.get_bind()

    rows = connection.execute(
        sa.select(role_table.c.id, role_table.c.rights).where(
            role_table.c.role_uuid.in_(
                ["role_global_admin", "role_global_maintainer"]
            )
        )
    ).mappings()

    for row in rows:
        patched_rights = _patch_role_rights(row["rights"])
        connection.execute(
            role_table.update()
            .where(role_table.c.id == row["id"])
            .values(rights=patched_rights)
        )


def downgrade() -> None:
    role_table = sa.table(
        "role",
        sa.column("id", sa.Integer),
        sa.column("role_uuid", sa.String),
        sa.column("rights", sa.JSON),
    )
    connection = op.get_bind()

    rows = connection.execute(
        sa.select(role_table.c.id, role_table.c.rights).where(
            role_table.c.role_uuid.in_(
                ["role_global_admin", "role_global_maintainer"]
            )
        )
    ).mappings()

    for row in rows:
        rights = row["rights"]
        if not isinstance(rights, dict):
            continue

        restored = deepcopy(rights)
        restored["resources"] = DEFAULT_RESOURCES_READ_ONLY.copy()
        restored["resource_channels"] = DEFAULT_RESOURCE_CHANNELS_READ_ONLY.copy()
        connection.execute(
            role_table.update()
            .where(role_table.c.id == row["id"])
            .values(rights=restored)
        )


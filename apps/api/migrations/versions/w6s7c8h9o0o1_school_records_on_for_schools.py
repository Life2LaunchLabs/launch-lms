"""orgs: school records stay on for organizations that already use them (DEV-152)

`school_records` is a new field of the organization config. Unset, it follows the /start role
(services/orgs/school_records.enabled_in): off for parent, mentor, program and training spaces, on
for everyone else. Any organization that already has school records or EPP data (a support link, a
planned course, a saved record or the Oregon EPP framework) is set on explicitly here, so no school
loses them whatever role it started with. Downgrade removes the field.

Revision ID: w6s7c8h9o0o1
Revises: v5c6o7a8c9h0
Create Date: 2026-11-17
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "w6s7c8h9o0o1"
down_revision = "v5c6o7a8c9h0"
branch_labels = None
depends_on = None

FRAMEWORK_NAME = "Oregon Education Plan and Profile (EPP)"


def _config(raw) -> dict:
    if isinstance(raw, str):
        return json.loads(raw or "{}")
    return dict(raw or {})


def _save(conn, row_id: int, config: dict) -> None:
    conn.execute(sa.text("UPDATE organizationconfig SET config = :config WHERE id = :id").bindparams(sa.bindparam("config", type_=sa.JSON)),
                 {"config": config, "id": row_id})


def upgrade() -> None:
    conn = op.get_bind()
    using: set[int] = set()
    for query in ("SELECT DISTINCT org_id FROM learnersupport", "SELECT DISTINCT org_id FROM eppcourse", "SELECT DISTINCT org_id FROM epprecord"):
        using.update(int(org_id) for (org_id,) in conn.execute(sa.text(query)) if org_id is not None)
    using.update(int(org_id) for (org_id,) in conn.execute(sa.text("SELECT DISTINCT org_id FROM requirementframework WHERE name = :name"), {"name": FRAMEWORK_NAME})
                 if org_id is not None)
    for row_id, org_id, raw in list(conn.execute(sa.text("SELECT id, org_id, config FROM organizationconfig"))):
        config = _config(raw)
        if org_id in using and not isinstance(config.get("school_records"), bool):
            _save(conn, row_id, {**config, "school_records": True})


def downgrade() -> None:
    conn = op.get_bind()
    for row_id, _, raw in list(conn.execute(sa.text("SELECT id, org_id, config FROM organizationconfig"))):
        config = _config(raw)
        if "school_records" in config:
            config.pop("school_records")
            _save(conn, row_id, config)

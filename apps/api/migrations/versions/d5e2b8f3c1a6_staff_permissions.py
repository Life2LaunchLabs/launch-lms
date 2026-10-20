"""roles: Admin, Staff and Learner, with per-staff permissions

An organization now has three roles. What each staff member may do is a set of permissions the
admin gives them (security/org_auth.STAFF_PERMISSIONS), stored on the membership:

- Maintainers (role 2, now "Staff") keep everything: every permission.
- Instructors (role 3, retired) become staff who build plans, run assignments and review work.
- Members of custom roles that open the dashboard become staff with the default permissions;
  other custom-role members become learners. The custom role rows stay until the pruning drop.
- Pending invitations, join links and SSO defaults on those roles move the same way.
- Role 4 is renamed "Learner".

Orgs that now have more staff than their tier allows get the difference as a grant.

Revision ID: d5e2b8f3c1a6
Revises: c4d1a7e2b9f0
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e2b8f3c1a6'
down_revision: Union[str, None] = 'c4d1a7e2b9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADMIN, STAFF, INSTRUCTOR, LEARNER = 1, 2, 3, 4
EVERYTHING = ["build_plans", "run_assignments", "review_work", "manage_learners", "see_reports"]
INSTRUCTOR_PERMISSIONS = ["build_plans", "run_assignments", "review_work"]
# Frozen copy of the staff seat limits (0 is unlimited).
STAFF_SEATS = {"free": 2, "full": 12, "enterprise": 0}


def _json(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return {}
    return value or {}


def _set_permissions(conn, where: str, permissions: list[str] | None, params: dict | None = None) -> None:
    conn.execute(
        sa.text(f"UPDATE userorganization SET permissions = :permissions WHERE {where}").bindparams(sa.bindparam("permissions", type_=sa.JSON)),
        {"permissions": permissions, **(params or {})},
    )


def _move_role(conn, old: int, new: int) -> None:
    for table, column in (("userorganization", "role_id"), ("organizationinvitation", "role_id"),
                          ("organizationjoinlink", "role_id"), ("ssoconnection", "default_role_id")):
        conn.execute(sa.text(f"UPDATE {table} SET {column} = :new WHERE {column} = :old"), {"new": new, "old": old})


def grant_staff_overage(config: dict, staff: int) -> dict:
    """Add an extra-seat grant when the org already has more staff than its tier allows."""
    base = STAFF_SEATS.get(config.get("tier") or "free", 2)
    if not base:
        return config
    grants = dict(config.get("grants") or {})
    allowed = base + int((grants.get("staff_seats") or {}).get("extra", 0))
    if staff > allowed:
        grants["staff_seats"] = {"extra": staff - base}
    return {**config, "grants": grants}


def upgrade() -> None:
    op.add_column('userorganization', sa.Column('permissions', sa.JSON(), nullable=True))
    conn = op.get_bind()

    _set_permissions(conn, "role_id = :staff", EVERYTHING, {"staff": STAFF})
    _set_permissions(conn, "role_id = :instructor", INSTRUCTOR_PERMISSIONS, {"instructor": INSTRUCTOR})
    _move_role(conn, INSTRUCTOR, STAFF)

    for role_id, rights in list(conn.execute(sa.text("SELECT id, rights FROM role WHERE role_type = 'TYPE_ORGANIZATION'"))):
        opens_dashboard = bool((_json(rights).get("dashboard") or {}).get("action_access"))
        _move_role(conn, int(role_id), STAFF if opens_dashboard else LEARNER)

    conn.execute(sa.text("UPDATE role SET name = 'Staff', description = 'Staff: what each one may do is set by an admin' WHERE id = :id"), {"id": STAFF})
    conn.execute(sa.text("UPDATE role SET name = 'Learner' WHERE id = :id"), {"id": LEARNER})

    owner_id = conn.execute(sa.text("SELECT MIN(id) FROM organization")).scalar()
    for row_id, org_id, raw in list(conn.execute(sa.text("SELECT id, org_id, config FROM organizationconfig"))):
        if org_id == owner_id:
            continue
        config = _json(raw)
        staff = conn.execute(sa.text("SELECT COUNT(*) FROM userorganization WHERE org_id = :org AND role_id IN (:admin, :staff)"),
                             {"org": org_id, "admin": ADMIN, "staff": STAFF}).scalar() or 0
        updated = grant_staff_overage(config, int(staff))
        if updated != config:
            conn.execute(
                sa.text("UPDATE organizationconfig SET config = :config WHERE id = :id").bindparams(sa.bindparam("config", type_=sa.JSON)),
                {"config": updated, "id": row_id},
            )


def downgrade() -> None:
    # Instructors and custom-role members can't be told apart from other staff any more.
    op.drop_column('userorganization', 'permissions')
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE role SET name = 'Maintainer' WHERE id = :id"), {"id": STAFF})
    conn.execute(sa.text("UPDATE role SET name = 'User' WHERE id = :id"), {"id": LEARNER})

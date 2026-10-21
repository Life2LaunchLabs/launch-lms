"""plans: permission on a plan is permission to issue the badges it earns

Who may issue a badge moves from the badge (``badgeissuerauthorization``) and a route's trusted
partners (``badgeroute.trusted_only`` + ``badge_route_partner``) to the plan templates that earn it
(``goal_template_authorization``). A plan meant for trusted partners only is one whose owner
approves only trusted partners.

So nothing that ran stops running, every approved badge issuer is approved on each of the badge's
plans it could run: every route, except a trusted-partners-only route unless it was a partner
there. A pending plan request becomes approved; a plan permission the owner rejected or revoked
stays as it was. The old tables and columns stay (no longer read).

Revision ID: a8c4e1f7d2b9
Revises: f7a3c9d2b8e4
"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c4e1f7d2b9'
down_revision: Union[str, None] = 'f7a3c9d2b8e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def plan_permissions(routes, authorizations, partners) -> set[tuple[int, int, int]]:
    """(template id, template owner org id, issuer org id) to approve.

    ``routes``: (route id, badge id, template id, trusted only, template owner org id);
    ``authorizations``: (badge id, issuer org id, status); ``partners``: (route id, issuer org id).
    """
    trusted = {(route_id, org_id) for route_id, org_id in partners}
    issuers: dict[int, set[int]] = {}
    for badge_id, org_id, status in authorizations:
        if status == "approved":
            issuers.setdefault(badge_id, set()).add(org_id)
    result: set[tuple[int, int, int]] = set()
    for route_id, badge_id, template_id, trusted_only, owner_id in routes:
        if template_id is None:
            continue
        for org_id in issuers.get(badge_id, set()):
            if org_id == owner_id or (trusted_only and (route_id, org_id) not in trusted):
                continue
            result.add((template_id, owner_id, org_id))
    return result


def backfill(conn) -> int:
    """Approve the plan permissions; returns how many rows it wrote or changed."""
    tables = set(sa.inspect(conn).get_table_names())
    if not {"badgeroute", "learningbadge", "badgeissuerauthorization", "goal_template", "goal_template_authorization"} <= tables:
        return 0
    routes = conn.execute(sa.text(
        "SELECT r.id, r.badge_id, r.goal_template_id, r.trusted_only, t.org_id FROM badgeroute r "
        "JOIN learningbadge b ON b.id = r.badge_id JOIN goal_template t ON t.id = r.goal_template_id "
        "WHERE b.deleted_at IS NULL"
    )).fetchall()
    authorizations = conn.execute(sa.text("SELECT badge_id, issuer_org_id, status FROM badgeissuerauthorization")).fetchall()
    partners = conn.execute(sa.text("SELECT route_id, issuer_org_id FROM badge_route_partner")).fetchall() if "badge_route_partner" in tables else []
    wanted = plan_permissions([tuple(row) for row in routes], [tuple(row) for row in authorizations], [tuple(row) for row in partners])
    existing = {(row[0], row[1]): row[2] for row in conn.execute(sa.text(
        "SELECT template_id, issuer_org_id, status FROM goal_template_authorization")).fetchall()}
    now = datetime.now().isoformat()
    decided = datetime.utcnow()
    written = 0
    for template_id, owner_id, org_id in sorted(wanted):
        status = existing.get((template_id, org_id))
        if status is None:
            conn.execute(sa.text(
                "INSERT INTO goal_template_authorization (authorization_uuid, template_id, creator_org_id, issuer_org_id, status, message, "
                "decided_at, creation_date, update_date) VALUES (:uuid, :template_id, :owner_id, :org_id, 'approved', '', :decided, :now, :now)"
            ), {"uuid": f"template_auth_{uuid4()}", "template_id": template_id, "owner_id": owner_id, "org_id": org_id, "decided": decided, "now": now})
            written += 1
        elif status == "requested":
            conn.execute(sa.text(
                "UPDATE goal_template_authorization SET status = 'approved', decided_at = :decided, update_date = :now "
                "WHERE template_id = :template_id AND issuer_org_id = :org_id"
            ), {"template_id": template_id, "org_id": org_id, "decided": decided, "now": now})
            written += 1
    return written


def upgrade() -> None:
    backfill(op.get_bind())


def downgrade() -> None:
    # The copied permissions stay: they were granted by the badge's owner, and the old records are untouched.
    pass

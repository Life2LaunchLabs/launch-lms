"""plans: learner access per plan an organization runs

Who may start a plan (open, by request, invited learners only) moves from each issuer's badge
authorization to the plans it runs: one row per (template, organization), no row meaning invite.

Existing badge-level settings are copied onto the badge's routes each issuer runs, so nothing
that was open becomes hidden: the creator's own setting (open when it never recorded one, none
when it stopped issuing) and each approved issuer's, on the routes it offers and is trusted for.
Where one plan earns several badges, the most open setting wins. The authorization columns stay.

Revision ID: f7a3c9d2b8e4
Revises: d5e2b8f3c1a6
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7a3c9d2b8e4'
down_revision: Union[str, None] = 'd5e2b8f3c1a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEVELS = ("invite", "request", "open")


def _access(learner_access, open_to_all) -> str:
    if learner_access in LEVELS:
        return learner_access
    return "request" if open_to_all else "invite"


def plan_access_rows(routes, authorizations, offers, partners) -> dict[tuple[int, int], str]:
    """(template id, org id) -> access from the badge-level settings.

    ``routes``: (route id, badge id, template id, trusted only, badge owner org id);
    ``authorizations``: (badge id, issuer org id, status, learner_access, open_to_all);
    ``offers`` and ``partners``: (route id, issuer org id).
    """
    offered: dict[int, set[int]] = {}
    route_badge = {route_id: badge_id for route_id, badge_id, *_ in routes}
    for route_id, org_id in offers:
        if route_id in route_badge:
            offered.setdefault(org_id, set()).add(route_id)
    trusted = {(route_id, org_id) for route_id, org_id in partners}
    by_badge: dict[int, list[tuple]] = {}
    for row in authorizations:
        by_badge.setdefault(row[0], []).append(row)
    result: dict[tuple[int, int], str] = {}

    def keep(template_id: int, org_id: int, access: str) -> None:
        if access == "invite":
            return
        key = (template_id, org_id)
        if LEVELS.index(access) > LEVELS.index(result.get(key, "invite")):
            result[key] = access

    for route_id, badge_id, template_id, trusted_only, owner_id in routes:
        if template_id is None:
            continue
        rows = by_badge.get(badge_id, [])
        own = next((row for row in rows if row[1] == owner_id), None)
        if own is None:
            keep(template_id, owner_id, "open")
        elif own[2] == "approved":
            keep(template_id, owner_id, _access(own[3], own[4]))
        for _, org_id, status, learner_access, open_to_all in rows:
            if org_id == owner_id or status != "approved":
                continue
            # An issuer offering only some routes runs just those; a trusted-partners route needs the owner's approval.
            badge_routes = {other for other, badge in route_badge.items() if badge == badge_id}
            chosen = offered.get(org_id, set()) & badge_routes
            if chosen and route_id not in chosen:
                continue
            if trusted_only and (route_id, org_id) not in trusted:
                continue
            keep(template_id, org_id, _access(learner_access, open_to_all))
    return result


def backfill(conn) -> int:
    """Copy the badge-level settings onto the plans; returns how many rows it wrote."""
    tables = set(sa.inspect(conn).get_table_names())
    if not {"badgeroute", "learningbadge", "badgeissuerauthorization"} <= tables:
        return 0
    routes = conn.execute(sa.text(
        "SELECT r.id, r.badge_id, r.goal_template_id, r.trusted_only, b.org_id FROM badgeroute r "
        "JOIN learningbadge b ON b.id = r.badge_id WHERE r.goal_template_id IS NOT NULL AND b.deleted_at IS NULL"
    )).fetchall()
    authorizations = conn.execute(sa.text(
        "SELECT badge_id, issuer_org_id, status, learner_access, open_to_all FROM badgeissuerauthorization"
    )).fetchall()
    offers = conn.execute(sa.text("SELECT route_id, issuer_org_id FROM badgerouteoffer")).fetchall() if "badgerouteoffer" in tables else []
    partners = conn.execute(sa.text("SELECT route_id, issuer_org_id FROM badge_route_partner")).fetchall() if "badge_route_partner" in tables else []
    rows = plan_access_rows([tuple(row) for row in routes], [tuple(row) for row in authorizations], [tuple(row) for row in offers], [tuple(row) for row in partners])
    existing = {tuple(row) for row in conn.execute(sa.text("SELECT template_id, org_id FROM goal_template_learner_access")).fetchall()}
    now = datetime.now().isoformat()
    written = 0
    for (template_id, org_id), access in sorted(rows.items()):
        if (template_id, org_id) in existing:
            continue
        conn.execute(sa.text(
            "INSERT INTO goal_template_learner_access (template_id, org_id, access, creation_date, update_date) "
            "VALUES (:template_id, :org_id, :access, :now, :now)"
        ), {"template_id": template_id, "org_id": org_id, "access": access, "now": now})
        written += 1
    return written


def upgrade() -> None:
    op.create_table(
        'goal_template_learner_access',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('goal_template.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('access', sa.String(), nullable=False, server_default='invite'),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.Column('update_date', sa.String(), nullable=False, server_default=''),
        sa.UniqueConstraint('template_id', 'org_id'),
    )
    op.create_index('ix_goal_template_learner_access_template_id', 'goal_template_learner_access', ['template_id'])
    op.create_index('ix_goal_template_learner_access_org_id', 'goal_template_learner_access', ['org_id'])
    backfill(op.get_bind())


def downgrade() -> None:
    op.drop_index('ix_goal_template_learner_access_org_id', table_name='goal_template_learner_access')
    op.drop_index('ix_goal_template_learner_access_template_id', table_name='goal_template_learner_access')
    op.drop_table('goal_template_learner_access')

"""The account's one phone number (PF-3, DEV-213): carry the résumé phone over

The résumé's phone used to be set in the portfolio's Your profile box (``portfolio.theme_settings.resume_contact``).
It is now the account's phone, set in Settings (``user.details.phone``), and the résumé email is the main email.
Accounts that already have a phone keep it.

Revision ID: p4f3ph0n3a1
Revises: u53r3m41l5a1
Create Date: 2026-11-25
"""

import json

import sqlalchemy as sa
from alembic import op

revision = "p4f3ph0n3a1"
down_revision = "u53r3m41l5a1"
branch_labels = None
depends_on = None


def _load(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT p.user_id, p.theme_settings, u.details FROM portfolio p JOIN \"user\" u ON u.id = p.user_id")).fetchall()
    value = "CAST(:details AS JSON)" if bind.dialect.name == "postgresql" else ":details"
    for user_id, theme, details in rows:
        phone = str((_load(theme).get("resume_contact") or {}).get("phone") or "").strip()
        current = _load(details)
        if not phone or current.get("phone"):
            continue
        current["phone"] = phone
        bind.execute(sa.text(f"UPDATE \"user\" SET details = {value} WHERE id = :id"), {"details": json.dumps(current), "id": user_id})


def downgrade() -> None:
    # The phone stays on the account; the old résumé contact was never removed.
    pass

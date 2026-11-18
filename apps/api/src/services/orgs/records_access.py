"""Who opened a learner's records: staff reads of a learner's profile, plans, hand-ins, files and EPP, kept in the
organization's audit log so an admin can answer a parent's records request (OP-3).

Each read is one audit row with action ``records.view`` and resource ``learner:<id>:<what>``. The same person opening
the same thing again within a few minutes isn't logged twice, so a page that loads a file in pieces (a video) or
refreshes stays one line. Rows name the staff member, never the learner, so they outlive a deleted account.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, select

from src.db.audit_logs import AuditLog
from src.db.users import User

logger = logging.getLogger(__name__)

VIEW = "records.view"
EXPORT = "records.export"
DELETE = "records.delete"
ACTIONS = (VIEW, EXPORT, DELETE)
REPEAT_WINDOW = timedelta(minutes=10)


def resource(learner_id: int, what: str) -> str:
    return f"learner:{int(learner_id)}:{what}"


def _staff(db: Session, org_id: int, viewer_id: int) -> bool:
    from src.security.superadmin import is_user_superadmin
    from src.services.school.roles import is_staff

    return is_staff(db, org_id, viewer_id) or is_user_superadmin(viewer_id, db)


def note(db: Session, viewer_id: int | None, org_id: int | None, learner_id: int | None, what: str, detail: str = "",
         action: str = VIEW) -> None:
    """Log that ``viewer_id`` opened part of ``learner_id``'s records in ``org_id``. Best effort: never raises.

    Only staff (and superadmins) are logged; a learner opening their own records, or a helper on their plan, isn't.
    Commits the session first, as every audit write does.
    """
    if not viewer_id or not org_id or not learner_id or int(viewer_id) == int(learner_id):
        return
    try:
        if not _staff(db, int(org_id), int(viewer_id)):
            return
        where = resource(int(learner_id), what)
        since = (datetime.now(timezone.utc) - REPEAT_WINDOW).isoformat()
        if action == VIEW and db.exec(select(AuditLog.id).where(
            AuditLog.org_id == org_id, AuditLog.user_id == viewer_id, AuditLog.action == action,
            AuditLog.resource == where, AuditLog.created_at >= since,
            *([AuditLog.resource_id == detail[:200]] if detail else []),
        ).limit(1)).first():
            return
        from src.services.audit_logs import record_audit_log, resolve_user_snapshot

        username, name = resolve_user_snapshot(db, int(viewer_id))
        record_audit_log(
            db, action=action, resource=where, status_code=200, org_id=int(org_id), user_id=int(viewer_id),
            username=username, name=name, resource_id=detail[:200] or None,
            request_metadata={"learner_id": int(learner_id), "what": what, "detail": detail[:200]},
        )
    except Exception:  # an audit write never breaks the read it records
        db.rollback()
        logger.exception("Couldn't log a records read")


LABELS = {
    (VIEW, "profile"): "Opened their profile",
    (VIEW, "plan"): "Opened a plan",
    (VIEW, "file"): "Opened a file they handed in",
    (VIEW, "epp"): "Opened their Education Plan and Profile",
    (EXPORT, "records"): "Downloaded their records",
    (DELETE, "records"): "Deleted their account and data",
}


def history(db: Session, org_id: int, learner_id: int, offset: int = 0, limit: int = 50) -> dict:
    """The newest reads of this learner's records in the organization, with who and when."""
    prefix = f"learner:{int(learner_id)}:"
    query = select(AuditLog).where(
        AuditLog.org_id == org_id, col(AuditLog.action).in_(ACTIONS), col(AuditLog.resource).startswith(prefix),
    )
    rows = db.exec(query.order_by(col(AuditLog.created_at).desc(), col(AuditLog.id).desc()).offset(offset).limit(limit + 1)).all()
    more = len(rows) > limit
    people: dict[int, User | None] = {}
    items = []
    for row in rows[:limit]:
        what = row.resource[len(prefix):]
        if row.user_id and row.user_id not in people:
            people[row.user_id] = db.get(User, row.user_id)
        who = people.get(row.user_id) if row.user_id else None
        name = " ".join(part for part in [who.first_name, who.last_name] if part).strip() if who else ""
        items.append({
            "id": row.id, "at": row.created_at, "action": row.action, "what": what,
            "label": LABELS.get((row.action, what), "Opened their records"),
            "detail": (row.request_metadata or {}).get("detail") or "",
            "by": {"id": row.user_id, "name": name or row.name or row.username or "Someone no longer here",
                   "username": who.username if who else row.username, "avatar_image": who.avatar_image if who else None,
                   "user_uuid": who.user_uuid if who else None},
        })
    return {"items": items, "offset": offset, "more": more}

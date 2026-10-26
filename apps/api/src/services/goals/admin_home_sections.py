"""Home's sections that list things: the welcome note, Needs you, the viewer's assignments, and Continue.

- ``welcome``: the note in the invitation the viewer accepted, with who sent it.
- ``needs_you``: the Threads rows with something waiting on the viewer (``school.feed.active_rows``), plus
  the staff and organization threads when they have something unread (``school.threads.pinned``).
- ``assignments``: running assignments as the Assignments list shows them (``assignment_views``), with the
  viewer's role on each.
- ``continue_items``: what the org built or edited last: plans, requirement frameworks and resource channels.
  There's no per-person edit history, so it's the org's latest edits, not only the viewer's.
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.goals import GoalAssignment, GoalTemplate, TemplateStatus
from src.db.organization_invitations import OrganizationInvitation
from src.db.requirements import RequirementFramework
from src.db.resources import ResourceChannel
from src.db.users import PublicUser, User
from src.services.goals import assignment_status, assignment_views
from src.services.goals.assignment_staff import assignment_role
from src.services.goals.assignment_summary import collaborators_of
from src.services.goals.review import person

LIMIT = 6
CONTINUE_LIMIT = 4


def welcome(db: Session, user_id: int, org_id: int) -> dict | None:
    """The note from the invitation this member accepted, and who wrote it; None without a note."""
    invitation = db.exec(select(OrganizationInvitation).where(
        OrganizationInvitation.org_id == org_id, OrganizationInvitation.target_user_id == user_id, OrganizationInvitation.status == "accepted",
    ).order_by(col(OrganizationInvitation.accepted_at).desc())).first()
    if not invitation or not (invitation.note or "").strip():
        return None
    inviter = db.get(User, invitation.created_by_user_id) if invitation.created_by_user_id else None
    return {"note": invitation.note.strip(), "from": person(inviter) if inviter else None, "at": invitation.accepted_at}


def _pinned_row(row: dict) -> dict:
    """The staff or organization thread in the shape of a Threads row: its unread are messages, or join requests for the org."""
    unread = int(row.get("unread") or 0)
    kind = "messages" if row["kind"] != "org" else "approvals"
    counts = {"messages": 0, "turn_ins": 0, "approvals": 0} | {kind: unread}
    return {"key": row["key"], "kind": row["kind"], "title": row["title"], "chat_uuid": row.get("chat_uuid"), "at": row.get("at") or "",
            "preview": row.get("preview") or "", "counts": counts, "total": unread, "person": None, "group": None}


def needs_you(db: Session, current_user: PublicUser, org_id: int, staff: bool) -> dict:
    """Threads with something waiting on the viewer, newest first."""
    from src.services.school import feed, threads

    rows, _ = feed.active_rows(db, current_user, org_id)
    waiting = [{key: row.get(key) for key in ("key", "kind", "title", "chat_uuid", "at", "preview", "counts", "total", "person", "group", "role")}
               for row in rows if row["total"] > 0]
    if staff:
        waiting += [_pinned_row(row) for row in threads.pinned(db, current_user, org_id) if row.get("unread")]
    waiting.sort(key=lambda row: str(row.get("at") or ""), reverse=True)
    return {"rows": waiting[:LIMIT], "total": len(waiting)}


def role_on(assignment: GoalAssignment, user_id: int) -> str | None:
    """The viewer's role on an assignment: lead, review or comment; whoever handed it out leads it."""
    for item in collaborators_of(assignment):
        if int(item["user_id"]) == user_id:
            return assignment_role(item.get("role_key")) or "review"
    return "lead" if assignment.owner_user_id == user_id else None


def assignments(db: Session, current_user: PublicUser, mine: list[GoalAssignment], everyone: list[GoalAssignment] | None) -> dict:
    """The running assignments the viewer is on, as the Assignments list shows them; for admins, all of them too."""
    viewer = int(current_user.id)  # type: ignore[arg-type]
    built: dict[int, dict] = {}

    def summary(row: GoalAssignment) -> dict:
        if row.id not in built:
            built[int(row.id)] = {**assignment_views._summary(db, current_user, row, assignment_status.board(db, row, viewer)),  # type: ignore[arg-type]
                                  "my_role": role_on(row, viewer)}
        return built[int(row.id)]  # type: ignore[arg-type]

    return {"mine": [summary(row) for row in mine], "all": [summary(row) for row in everyone] if everyone is not None else None}


def continue_items(db: Session, org_id: int) -> list[dict]:
    """The org's most recently edited plans, requirement frameworks and resource channels, newest first."""
    plans = db.exec(select(GoalTemplate).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED.value,
                                               col(GoalTemplate.system_type).is_(None)).order_by(col(GoalTemplate.update_date).desc()).limit(CONTINUE_LIMIT)).all()
    frameworks = db.exec(select(RequirementFramework).where(RequirementFramework.org_id == org_id, RequirementFramework.archived == False)  # noqa: E712
                         .order_by(col(RequirementFramework.update_date).desc()).limit(CONTINUE_LIMIT)).all()
    channels = db.exec(select(ResourceChannel).where(ResourceChannel.org_id == org_id)
                       .order_by(col(ResourceChannel.update_date).desc()).limit(CONTINUE_LIMIT)).all()
    running = {template_id for template_id in db.exec(select(GoalAssignment.template_id).where(GoalAssignment.org_id == org_id, GoalAssignment.status == "active")).all()}
    items = [{
        "kind": "plan", "uuid": plan.template_uuid, "title": plan.title, "icon": plan.icon, "color": plan.color, "thumbnail_image": plan.thumbnail_image,
        "state": "draft" if plan.draft or not plan.published_version_id else "live", "running": plan.id in running, "update_date": plan.update_date,
    } for plan in plans]
    items += [{"kind": "framework", "uuid": framework.framework_uuid, "title": framework.name, "state": "live" if framework.published_version else "draft",
               "update_date": framework.update_date} for framework in frameworks]
    items += [{"kind": "channel", "uuid": channel.channel_uuid, "title": channel.name, "state": "live", "update_date": channel.update_date} for channel in channels]
    items.sort(key=lambda item: item["update_date"] or "", reverse=True)
    return items[:CONTINUE_LIMIT]

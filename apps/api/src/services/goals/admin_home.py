"""The admin Home: what needs the viewer today and how their org's work is going, in one call.

Each widget is built from the service that already owns its data:

- ``waiting``: the review inbox (``review.inbox``), plus open chat reports for admins.
- ``today``: steps closing and stages opening soon across the assignments the viewer staffs,
  read from each assignment's matrix (``staff_views.assignment_matrix``).
- ``messages``: the viewer's latest chats in this org (``connect.chats``).
- ``attention``: assignments with learners behind or work waiting on staff, from the same matrices.
- ``creator``: starts and completions of the org's own templates and badges (``admin_home_creator``).

Which widgets a viewer gets follows their role: staff work for anyone who staffs an assignment or
administers the org, creator metrics for admins of an org that makes templates or badges. Each
member orders and hides widgets for themselves; the layout lives on their membership row.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember
from src.db.goal_admin import ADMIN_HOME_WIDGETS, PLANS_TABS, PLANS_TABS_CREATOR, AdminHomeLayout, PlansTabsOrder
from src.db.goals import DONE_STEP_STATUSES, AssignmentStatus, GoalAssignment
from src.db.users import PublicUser
from src.security.org_auth import get_user_org, is_org_admin, require_org_membership
from src.services.goals import admin_home_creator, admin_home_start, review, staff_views

# How far ahead "today and upcoming" looks.
UPCOMING_DAYS = 7
LIMIT = 8
PREFERENCES_KEY = "admin_home"
PLANS_TABS_KEY = "plans_tabs"


def _value(item) -> str:
    return getattr(item, "value", item)


# Layout ----------------------------------------------------------------------------------

def _layout(saved: dict | None) -> dict:
    """The saved order and hidden widgets, cleaned of unknown ids, with new widgets appended in default order."""
    saved = saved or {}
    order = [item for item in dict.fromkeys(saved.get("order") or []) if item in ADMIN_HOME_WIDGETS]
    order += [item for item in ADMIN_HOME_WIDGETS if item not in order]
    hidden = [item for item in dict.fromkeys(saved.get("hidden") or []) if item in ADMIN_HOME_WIDGETS]
    return {"order": order, "hidden": hidden}


def get_layout(db: Session, user_id: int, org_id: int) -> dict:
    membership = get_user_org(user_id, org_id, db)
    return _layout(((membership.preferences or {}) if membership else {}).get(PREFERENCES_KEY))


def save_layout(db: Session, current_user: PublicUser, org_id: int, payload: AdminHomeLayout) -> dict:
    """Keep this member's widget order and hidden widgets for this org."""
    require_org_membership(current_user.id, org_id, db)
    unknown = sorted({*payload.order, *payload.hidden} - set(ADMIN_HOME_WIDGETS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown widgets: {', '.join(unknown)}")
    membership = get_user_org(current_user.id, org_id, db)
    if not membership:
        raise HTTPException(status_code=409, detail="Only members of this organization can save a Home layout")
    layout = _layout(payload.model_dump())
    # A new dict, so the JSON column sees the change.
    membership.preferences = {**(membership.preferences or {}), PREFERENCES_KEY: layout}
    db.add(membership)
    db.commit()
    return layout


# Plans tab order -------------------------------------------------------------------------

def default_plans_tabs(db: Session, org_id: int) -> list[str]:
    """Badges and Templates first for an org that makes them and runs no assignment itself; Assignments first otherwise."""
    if admin_home_creator.creates(db, org_id):
        running = db.exec(select(GoalAssignment.id).where(GoalAssignment.org_id == org_id, GoalAssignment.status == AssignmentStatus.ACTIVE.value).limit(1)).first()
        if not running:
            return list(PLANS_TABS_CREATOR)
    return list(PLANS_TABS)


def _tab_order(saved: list | None, default: list[str]) -> list[str]:
    """The saved order cleaned of unknown or repeated ids, with tabs it never placed appended in default order."""
    order = [item for item in dict.fromkeys(saved or []) if item in PLANS_TABS]
    return order + [item for item in default if item not in order]


def _plans_tabs(db: Session, org_id: int, saved: list | None) -> dict:
    default = default_plans_tabs(db, org_id)
    return {"order": _tab_order(saved, default), "default": default, "saved": bool(saved)}


def get_plans_tabs(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """This member's Plans tab order, the org's default (for Reset), and whether they saved their own."""
    require_org_membership(current_user.id, org_id, db)
    membership = get_user_org(current_user.id, org_id, db)
    return _plans_tabs(db, org_id, ((membership.preferences or {}) if membership else {}).get(PLANS_TABS_KEY))


def save_plans_tabs(db: Session, current_user: PublicUser, org_id: int, payload: PlansTabsOrder) -> dict:
    """Keep this member's Plans tab order for this org; an empty order goes back to the default."""
    require_org_membership(current_user.id, org_id, db)
    unknown = sorted(set(payload.order) - set(PLANS_TABS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown tabs: {', '.join(unknown)}")
    membership = get_user_org(current_user.id, org_id, db)
    if not membership:
        raise HTTPException(status_code=409, detail="Only members of this organization can save a tab order")
    # A new dict, so the JSON column sees the change.
    preferences = {**(membership.preferences or {})}
    if payload.order:
        preferences[PLANS_TABS_KEY] = list(dict.fromkeys(payload.order))
    else:
        preferences.pop(PLANS_TABS_KEY, None)
    membership.preferences = preferences
    db.add(membership)
    db.commit()
    return _plans_tabs(db, org_id, preferences.get(PLANS_TABS_KEY))


# Staff work ------------------------------------------------------------------------------

def _staffed(db: Session, current_user: PublicUser, org_id: int, admin: bool) -> tuple[list[GoalAssignment], list[GoalAssignment]]:
    """Active assignments the viewer staffs (or assigned), and the ones they oversee (all of them, for admins)."""
    rows = db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id, GoalAssignment.status == AssignmentStatus.ACTIVE.value)
                   .order_by(col(GoalAssignment.creation_date).desc(), col(GoalAssignment.id).desc())).all()
    mine = [row for row in rows if current_user.id in (row.staff_user_ids or []) or row.owner_user_id == current_user.id]
    return mine, (list(rows) if admin else mine)


def _matrix(db: Session, current_user: PublicUser, org_id: int, assignment: GoalAssignment, cache: dict) -> dict | None:
    if assignment.id not in cache:
        try:
            cache[assignment.id] = staff_views.assignment_matrix(db, current_user, org_id, assignment.assignment_uuid)
        except HTTPException:
            cache[assignment.id] = None
    return cache[assignment.id]


def _who(summary: dict) -> dict:
    """The assignment as a Home row names it: its template and who it went to."""
    user = summary.get("user") or {}
    name = " ".join(part for part in (user.get("first_name"), user.get("last_name")) if part) or user.get("username")
    return {
        "assignment_uuid": summary["assignment_uuid"], "template_uuid": summary["template_uuid"], "template_title": summary["template_title"],
        "assigned_to": (summary.get("cohort") or {}).get("name") or name or summary.get("subject_email") or "",
        "assignment_type": summary["assignment_type"], "goal_uuid": summary.get("goal_uuid"), "learner_count": summary["learner_count"],
    }


def today(matrices: list[dict], today_date: date | None = None) -> dict:
    """Steps closing and stages opening from today through the next week, soonest first."""
    start = today_date or date.today()
    horizon = start + timedelta(days=UPCOMING_DAYS)
    items: list[dict] = []
    for matrix in matrices:
        who = _who(matrix["assignment"])
        learners = matrix["learners"]
        for stage in matrix["stages"]:
            opens = stage.get("start_date")
            if opens and start <= opens <= horizon and stage["steps"]:
                items.append({"kind": "stage_opens", "date": opens, **who, "stage_key": stage["stage_key"], "stage_title": stage["title"],
                              "title": stage["title"], "step_count": len(stage["steps"])})
            for column in stage["steps"]:
                cells = [learner["cells"][column["template_key"]] for learner in learners if column["template_key"] in learner["cells"]]
                waiting_on = [cell for cell in cells if cell["status"] not in DONE_STEP_STATUSES]
                closes = min((cell["due_date"] for cell in waiting_on if cell["due_date"]), default=None) or (stage.get("due_date") if waiting_on else None)
                if closes and start <= closes <= horizon:
                    aggregate = column["aggregate"]
                    items.append({
                        "kind": "step_closes", "date": closes, **who, "stage_key": stage["stage_key"], "stage_title": stage["title"],
                        "step_key": column["template_key"], "title": column["title"], "type": column["type"], "completed_by": column["completed_by"],
                        "counts": {name: aggregate[f"{name}_count"] for name in staff_views.BUCKETS} | {"learners": len(cells)},
                    })
    items.sort(key=lambda item: (item["date"], item["kind"] != "step_closes", item["title"] or ""))
    return {"days": UPCOMING_DAYS, "items": items[:LIMIT], "total": len(items)}


def attention(matrices: list[dict], today_date: date | None = None) -> dict:
    """Assignments with learners behind (a step past its close date, not handed in) or work waiting on staff."""
    start = today_date or date.today()
    rows: list[dict] = []
    for matrix in matrices:
        behind = sum(any(cell["bucket"] == "not_handed_in" and cell["due_date"] and cell["due_date"] < start for cell in learner["cells"].values())
                     for learner in matrix["learners"])
        aggregates = [column["aggregate"] for stage in matrix["stages"] for column in stage["steps"]]
        overdue = sum(item["overdue_count"] for item in aggregates)
        needs_you = sum(item["handed_in_count"] + item["to_grade_count"] + item["needs_settle_count"] for item in aggregates)
        if behind or overdue or needs_you:
            rows.append({**_who(matrix["assignment"]), "behind_count": behind, "overdue_count": overdue, "needs_you_count": needs_you,
                         "progress_percent": matrix["assignment"]["progress_percent"]})
    rows.sort(key=lambda row: (-row["behind_count"], -row["overdue_count"], -row["needs_you_count"]))
    return {"assignments": rows[:LIMIT], "total": len(rows)}


def waiting(db: Session, current_user: PublicUser, org_id: int, admin: bool) -> dict:
    """The review inbox in brief: counts by kind and the oldest groups, plus chat reports for admins."""
    inbox = review.inbox(db, current_user, org_id)
    groups = [{key: group.get(key) for key in ("kind", "assignment_uuid", "template", "group", "step_key", "step_uuid", "activity_uuid", "step", "count", "oldest_at")}
              for group in inbox["groups"][:LIMIT]]
    reports = None
    if admin:
        from src.services.school import reports as school_reports

        reports = int(school_reports.list_reports(db, current_user, org_id)["open"])
    # Helper requests join here once learner-invited helpers need an admin's approval.
    return {"counts": inbox["counts"], "total": inbox["total"] + (reports or 0), "groups": groups, "reports": reports}


def messages(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The viewer's latest chats in this org: learners' org chats and plan feeds they're in."""
    from src.services.connect import chats

    rows = db.exec(select(Conversation, ConversationMember).join(ConversationMember, col(ConversationMember.conversation_id) == Conversation.id).where(
        ConversationMember.user_id == current_user.id, col(ConversationMember.status).in_(chats.LISTED),
        Conversation.org_id == org_id, col(Conversation.last_message_at).is_not(None),
    ).order_by(col(Conversation.last_message_at).desc()).limit(LIMIT)).all()
    listed = [_staff_title(db, conversation, chats._chat_dict(db, conversation, member)) for conversation, member in rows]
    return {"chats": listed, "unread": sum(chat["unread"] for chat in listed)}


def _staff_title(db: Session, conversation: Conversation, chat: dict) -> dict:
    """A learner's chat with the org is titled after the org for the learner; staff see it under the learner's name."""
    from src.services.connect import people

    key = conversation.direct_key or ""
    if conversation.kind != "school" or not key.startswith("school:"):
        return chat
    learner = people.person(db, int(key.rsplit(":", 1)[1]))
    return {**chat, "title": learner["name"], "people": [learner, *[item for item in chat["people"] if item.get("id") != learner.get("id")]]} if learner else chat


# Home ------------------------------------------------------------------------------------

def home(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The viewer's widgets, their layout, and the data for each widget they haven't hidden."""
    require_org_membership(current_user.id, org_id, db)
    admin = is_org_admin(current_user.id, org_id, db)
    mine, overseen = _staffed(db, current_user, org_id, admin)
    staff = admin or bool(mine) or bool(review.staff_goals(db, current_user.id, org_id))
    widgets = ["messages"]
    if staff:
        widgets = ["waiting", "today", "messages", "attention"]
    creates = admin and admin_home_creator.creates(db, org_id)
    if creates:
        widgets.append("creator")
    layout = get_layout(db, current_user.id, org_id)
    shown = set(widgets) - set(layout["hidden"])
    cache: dict = {}
    result: dict = {"widgets": widgets, "layout": layout, "locked": [], "getting_started": admin_home_start.getting_started(db, current_user, org_id)}
    if "waiting" in shown:
        result["waiting"] = waiting(db, current_user, org_id, admin)
    if "today" in shown:
        result["today"] = today([matrix for matrix in (_matrix(db, current_user, org_id, row, cache) for row in mine) if matrix])
    if "attention" in shown:
        result["attention"] = attention([matrix for matrix in (_matrix(db, current_user, org_id, row, cache) for row in overseen) if matrix])
    if "messages" in shown:
        result["messages"] = messages(db, current_user, org_id)
    if "creator" in shown:
        result["creator"] = admin_home_creator.metrics(db, org_id)
    return result

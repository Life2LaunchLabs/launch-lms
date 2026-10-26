"""Home: what needs the viewer and how their work is going, in one call, built from what they can do.

Each section comes from the service that owns its data:

- ``welcome``: a new member's first two weeks: the note from the invitation they accepted (``admin_home_sections``).
- ``first_steps``: the org setup checklist for admins (``admin_home_start``), a lap of the places they'll work
  for staff (``admin_home_steps``). It stays until it's dismissed, done or not.
- ``needs``: the Threads rows with something waiting on the viewer.
- ``assignments``: the running assignments they're on, with where learners are; admins also get all of them.
- ``continue``: the plans, requirement frameworks and resource channels edited last, for those who build plans.
- ``week``: steps closing and stages opening in the coming week on their assignments, read from each
  assignment's matrix (``staff_views.assignment_matrix``).
- ``glance``: insight cards they pinned, or starter cards until they pin one (``admin_home_glance``).
- ``requirements``: progress on each requirement framework, for those who see reports (``admin_home_requirements``).

Each member hides sections, dismisses the welcome, First steps and the Needs you tip, ticks steps and pins
cards for themselves. That state lives on their membership row under ``home``.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goal_admin import HOME_SECTIONS, HomeLayout
from src.db.goals import DONE_STEP_STATUSES, AssignmentStatus, GoalAssignment, GoalTemplate, TemplateStatus
from src.db.requirements import RequirementFramework
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.security.org_auth import STAFF_PERMISSIONS, get_user_org, is_org_owner_admin, require_org_membership, staff_permissions
from src.services.goals import admin_home_glance, admin_home_requirements, admin_home_sections, admin_home_start, admin_home_steps, staff_views

# How far ahead "this week" looks.
UPCOMING_DAYS = 7
LIMIT = 8
STATE_KEY = "home"
WELCOME_DAYS = 14
DISMISSABLE = ("welcome", "first_steps", "needs_intro")


def _value(item) -> str:
    return getattr(item, "value", item)


# State -----------------------------------------------------------------------------------

def state_of(membership: UserOrganization | None) -> dict:
    """This member's Home state, cleaned: hidden sections, dismissals, ticked steps and pinned cards."""
    saved = ((membership.preferences or {}) if membership else {}).get(STATE_KEY) or {}
    return {
        "hidden": [item for item in dict.fromkeys(saved.get("hidden") or []) if item in HOME_SECTIONS],
        "dismissed": [item for item in dict.fromkeys(saved.get("dismissed") or []) if item in DISMISSABLE],
        "ticks": [item for item in dict.fromkeys(saved.get("ticks") or []) if item in admin_home_steps.STEP_KEYS],
        "pins": list(saved.get("pins") or []),
    }


def _member(db: Session, current_user: PublicUser, org_id: int) -> UserOrganization:
    require_org_membership(current_user.id, org_id, db)
    membership = get_user_org(current_user.id, org_id, db)
    if not membership:
        raise HTTPException(status_code=409, detail="Only members of this organization have a Home here")
    return membership


def _save(db: Session, membership: UserOrganization, **changes) -> dict:
    state = {**state_of(membership), **changes}
    # A new dict, so the JSON column sees the change.
    membership.preferences = {**(membership.preferences or {}), STATE_KEY: state}
    db.add(membership)
    db.commit()
    return state


def save_layout(db: Session, current_user: PublicUser, org_id: int, payload: HomeLayout) -> dict:
    """Keep the sections this member hid in this org."""
    membership = _member(db, current_user, org_id)
    unknown = sorted(set(payload.hidden) - set(HOME_SECTIONS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown sections: {', '.join(unknown)}")
    return {"hidden": _save(db, membership, hidden=list(dict.fromkeys(payload.hidden)))["hidden"]}


def dismiss(db: Session, current_user: PublicUser, org_id: int, what: str) -> dict:
    """Put away the welcome note, First steps or the Needs you tip, for this member."""
    if what not in DISMISSABLE:
        raise HTTPException(status_code=422, detail=f"Dismiss one of: {', '.join(DISMISSABLE)}")
    membership = _member(db, current_user, org_id)
    state = state_of(membership)
    if what == "first_steps":
        membership.preferences = {**(membership.preferences or {}), admin_home_start.DISMISSED_KEY: True}
    return {"dismissed": _save(db, membership, dismissed=[*state["dismissed"], what])["dismissed"]}


def tick(db: Session, current_user: PublicUser, org_id: int, step: str) -> dict:
    """Tick a First steps step that data can't show, when the member opens it."""
    if step not in admin_home_steps.TICKED:
        raise HTTPException(status_code=422, detail=f"Tick one of: {', '.join(admin_home_steps.TICKED)}")
    membership = _member(db, current_user, org_id)
    return {"ticks": _save(db, membership, ticks=[*state_of(membership)["ticks"], step])["ticks"]}


def pins(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The insight cards this member pinned to Home, for Insights to mark them."""
    return {"pins": state_of(_member(db, current_user, org_id))["pins"]}


def save_pins(db: Session, current_user: PublicUser, org_id: int, pins: list[admin_home_glance.HomePin]) -> dict:
    """Keep the insight cards this member pinned to Home, in their order."""
    membership = _member(db, current_user, org_id)
    return {"pins": _save(db, membership, pins=admin_home_glance.clean_pins(db, current_user, org_id, pins))["pins"]}


# Plans tabs ------------------------------------------------------------------------------

def plans_summary(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """What the Plans tabs show: how many plans and active assignments the org has, and its frameworks.

    Plans opens on a welcome when there are no plans; Assignments and Requirements appear once there
    is something in them.
    """
    require_org_membership(current_user.id, org_id, db)

    def count(statement) -> int:
        return len(db.exec(statement).all())

    return {
        "plans": count(select(GoalTemplate.id).where(GoalTemplate.org_id == org_id, GoalTemplate.status != TemplateStatus.ARCHIVED.value, col(GoalTemplate.system_type).is_(None))),
        "assignments": count(select(GoalAssignment.id).where(GoalAssignment.org_id == org_id, GoalAssignment.status == AssignmentStatus.ACTIVE.value)),
        "frameworks": count(select(RequirementFramework.id).where(RequirementFramework.org_id == org_id)),
    }


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


# Home ------------------------------------------------------------------------------------

def _joined_recently(membership: UserOrganization) -> bool:
    try:
        joined = datetime.fromisoformat(str(membership.creation_date)[:19])
    except ValueError:
        return False
    return datetime.now() - joined < timedelta(days=WELCOME_DAYS)


def _first_steps(db: Session, current_user: PublicUser, org_id: int, admin: bool, permissions: set[str], mine: list[GoalAssignment],
                 summaries: list[dict], state: dict) -> dict | None:
    if "first_steps" in state["dismissed"]:
        return None
    if admin:
        checklist = admin_home_start.getting_started(db, current_user, org_id)
        return {"kind": "admin", **checklist} if checklist else None
    if not permissions:
        return None
    return admin_home_steps.staff_steps(db, int(current_user.id), org_id, permissions, mine, summaries, state)  # type: ignore[arg-type]


def home(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The viewer's sections, what they hid, and the data for each section they haven't hidden."""
    require_org_membership(current_user.id, org_id, db)
    membership = get_user_org(current_user.id, org_id, db)
    admin = is_org_owner_admin(current_user.id, org_id, db)
    permissions = set(STAFF_PERMISSIONS) if admin else staff_permissions(membership)
    state = state_of(membership)
    mine, overseen = _staffed(db, current_user, org_id, admin)
    staff = bool(permissions)

    # Home is for staff; a learner who finds their way here gets an empty page.
    sections = ["needs"] if staff else []
    if staff and (mine or admin or permissions & {"run_assignments", "review_work"}):
        sections.append("assignments")
    if "build_plans" in permissions:
        sections.append("continue")
    if mine or admin:
        sections.append("week")
    if staff:
        sections.append("glance")
    if "see_reports" in permissions and admin_home_requirements.has_frameworks(db, org_id):
        sections.append("requirements")
    shown = set(sections) - set(state["hidden"])

    picked = admin_home_sections.assignments(db, current_user, mine, overseen if admin else None) if staff else {"mine": [], "all": None}
    recent = membership is not None and _joined_recently(membership)
    result: dict = {
        "viewer": {"admin": admin, "permissions": sorted(permissions), "staff": staff},
        "sections": sections, "hidden": state["hidden"],
        "welcome": None if "welcome" in state["dismissed"] or not recent else {"invitation": admin_home_sections.welcome(db, int(current_user.id), org_id)},  # type: ignore[arg-type]
        "first_steps": _first_steps(db, current_user, org_id, admin, permissions, mine, picked["mine"], state),
    }
    if "needs" in shown:
        result["needs"] = {**admin_home_sections.needs_you(db, current_user, org_id, staff),
                           "intro": staff and not admin and recent and "needs_intro" not in state["dismissed"]}
    if "assignments" in shown:
        result["assignments"] = picked
    if "continue" in shown:
        result["continue"] = admin_home_sections.continue_items(db, org_id)
    if "week" in shown:
        cache: dict = {}
        result["week"] = today([matrix for matrix in (_matrix(db, current_user, org_id, row, cache) for row in (mine or overseen)) if matrix])
    if "glance" in shown:
        focus = admin_home_steps._focus(picked["mine"])
        result["glance"] = admin_home_glance.glance(db, current_user, org_id, permissions, state["pins"], focus)
    if "requirements" in shown:
        result["requirements"] = admin_home_requirements.requirements(db, org_id)
    return result

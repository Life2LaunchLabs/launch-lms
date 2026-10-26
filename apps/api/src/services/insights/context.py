"""Who a card counts and over which dates.

The population is resolved once per request and every measure starts from it, so no measure can count a
learner the viewer couldn't see. Admins, and staff with the See reports permission, count every learner in
the organization; other staff count the learners in the groups they staff (the rule Threads uses) and the
learners on assignments that list them as staff. A dashboard's scope (one plan, group or learner) narrows
that further as a locked filter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalAssignment, GoalTemplate
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.access.access import is_staff_role
from src.security.org_auth import is_org_admin, require_org_admin
from src.services.insights.spec import CustomRange
from src.services.school.chats import students_of

SCOPES = ("org", "plan", "group", "learner")
PRESET_DAYS = {"28d": 28, "90d": 90, "12m": 365}
DEFAULT_RANGE = "90d"


def as_date(value) -> date | None:
    """A date from a date, a datetime, or an ISO string (the ``creation_date`` columns)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# Dates --------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Window:
    """``[start, end)``; ``start`` is None for all time until the data says when it begins."""

    start: date | None
    end: date
    preset: str

    @property
    def days(self) -> int | None:
        return (self.end - self.start).days if self.start else None

    def contains(self, day: date) -> bool:
        return (self.start is None or day >= self.start) and day < self.end

    @property
    def bucket(self) -> str:
        days = self.days
        return "month" if days is None or days > 200 else "week" if days > 31 else "day"


def window(range_, inherit: str | CustomRange | None, today: date) -> Window:
    """The dates a spec's ``range`` means today. ``inherit`` follows the dashboard's date bar."""
    if range_ == "inherit":
        range_ = inherit or DEFAULT_RANGE
    end = today + timedelta(days=1)
    if isinstance(range_, CustomRange):
        return Window(range_.start, range_.end + timedelta(days=1), "custom")
    if isinstance(range_, dict):
        return window(CustomRange(**range_), None, today)
    if range_ == "all":
        return Window(None, end, "all")
    return Window(end - timedelta(days=PRESET_DAYS.get(range_, 90)), end, range_)


def compared(win: Window, compare) -> Window | None:
    """The second window a comparison runs over: the same length just before, or a year earlier."""
    if win.start is None or compare not in ("prior", "year"):
        return None
    if compare == "year":
        return Window(win.start - timedelta(days=365), win.end - timedelta(days=365), win.preset)
    return Window(win.start - timedelta(days=win.days or 0), win.start, win.preset)


def compared_label(win: Window, compare) -> str:
    if compare == "year":
        return "this time last year"
    return {"28d": "the 28 days before", "90d": "the 90 days before", "12m": "the year before"}.get(win.preset, "the period before")


# People -------------------------------------------------------------------------------------------

@dataclass
class Population:
    org_id: int
    viewer_id: int
    see_reports: bool
    # Every learner the viewer may count, with their membership status (active or alumni).
    status: dict[int, str] = field(default_factory=dict)

    def learners(self, statuses: tuple[str, ...] | list[str] = ("active",)) -> set[int]:
        return {user_id for user_id, status in self.status.items() if status in statuses}


def _learner_memberships(db: Session, org_id: int) -> list[UserOrganization]:
    rows = db.exec(select(UserOrganization).where(UserOrganization.org_id == org_id)).all()
    roles = {int(role.id): role for role in db.exec(select(Role).where(col(Role.id).in_({row.role_id for row in rows}))).all()} if rows else {}  # type: ignore[arg-type]
    return [row for row in rows if not is_staff_role(roles.get(row.role_id))]


def staff_learners(db: Session, org_id: int, staff_id: int) -> set[int]:
    """The learners a staff member without See reports counts: their groups' and their assignments'."""
    seen = set(students_of(db, org_id, staff_id))
    for assignment in db.exec(select(GoalAssignment).where(GoalAssignment.org_id == org_id)).all():
        if staff_id not in (assignment.staff_user_ids or []):
            continue
        if assignment.usergroup_id:
            seen |= {int(item) for item in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == assignment.usergroup_id)).all()}
        seen |= {int(goal.subject_user_id) for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).all() if goal.subject_user_id}
    return seen - {staff_id}


def population(db: Session, viewer: PublicUser, org_id: int) -> Population:
    """Who this viewer may count in ``org_id``. Learners can't use Insights."""
    require_org_admin(viewer.id, org_id, db)
    see_reports = is_org_admin(viewer.id, org_id, db, "see_reports")
    memberships = _learner_memberships(db, org_id)
    status = {int(row.user_id): (row.status or "active") for row in memberships}
    if not see_reports:
        visible = staff_learners(db, org_id, viewer.id)
        status = {user_id: value for user_id, value in status.items() if user_id in visible}
    return Population(org_id=org_id, viewer_id=viewer.id, see_reports=see_reports, status=status)


# What the dashboard is about ----------------------------------------------------------------------

@dataclass(frozen=True)
class Scope:
    kind: str
    key: str | None = None
    id: int | None = None
    label: str = ""


def scope(db: Session, pop: Population, kind: str, key: str | None) -> Scope:
    """The plan, group or learner a dashboard shows, checked against what the viewer may see."""
    if kind not in SCOPES:
        raise HTTPException(status_code=422, detail=f"Scope is one of: {', '.join(SCOPES)}")
    if kind == "org":
        return Scope("org")
    if not key:
        raise HTTPException(status_code=422, detail=f"Pick a {kind}")
    if kind == "plan":
        template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == key)).first()
        runs = template is not None and (template.org_id == pop.org_id or db.exec(
            select(Goal.id).where(Goal.template_id == template.id, Goal.org_id == pop.org_id)).first() is not None)
        if not runs:
            raise HTTPException(status_code=404, detail="Plan not found")
        return Scope("plan", key, int(template.id), template.title)  # type: ignore[union-attr, arg-type]
    if kind == "group":
        group = db.exec(select(UserGroup).where(UserGroup.usergroup_uuid == key, UserGroup.org_id == pop.org_id)).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        if not pop.see_reports:
            members = {int(item) for item in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group.id)).all()}
            if not members & set(pop.status):
                raise HTTPException(status_code=404, detail="Group not found")
        return Scope("group", key, int(group.id), group.name)  # type: ignore[arg-type]
    user = db.exec(select(User).where(User.user_uuid == key)).first()
    if not user or int(user.id) not in pop.status:  # type: ignore[arg-type]
        raise HTTPException(status_code=404, detail="Learner not found")
    name = " ".join(part for part in (user.first_name, user.last_name) if part) or user.username
    return Scope("learner", key, int(user.id), name)  # type: ignore[arg-type]


def objects(db: Session, pop: Population, kind: str) -> list[dict]:
    """The plans or groups this viewer can open a dashboard on, most learners first.

    Plans are the organization's own (not archived) and any plan its learners have started; groups are the
    organization's, or for staff without See reports the ones that hold their learners.
    """
    if kind == "plan":
        counts: dict[int, set[int]] = {}
        for template_id, user_id in db.exec(select(Goal.template_id, Goal.subject_user_id).where(Goal.org_id == pop.org_id, col(Goal.template_id).is_not(None))).all():
            if user_id is not None and int(user_id) in pop.status:
                counts.setdefault(int(template_id), set()).add(int(user_id))
        own = db.exec(select(GoalTemplate).where(GoalTemplate.org_id == pop.org_id, GoalTemplate.status != "archived")).all() if pop.see_reports else []
        ids = {int(template.id) for template in own} | set(counts)  # type: ignore[arg-type]
        templates = db.exec(select(GoalTemplate).where(col(GoalTemplate.id).in_(ids))).all() if ids else []
        rows = [{"key": template.template_uuid, "label": template.title, "learners": len(counts.get(int(template.id), ())),  # type: ignore[arg-type]
                 "external": template.org_id != pop.org_id} for template in templates]
    elif kind == "group":
        members: dict[int, set[int]] = {}
        for group_id, user_id in db.exec(select(UserGroupUser.usergroup_id, UserGroupUser.user_id).where(UserGroupUser.org_id == pop.org_id)).all():
            if int(user_id) in pop.status:
                members.setdefault(int(group_id), set()).add(int(user_id))
        groups = db.exec(select(UserGroup).where(UserGroup.org_id == pop.org_id)).all()
        rows = [{"key": group.usergroup_uuid, "label": group.name, "learners": len(members.get(int(group.id), ()))}  # type: ignore[arg-type]
                for group in groups if pop.see_reports or int(group.id) in members]  # type: ignore[arg-type]
    elif kind == "org":
        return []
    else:
        raise HTTPException(status_code=422, detail="Objects are plans or groups")
    return sorted(rows, key=lambda row: (-row["learners"], row["label"].lower()))


# Lookups measures share ---------------------------------------------------------------------------

@dataclass
class Ctx:
    """One request: the population, the scope, today, and lookups loaded once."""

    db: Session
    pop: Population
    scope: Scope
    today: date
    _cache: dict = field(default_factory=dict)

    @property
    def org_id(self) -> int:
        return self.pop.org_id

    def once(self, key: str, load):
        if key not in self._cache:
            self._cache[key] = load()
        return self._cache[key]

    def everyone(self) -> set[int]:
        """Every learner the viewer may count, alumni included; filters pick from these."""
        return set(self.pop.status)

    def groups_of(self) -> dict[int, list[str]]:
        """Each learner's group uuids in this organization."""
        def load() -> dict[int, list[str]]:
            rows = self.db.exec(select(UserGroupUser.user_id, UserGroup.usergroup_uuid).join(UserGroup, UserGroup.id == UserGroupUser.usergroup_id)
                                .where(UserGroup.org_id == self.org_id)).all()
            out: dict[int, list[str]] = {}
            for user_id, group_uuid in rows:
                out.setdefault(int(user_id), []).append(group_uuid)
            return out
        return self.once("groups_of", load)

    def templates(self) -> dict[int, GoalTemplate]:
        return self.once("templates", lambda: {})

    def template(self, template_id: int | None) -> GoalTemplate | None:
        if template_id is None:
            return None
        cache = self.templates()
        if template_id not in cache:
            cache[template_id] = self.db.get(GoalTemplate, template_id)
        return cache[template_id]

"""Who someone may chat with: people they share a goal with, and people who chose to be findable."""

from __future__ import annotations

from sqlalchemy import or_
from sqlmodel import Session, col, select

from src.db.conversations import UserBlock
from src.db.goals import Goal
from src.db.planning import PlanCollaborator
from src.db.users import PublicUser, User
from src.services.goals.sharing_roles import user_summary

# user.details key holding Connect settings.
SETTINGS_KEY = "connect"
MIN_SEARCH = 2
MAX_RESULTS = 20


def person(db: Session, user_id: int | None) -> dict | None:
    """Who someone is, without their email."""
    summary = user_summary(db, user_id)
    if summary:
        summary.pop("email", None)
    return summary


def discoverable(user: User | None) -> bool:
    return bool(((user.details or {}).get(SETTINGS_KEY) or {}).get("discoverable")) if user else False


def get_settings(db: Session, current_user: PublicUser) -> dict:
    return {"discoverable": discoverable(db.get(User, current_user.id))}


def update_settings(db: Session, current_user: PublicUser, is_discoverable: bool) -> dict:
    user = db.get(User, current_user.id)
    details = dict(user.details or {})  # type: ignore[union-attr]
    details[SETTINGS_KEY] = {**(details.get(SETTINGS_KEY) or {}), "discoverable": is_discoverable}
    user.details = details  # type: ignore[union-attr]
    db.add(user)
    db.commit()
    return get_settings(db, current_user)


def blocked(db: Session, a: int, b: int) -> bool:
    """Whether either person has blocked the other."""
    return db.exec(select(UserBlock.id).where(or_(
        (UserBlock.blocker_user_id == a) & (UserBlock.blocked_user_id == b),
        (UserBlock.blocker_user_id == b) & (UserBlock.blocked_user_id == a),
    ))).first() is not None


def blocked_by_me(db: Session, user_id: int) -> set[int]:
    return set(db.exec(select(UserBlock.blocked_user_id).where(UserBlock.blocker_user_id == user_id)).all())


def _goal_ids(db: Session, user_id: int) -> set[int]:
    own = db.exec(select(Goal.id).where(or_(Goal.owner_user_id == user_id, Goal.subject_user_id == user_id))).all()
    shared = db.exec(select(PlanCollaborator.goal_id).where(
        PlanCollaborator.user_id == user_id, PlanCollaborator.active == True, col(PlanCollaborator.goal_id).is_not(None),  # noqa: E712
    )).all()
    return {int(goal_id) for goal_id in [*own, *shared] if goal_id}


def goal_people(db: Session, user_id: int) -> set[int]:
    """Everyone who shares a goal with this person: its learner, its owner, and its collaborators."""
    goal_ids = _goal_ids(db, user_id)
    if not goal_ids:
        return set()
    goals = db.exec(select(Goal.owner_user_id, Goal.subject_user_id).where(col(Goal.id).in_(goal_ids))).all()
    collaborators = db.exec(select(PlanCollaborator.user_id).where(
        col(PlanCollaborator.goal_id).in_(goal_ids), PlanCollaborator.active == True,  # noqa: E712
    )).all()
    people = {int(user_id) for row in goals for user_id in row if user_id} | {int(item) for item in collaborators}
    people.discard(user_id)
    return people


def shares_a_goal(db: Session, a: int, b: int) -> bool:
    return bool(_goal_ids(db, a) & _goal_ids(db, b))


def search(db: Session, current_user: PublicUser, query: str) -> list[dict]:
    """People you share a goal with whose name or handle matches, then findable people whose handle starts with it."""
    needle = (query or "").strip().lstrip("@").lower()
    if len(needle) < MIN_SEARCH:
        return []
    hidden = blocked_by_me(db, current_user.id) | {current_user.id}
    known = goal_people(db, current_user.id) - hidden
    rows: list[dict] = []
    for summary in (person(db, user_id) for user_id in known):
        if summary and (needle in summary["username"].lower() or needle in summary["name"].lower()):
            rows.append({**summary, "known": True})
    rows.sort(key=lambda item: item["name"].lower())
    seen = {item["id"] for item in rows} | hidden
    escaped = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    for user in db.exec(select(User).where(col(User.username).ilike(f"{escaped}%", escape="\\")).order_by(col(User.username)).limit(100)).all():
        if len(rows) >= MAX_RESULTS:
            break
        if user.id in seen or not discoverable(user) or blocked(db, current_user.id, int(user.id)):  # type: ignore[arg-type]
            continue
        rows.append({**(person(db, user.id) or {}), "known": False})
    return rows[:MAX_RESULTS]

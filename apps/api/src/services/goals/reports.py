"""Group reports: where one group stands on its plans and badges, who's behind and what's left.

A report reads the group's current assignments (each at its own template version) through the
same learner × step matrices staff see on an assignment, adds the badges those plans earn, and,
when asked, the group's requirement frameworks. It can be sent as a card into staff members'
chats; the card links to the live report, so it stays current.
"""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from src.db.badge_routes import BadgeRoute
from src.db.goals import CURRENT_ASSIGNMENT_STATUSES, DONE_STEP_STATUSES, GoalAssignment
from src.db.learning import LearningBadge, LearningBadgeAward
from src.db.organizations import Organization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import get_user_org, is_org_admin, require_org_admin, require_org_membership
from src.services.goals import requirements as goal_requirements
from src.services.goals import staff_views

# How many open steps "what's left next" names per learner.
NEXT_STEPS = 2
MAX_RECIPIENTS = 50


class GroupReportSend(BaseModel):
    recipient_user_ids: list[int] = Field(default_factory=list)
    message: str = Field(default="", max_length=2000)
    frameworks: list[str] = Field(default_factory=list)


def _value(item) -> str:
    return getattr(item, "value", item)


def _name(person: dict | User | None) -> str:
    if person is None:
        return "Someone"
    get = person.get if isinstance(person, dict) else lambda key: getattr(person, key, None)
    return " ".join(part for part in (get("first_name"), get("last_name")) if part) or get("username") or "Someone"


def _group_or_404(db: Session, org_id: int, usergroup_id: int) -> UserGroup:
    group = db.get(UserGroup, usergroup_id)
    if not group or group.org_id != org_id:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _badge_of(db: Session, assignment: GoalAssignment) -> LearningBadge | None:
    """The badge an assignment's learners earn: the one it runs, else the template's badge route."""
    badge_id = assignment.badge_id
    if not badge_id and assignment.template_id:
        badge_id = db.exec(select(BadgeRoute.badge_id).where(BadgeRoute.goal_template_id == assignment.template_id)
                           .order_by(col(BadgeRoute.recommended).desc(), BadgeRoute.position, BadgeRoute.id)).first()
    badge = db.get(LearningBadge, badge_id) if badge_id else None
    return badge if badge and not badge.deleted_at else None


def _learner_row(matrix: dict, learner: dict, today: date) -> dict:
    """One learner on one plan: steps done, whether they're behind, and the next steps left."""
    cells = learner["cells"]
    keys = [column["template_key"] for stage in matrix["stages"] for column in stage["steps"] if column["template_key"] in cells]
    titles = {column["template_key"]: column["title"] for stage in matrix["stages"] for column in stage["steps"]}
    done = sum(cells[key]["status"] in DONE_STEP_STATUSES for key in keys)
    behind = any(cell["bucket"] == "not_handed_in" and cell["due_date"] and cell["due_date"] < today for cell in cells.values())
    handed_in = any(cell["bucket"] in ("handed_in", "to_grade") for cell in cells.values())
    assignment = matrix["assignment"]
    finished = bool(keys) and done == len(keys) or learner["status"] == "finished"
    status = "paused" if assignment["status"] == "paused" else "finished" if finished else "behind" if behind else "on_pace"
    return {
        "id": learner["id"], "user_uuid": learner.get("user_uuid"), "username": learner.get("username"),
        "first_name": learner.get("first_name"), "last_name": learner.get("last_name"), "avatar_image": learner.get("avatar_image"),
        "goal_uuid": learner["goal_uuid"], "assignment_uuid": assignment["assignment_uuid"], "template_title": assignment["template_title"],
        "version": assignment["version"], "done": done, "total": len(keys), "status": status, "behind": status == "behind", "handed_in": handed_in,
        "next_steps": [titles[key] or "Untitled step" for key in keys if cells[key]["status"] not in DONE_STEP_STATUSES][:NEXT_STEPS],
    }


def _frameworks(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int, wanted: list[str]) -> tuple[list[dict], list[dict]]:
    """The group's frameworks, and for each one asked for, who has met what and what each learner still needs."""
    try:
        first = goal_requirements.group_requirements(db, current_user, org_id, usergroup_id, None)
    except HTTPException as refused:
        if refused.status_code == 403:
            return [], []
        raise
    available = [{"framework_uuid": item["framework_uuid"], "name": item["name"], "learner_count": item["learner_count"]} for item in first["frameworks"]]
    included = []
    for framework in available:
        uuid = framework["framework_uuid"]
        if uuid not in wanted:
            continue
        data = first if first["framework_uuid"] == uuid else goal_requirements.group_requirements(db, current_user, org_id, usergroup_id, uuid)
        leaves = set(data["leaf_node_uuids"])
        nodes = {node["node_uuid"]: node for node in data["nodes"] if node["node_uuid"] in leaves}
        learners = [{
            "id": learner.get("id"), "username": learner.get("username"), "first_name": learner.get("first_name"), "last_name": learner.get("last_name"),
            "met": learner["met"], "total": learner["total"], "gaps": learner["gaps"],
            "still_needs": [{"node_uuid": uuid, "code": nodes[uuid].get("code") or "", "title": nodes[uuid].get("title") or "", "state": state}
                            for uuid, state in learner["cells"].items() if state != "met" and uuid in nodes],
        } for learner in data["learners"]]
        learners.sort(key=lambda item: (-len(item["still_needs"]), _name(item).lower()))
        met = sum(learner["met"] for learner in learners)
        total = sum(learner["total"] for learner in learners)
        included.append({**framework, "draft": True, "requirement_count": len(leaves), "learners": learners,
                         "met_percent": round(met * 100 / total) if total else 0, "not_enrolled": data["not_enrolled"]})
    return available, included


def group_report(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int, frameworks: list[str] | None = None) -> dict:
    """One group's plans and badges, who's behind and what's left, and the requirement frameworks asked for.

    Admins see the whole group. Other staff see the plans they staff and the learners on them,
    and are refused when they staff none of the group's plans.
    """
    require_org_membership(current_user.id, org_id, db)
    group = _group_or_404(db, org_id, usergroup_id)
    admin = is_org_admin(current_user.id, org_id, db)
    member_ids = set(db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == usergroup_id)).all())
    rows = db.exec(select(GoalAssignment).where(
        GoalAssignment.org_id == org_id, GoalAssignment.usergroup_id == usergroup_id, col(GoalAssignment.status).in_(CURRENT_ASSIGNMENT_STATUSES),
    ).order_by(GoalAssignment.creation_date, GoalAssignment.id)).all()  # type: ignore[arg-type]
    today = date.today()
    plans: list[dict] = []
    learners: list[dict] = []
    for assignment in rows:
        if not admin and not staff_views._is_staff(db, current_user, org_id, assignment):
            continue
        try:
            matrix = staff_views.assignment_matrix(db, current_user, org_id, assignment.assignment_uuid)
        except HTTPException as refused:
            if refused.status_code == 403:
                continue
            raise
        on_plan = [_learner_row(matrix, learner, today) for learner in matrix["learners"]]
        badge = _badge_of(db, assignment)
        user_ids = [row["id"] for row in on_plan if row["id"] and row["id"] > 0]
        earned = len(set(db.exec(select(LearningBadgeAward.user_id).where(
            LearningBadgeAward.badge_id == badge.id, col(LearningBadgeAward.user_id).in_(user_ids or [-1]),  # type: ignore[union-attr]
        )).all())) if badge else 0
        summary = matrix["assignment"]
        plans.append({
            "assignment_uuid": assignment.assignment_uuid, "template_uuid": summary["template_uuid"], "template_title": summary["template_title"],
            "version": summary["version"], "status": summary["status"], "due_date": summary["due_date"], "learner_count": len(on_plan),
            "progress_percent": round(sum(row["done"] * 100 / row["total"] for row in on_plan if row["total"]) / len(on_plan)) if on_plan else 0,
            "finished_count": sum(row["status"] == "finished" for row in on_plan), "behind_count": sum(row["behind"] for row in on_plan),
            "badge": {"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image, "earned_count": earned} if badge else None,
        })
        learners.extend(on_plan)
    if not admin and not plans:
        raise HTTPException(status_code=403, detail="You do not staff any of this group's plans")
    learners.sort(key=lambda row: (not row["behind"], row["status"] == "finished", (row["done"] / row["total"]) if row["total"] else 1, _name(row).lower()))
    behind = sorted({row["id"]: _name(row) for row in learners if row["behind"]}.values(), key=str.lower)
    done, total = sum(row["done"] for row in learners), sum(row["total"] for row in learners)
    available, included = _frameworks(db, current_user, org_id, usergroup_id, list(frameworks or []))
    people = {row["id"] for row in learners}
    org = db.get(Organization, org_id)
    return {
        "group": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name},
        "org": {"id": org_id, "name": org.name if org else "", "slug": org.slug if org else ""},
        "generated_on": today.isoformat(),
        "summary": {
            "learner_count": len(member_ids) if admin else len(people), "learners_on_plans": len(people),
            "steps_done": done, "steps_total": total, "progress_percent": round(done * 100 / total) if total else 0,
            "behind_count": len(behind), "behind_names": behind, "plan_count": len(plans),
            "badges_earned": sum(plan["badge"]["earned_count"] for plan in plans if plan["badge"]),
        },
        "plans": plans, "learners": learners, "frameworks": available, "included_frameworks": included,
    }


def send_report(db: Session, current_user: PublicUser, org_id: int, usergroup_id: int, payload: GroupReportSend) -> dict:
    """Post the report as a card in each recipient's direct chat with the sender. Recipients must be in the organization."""
    from src.services.connect import cards

    require_org_admin(current_user.id, org_id, db)
    recipients = list(dict.fromkeys(int(item) for item in payload.recipient_user_ids))
    if not recipients:
        raise HTTPException(status_code=422, detail="Choose who gets the report")
    if len(recipients) > MAX_RECIPIENTS:
        raise HTTPException(status_code=422, detail=f"Send to at most {MAX_RECIPIENTS} people at a time")
    outside = [user_id for user_id in recipients if not get_user_org(user_id, org_id, db)]
    if outside:
        raise HTTPException(status_code=422, detail="Reports can only go to people in this organization")
    report = group_report(db, current_user, org_id, usergroup_id, payload.frameworks)
    org = db.get(Organization, org_id)
    summary = report["summary"]
    card = {
        "type": cards.GROUP_REPORT, "org_id": org_id, "org_slug": org.slug if org else "", "usergroup_id": usergroup_id,
        "group_name": report["group"]["name"], "frameworks": [item["framework_uuid"] for item in report["included_frameworks"]],
        "framework_names": [item["name"] for item in report["included_frameworks"]], "message": payload.message.strip(),
        "summary": {key: summary[key] for key in ("learner_count", "progress_percent", "behind_count", "plan_count", "badges_earned")},
        "sent_on": report["generated_on"],
    }
    sent, skipped = [], []
    for user_id in recipients:
        posted = cards.group_report(db, int(current_user.id), user_id, card) if user_id != current_user.id else None  # type: ignore[arg-type]
        if posted:
            sent.append({"user_id": user_id, "message_uuid": posted.message_uuid})
        else:
            skipped.append({"user_id": user_id, "reason": "yourself" if user_id == current_user.id else "chat unavailable"})
    db.commit()
    return {"sent": sent, "skipped": skipped}

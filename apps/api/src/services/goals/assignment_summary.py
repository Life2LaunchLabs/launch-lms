"""An assignment as staff see it: who it went to, its schedule and staff, and how far its learners are."""

from __future__ import annotations

from sqlalchemy import case, func
from sqlmodel import Session, col, select

from src.db.goals import DONE_STEP_STATUSES, Goal, GoalAssignment, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress, StepStatus
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.goals.document import iter_steps

WAITING = {StepStatus.SUBMITTED.value, StepStatus.CHANGES_REQUESTED.value}


def _value(item) -> str:
    return getattr(item, "value", item)


def status_fields(assignment: GoalAssignment) -> dict:
    """Where an assignment stands: active, paused or ended, and since when."""
    return {"status": _value(assignment.status), "paused_at": assignment.paused_at, "ended_at": assignment.ended_at}


def collaborators_of(assignment: GoalAssignment) -> list[dict]:
    return list(assignment.collaborators or []) or [{"user_id": user_id, "role_key": None} for user_id in assignment.staff_user_ids or []]


def _person(user: User | None) -> dict | None:
    if not user:
        return None
    return {"id": user.id, "user_uuid": user.user_uuid, "username": user.username, "first_name": user.first_name,
            "last_name": user.last_name, "avatar_image": user.avatar_image}


def _progress(db: Session, goals: list[Goal]) -> tuple[dict[int, tuple[int, int]], int]:
    """Per goal (done, total), and how many steps wait on staff."""
    steps = db.exec(select(GoalStep.id, GoalStep.goal_id).where(GoalStep.goal_id.in_([goal.id for goal in goals]))).all() if goals else []  # type: ignore[union-attr]
    statuses = {
        int(row.step_id): _value(row.status)
        for row in db.exec(select(StepProgress).where(StepProgress.step_id.in_([step_id for step_id, _ in steps]))).all()  # type: ignore[union-attr]
    } if steps else {}
    counts: dict[int, list[int]] = {int(goal.id): [0, 0] for goal in goals}  # type: ignore[arg-type]
    for step_id, goal_id in steps:
        counts[int(goal_id)][1] += 1
        counts[int(goal_id)][0] += statuses.get(int(step_id)) in DONE_STEP_STATUSES
    return {goal_id: (done, total) for goal_id, (done, total) in counts.items()}, sum(status in WAITING for status in statuses.values())


def assignment_dict(db: Session, assignment: GoalAssignment) -> dict:
    from src.services.goals.badge_authority import version_status

    template = db.get(GoalTemplate, assignment.template_id)
    version = db.get(GoalTemplateVersion, assignment.version_id)
    group = db.get(UserGroup, assignment.usergroup_id) if assignment.usergroup_id else None
    goals = list(db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(Goal.id)).all())  # type: ignore[arg-type]
    progress, waiting = _progress(db, goals)
    done = sum(item[0] for item in progress.values())
    total = sum(item[1] for item in progress.values())
    percents = [round(item[0] * 100 / item[1]) if item[1] else 0 for item in progress.values()]
    lifecycle = {status: 0 for status in ("pending", "active", "finished", "archived")}
    for goal in goals:
        lifecycle[_value(goal.status)] = lifecycle.get(_value(goal.status), 0) + 1
    staff = db.exec(select(User).where(User.id.in_(assignment.staff_user_ids))).all() if assignment.staff_user_ids else []  # type: ignore[union-attr]
    external = bool(assignment.subject_email) and not assignment.user_id and not assignment.usergroup_id
    return {
        "assignment_uuid": assignment.assignment_uuid, "org_id": assignment.org_id,
        "template_uuid": template.template_uuid if template else "", "template_title": template.title if template else "Deleted template",
        "version": version.number if version else None, "usergroup_id": assignment.usergroup_id, "user_id": assignment.user_id,
        "subject_email": assignment.subject_email, "welcome_message": assignment.welcome_message,
        "staff_user_ids": assignment.staff_user_ids or [], "collaborators": collaborators_of(assignment),
        "staff": [_person(user) for user in staff], "owner": _person(db.get(User, assignment.owner_user_id) if assignment.owner_user_id else None),
        "schedule": {
            "stages": [{"stage_key": key, **value} for key, value in (assignment.stage_dates or {}).items()],
            "steps": [{"step_key": key, **value} for key, value in (assignment.step_dates or {}).items()],
        },
        "start_date": assignment.start_date, "due_date": assignment.due_date, **status_fields(assignment), "creation_date": assignment.creation_date,
        "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
        "user": _person(db.get(User, assignment.user_id) if assignment.user_id else None),
        "assignment_type": "group" if group else ("external" if external else "individual"),
        "learner_count": len(goals), "goal_uuid": goals[0].goal_uuid if len(goals) == 1 else None,
        "lifecycle_counts": lifecycle,
        "step_count": sum(1 for _ in iter_steps(version.document or {})) if version else 0,
        "completed_count": done, "ready_for_review_count": waiting,
        "progress_percent": round(done * 100 / total) if total else 0, **version_status(db, assignment),
        "min_progress_percent": min(percents) if percents else 0, "max_progress_percent": max(percents) if percents else 0,
    }


def _progress_by_goal(db: Session, goal_ids: list[int]) -> dict[int, tuple[int, int, int]]:
    """Per goal (done, total, waiting on staff), counted in one grouped query."""
    if not goal_ids:
        return {}
    status = col(StepProgress.status)
    rows = db.exec(
        select(GoalStep.goal_id, func.count(GoalStep.id),  # type: ignore[arg-type]
               func.sum(case((status.in_(list(DONE_STEP_STATUSES)), 1), else_=0)),
               func.sum(case((status.in_(list(WAITING)), 1), else_=0)))
        .select_from(GoalStep).join(StepProgress, StepProgress.step_id == GoalStep.id, isouter=True)  # type: ignore[arg-type]
        .where(col(GoalStep.goal_id).in_(goal_ids)).group_by(GoalStep.goal_id)
    ).all()
    return {int(goal_id): (int(done or 0), int(total or 0), int(waiting or 0)) for goal_id, total, done, waiting in rows}


def assignment_summaries(db: Session, assignments: list[GoalAssignment]) -> dict[int, dict]:
    """Many assignments summarized at once, by assignment id: what ``assignment_dict`` says (but the
    schedule, collaborators and owner) plus each one's learner ids. Everything loads in a few queries
    for the whole list, with progress counted per goal in one grouped query."""
    from src.db.badge_routes import BadgeRoute
    from src.db.learning import LearningBadge
    from src.db.organizations import Organization
    from src.services.goals.badge_authority import eligible, rule_of

    if not assignments:
        return {}
    ids = [int(row.id) for row in assignments]  # type: ignore[arg-type]

    def by_id(model, keys) -> dict:
        wanted = list({int(key) for key in keys if key})
        return {int(row.id): row for row in db.exec(select(model).where(col(model.id).in_(wanted))).all()} if wanted else {}

    templates = by_id(GoalTemplate, (row.template_id for row in assignments))
    versions = by_id(GoalTemplateVersion, [*(row.version_id for row in assignments), *(t.published_version_id for t in templates.values())])
    groups = by_id(UserGroup, (row.usergroup_id for row in assignments))
    badges = by_id(LearningBadge, (row.badge_id for row in assignments))
    owners = by_id(Organization, (badge.org_id for badge in badges.values()))
    routes = {(int(route.badge_id), int(route.goal_template_id)): route for route in db.exec(select(BadgeRoute).where(  # type: ignore[arg-type]
        col(BadgeRoute.badge_id).in_(list(badges)), col(BadgeRoute.goal_template_id).in_(list(templates)))).all()} if badges else {}
    goals: dict[int, list[tuple[int, str, int | None, str]]] = {}
    for goal_id, assignment_id, goal_uuid, subject, status in db.exec(
        select(Goal.id, Goal.assignment_id, Goal.goal_uuid, Goal.subject_user_id, Goal.status).where(col(Goal.assignment_id).in_(ids)).order_by(Goal.id)  # type: ignore[arg-type]
    ).all():
        goals.setdefault(int(assignment_id), []).append((int(goal_id), goal_uuid, subject, _value(status)))
    progress = _progress_by_goal(db, [goal[0] for rows in goals.values() for goal in rows])
    people = by_id(User, [*(user for row in assignments for user in (row.staff_user_ids or [])), *(row.user_id for row in assignments)])
    step_counts = {version_id: sum(1 for _ in iter_steps(version.document or {})) for version_id, version in versions.items()}

    result = {}
    for assignment in assignments:
        template = templates.get(int(assignment.template_id))
        version = versions.get(int(assignment.version_id))
        live = versions.get(int(template.published_version_id)) if template and template.published_version_id else None
        group = groups.get(int(assignment.usergroup_id)) if assignment.usergroup_id else None
        badge = badges.get(int(assignment.badge_id)) if assignment.badge_id else None
        route = routes.get((int(badge.id), int(assignment.template_id))) if badge else None  # type: ignore[arg-type]
        mine = goals.get(int(assignment.id), [])  # type: ignore[arg-type]
        counts = [progress.get(goal_id, (0, 0, 0)) for goal_id, *_ in mine]
        done, total, waiting = sum(item[0] for item in counts), sum(item[1] for item in counts), sum(item[2] for item in counts)
        percents = [round(item[0] * 100 / item[1]) if item[1] else 0 for item in counts]
        lifecycle = {status: 0 for status in ("pending", "active", "finished", "archived")}
        for *_, status in mine:
            lifecycle[status] = lifecycle.get(status, 0) + 1
        external = bool(assignment.subject_email) and not assignment.user_id and not assignment.usergroup_id
        owner = owners.get(int(badge.org_id)) if badge else None
        result[int(assignment.id)] = {  # type: ignore[arg-type]
            "assignment_uuid": assignment.assignment_uuid, "org_id": assignment.org_id,
            "template_uuid": template.template_uuid if template else "", "template_title": template.title if template else "Deleted template",
            "version": version.number if version else None, "usergroup_id": assignment.usergroup_id, "user_id": assignment.user_id,
            "subject_email": assignment.subject_email, "welcome_message": assignment.welcome_message,
            "staff_user_ids": assignment.staff_user_ids or [],
            "staff": [_person(people[int(user_id)]) for user_id in assignment.staff_user_ids or [] if int(user_id) in people],
            "start_date": assignment.start_date, "due_date": assignment.due_date, **status_fields(assignment), "creation_date": assignment.creation_date,
            "cohort": {"id": group.id, "uuid": group.usergroup_uuid, "name": group.name} if group else None,
            "user": _person(people.get(int(assignment.user_id))) if assignment.user_id else None,
            "assignment_type": "group" if group else ("external" if external else "individual"),
            "learner_count": len(mine), "learner_ids": [subject for _, _, subject, _ in mine if subject],
            "goal_uuid": mine[0][1] if len(mine) == 1 else None, "lifecycle_counts": lifecycle,
            "step_count": step_counts.get(int(version.id), 0) if version else 0,  # type: ignore[arg-type]
            "completed_count": done, "review_count": waiting, "ready_for_review_count": waiting,
            "progress_percent": round(done * 100 / total) if total else 0,
            "min_progress_percent": min(percents) if percents else 0, "max_progress_percent": max(percents) if percents else 0,
            # What badge_authority.version_status says, from what's loaded above.
            "version_uuid": version.version_uuid if version else None,
            "latest_version": live.number if live else None, "latest_version_uuid": live.version_uuid if live else None,
            "update_available": bool(live and version and live.id != version.id and live.number > version.number),
            "badge": {"badge_uuid": badge.badge_uuid, "name": badge.name, "thumbnail_image": badge.thumbnail_image or "",
                      "owner_org": {"id": owner.id, "name": owner.name, "slug": owner.slug} if owner else None,
                      **(rule_of(route) if route else {})} if badge else None,
            "version_eligible": eligible(route, version.number if version else None, live.number if live else None) if badge else None,
        }
    return result

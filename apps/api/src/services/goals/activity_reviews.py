"""Activity answers waiting on a grade, for the learners of a set of goals."""

from __future__ import annotations

from sqlmodel import Session, select

from src.db.goals import Goal, GoalStep
from src.db.learning import LearningActivity, LearningBadge, LearningPage, LearningResponseAttempt, LearningRun
from src.db.users import User


def _points(attempt: LearningResponseAttempt) -> float:
    questions = ((attempt.result or {}).get("questions") or {}).values()
    return sum(float(question.get("max_score") or question.get("points") or 0) for question in questions if question.get("grading_status") == "pending")


def activity_reviews(db: Session, goals: list[Goal]) -> list[dict]:
    """One review per (learner run, activity) with an answer pending a grade, oldest first."""
    goal_by_id = {int(goal.id): goal for goal in goals if goal.subject_user_id}  # type: ignore[arg-type]
    if not goal_by_id:
        return []
    runs = [run for run in db.exec(select(LearningRun).where(LearningRun.goal_id.in_(list(goal_by_id)))).all()  # type: ignore[union-attr]
            if run.user_id == goal_by_id[int(run.goal_id)].subject_user_id]  # type: ignore[arg-type]
    if not runs:
        return []
    attempts = db.exec(
        select(LearningResponseAttempt).where(LearningResponseAttempt.run_id.in_([run.id for run in runs]))  # type: ignore[union-attr]
        .order_by(LearningResponseAttempt.submitted_at.asc())  # type: ignore[union-attr]
    ).all()
    latest = {(attempt.run_id, attempt.page_id): attempt for attempt in attempts}
    page_ids = {page_id for _, page_id in latest}
    pages = {page.id: page for page in db.exec(select(LearningPage).where(LearningPage.id.in_(page_ids))).all()} if page_ids else {}  # type: ignore[union-attr]
    activity_ids = {page.activity_id for page in pages.values()}
    activities = {item.id: item for item in db.exec(select(LearningActivity).where(LearningActivity.id.in_(activity_ids))).all()} if activity_ids else {}  # type: ignore[union-attr]
    step_ids = {run.goal_step_id for run in runs if run.goal_step_id}
    steps = {step.id: step for step in db.exec(select(GoalStep).where(GoalStep.id.in_(step_ids))).all()} if step_ids else {}  # type: ignore[union-attr]
    grouped: dict[tuple[int, int], list[tuple[LearningPage, LearningResponseAttempt]]] = {}
    for (run_id, page_id), attempt in latest.items():
        page = pages.get(page_id)
        if page:
            grouped.setdefault((run_id, page.activity_id), []).append((page, attempt))
    run_by_id = {run.id: run for run in runs}
    result = []
    for (run_id, activity_id), rows in grouped.items():
        pending = [(page, attempt) for page, attempt in rows if (attempt.result or {}).get("grading_status") == "pending"]
        run, activity = run_by_id.get(run_id), activities.get(activity_id)
        if not pending or not run or not activity:
            continue
        goal = goal_by_id[int(run.goal_id)]  # type: ignore[arg-type]
        user = db.get(User, run.user_id)
        if not user:
            continue
        badge = db.get(LearningBadge, goal.badge_id) if goal.badge_id else None
        step = steps.get(run.goal_step_id)
        history = [(pages[attempt.page_id], attempt) for attempt in attempts
                   if attempt.run_id == run_id and attempt.page_id in pages and pages[attempt.page_id].activity_id == activity_id]
        result.append({
            "review_type": "activity", "review_id": f"{run.run_uuid}:{activity.activity_uuid}", "run_uuid": run.run_uuid,
            "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid if step else None,
            "user": {"id": user.id, "username": user.username, "first_name": user.first_name, "last_name": user.last_name, "avatar_image": user.avatar_image},
            "badge": {"id": badge.id, "badge_uuid": badge.badge_uuid, "name": badge.name} if badge else None,
            "activity": activity.model_dump(),
            "attempts": [{**attempt.model_dump(), "page": page.model_dump()} for page, attempt in rows],
            "attempt_history": [{**attempt.model_dump(), "page": page.model_dump()} for page, attempt in history],
            "pending_attempt_uuids": [attempt.attempt_uuid for _, attempt in pending],
            "auto_score": sum(float(attempt.score or 0) for _, attempt in rows if (attempt.result or {}).get("grading_status") == "graded"),
            "pending_max_score": sum(_points(attempt) for _, attempt in pending),
            "max_score": sum(float((attempt.result or {}).get("max_score") or 0) for _, attempt in rows),
            "minimum_score_percent": float((activity.settings or {}).get("grading", {}).get("minimum_score_percent", 70)),
            "submitted_at": max(attempt.submitted_at for _, attempt in pending),
        })
    result.sort(key=lambda item: item["submitted_at"])
    return result

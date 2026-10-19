"""What staff do about one step across an assignment: remind who hasn't handed it in, settle a step they confirm.

Both act on the learners whose goals the staff member can review (see ``review.staff_goals``)
and go through the same buckets as the assignment matrix (``staff_views.bucket``).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goal_templates import StepRemind, StepSettle
from src.db.goals import (
    DONE_STEP_STATUSES,
    AssignmentStatus,
    CompletionMethod,
    Goal,
    GoalAssignment,
    GoalStep,
    GoalTemplateVersion,
    StepCompleter,
    StepProgress,
    StepStatus,
)
from src.db.users import PublicUser, User
from src.security.org_auth import require_org_membership
from src.services.goals import completion
from src.services.goals.activity_reviews import activity_reviews
from src.services.goals.document import iter_steps
from src.services.goals.review import person, stage_started, staff_goals
from src.services.goals.staff_views import _assignment_or_404, bucket

REMINDER = "step_reminder"
# A learner hears about the same step at most once in this long.
REMIND_COOLDOWN = timedelta(hours=20)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _value(item) -> str:
    return getattr(item, "value", item)


def _spec(db: Session, assignment: GoalAssignment, step_key: str) -> dict:
    version = db.get(GoalTemplateVersion, assignment.version_id)
    spec = next((step for _, step in iter_steps(version.document if version else {}) if step.get("key") == step_key), None)
    if not spec:
        raise HTTPException(status_code=404, detail="Step not found in this assignment")
    return spec


def _rows(db: Session, current_user: PublicUser, org_id: int, assignment: GoalAssignment, step_key: str) -> list[tuple[Goal, GoalStep, StepProgress, str | None]]:
    """Each learner's step the staff member can review, with where it stands for staff."""
    goals = staff_goals(db, current_user.id, org_id, int(assignment.id))  # type: ignore[arg-type]
    if not goals:
        raise HTTPException(status_code=403, detail="You don't review any learners on this assignment")
    grading = {review["step_uuid"] for review in activity_reviews(db, goals)}
    reached: dict[int, set[int]] = {}
    rows = []
    for goal in goals:
        step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.template_key == step_key)).first()
        if not step:
            continue
        progress = completion.progress_view(db, step)
        rows.append((goal, step, progress, bucket(step, _value(progress.status), stage_started(db, step, reached), step.step_uuid in grading)))
    return rows


def _learner(db: Session, goal: Goal) -> dict | None:
    return person(db.get(User, goal.subject_user_id)) if goal.subject_user_id else None


def _chat(db: Session, goal: Goal):
    """The learner's plan feed: the chat their plan talks in."""
    from src.services.connect import workspace

    return workspace.chat_for_goal(db, goal)


def remind(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, step_key: str, payload: StepRemind) -> dict:
    """Post a reminder card about a step to each learner who hasn't handed it in, in their plan feed.

    Only learners in the ``not_handed_in`` bucket hear about it (narrowed to ``user_uuids`` when
    given), and each at most once per ``REMIND_COOLDOWN``. Paused and ended assignments send none.
    """
    from src.services.connect import chats, workspace

    require_org_membership(current_user.id, org_id, db)
    assignment = _assignment_or_404(db, org_id, assignment_uuid)
    if _value(assignment.status) != AssignmentStatus.ACTIVE.value:
        raise HTTPException(status_code=409, detail="Reminders go out only while the assignment is active")
    _spec(db, assignment, step_key)
    chosen = set(payload.user_uuids)
    message = (payload.message or "").strip()
    now = _now()
    cutoff = (now - REMIND_COOLDOWN).isoformat()
    reminded, skipped = [], []
    for goal, step, progress, kind in _rows(db, current_user, org_id, assignment, step_key):
        learner = _learner(db, goal)
        if chosen and (not learner or learner["user_uuid"] not in chosen):
            continue
        base = {"user": learner, "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid}
        reason = ("not_waiting" if kind != "not_handed_in" else "no_account" if not learner
                  else "recently_reminded" if progress.last_reminded_at and progress.last_reminded_at > cutoff else None)
        conversation = None if reason else _chat(db, goal)
        if not reason and not conversation:
            reason = "no_chat"
        if reason:
            skipped.append({**base, "reason": reason})
            continue
        card = {"type": REMINDER, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "step_uuid": step.step_uuid, "step_title": step.title,
                "due_date": step.due_date.isoformat() if step.due_date else None, "message": message}
        refs = [{"kind": "plan", "goal_uuid": goal.goal_uuid}, {"kind": "step", "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid}]
        posted = chats.post(db, conversation, current_user.id, message or f"Reminder: {step.title}", kind="card", card=card, refs=refs)  # type: ignore[arg-type]
        workspace.attach(db, posted, [(int(goal.id), step.step_uuid)])  # type: ignore[arg-type]
        row = completion.progress_for(db, step)
        row.last_reminded_at = now.isoformat()
        db.add(row)
        db.flush()
        reminded.append({**base, "conversation_uuid": conversation.conversation_uuid})  # type: ignore[union-attr]
    db.commit()
    return {"assignment_uuid": assignment_uuid, "step_key": step_key, "reminded": reminded, "skipped": skipped}


def settle(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str, step_key: str, payload: StepSettle) -> dict:
    """Mark a step staff confirm (an event, a meeting) done for every learner except the ones named.

    "Everyone came except Ada": the named learners are left as they are, and learners already done are skipped.
    """
    require_org_membership(current_user.id, org_id, db)
    assignment = _assignment_or_404(db, org_id, assignment_uuid)
    if _value(assignment.status) == AssignmentStatus.ENDED.value:
        raise HTTPException(status_code=409, detail="This assignment has ended")
    if _value(_spec(db, assignment, step_key).get("completed_by") or StepCompleter.LEARNER.value) != StepCompleter.STAFF.value:
        raise HTTPException(status_code=422, detail="Only steps staff confirm can be settled for everyone")
    left_out = set(payload.except_user_uuids)
    note = (payload.message or "").strip() or None
    settled, skipped, left = [], [], []
    for goal, step, progress, _ in _rows(db, current_user, org_id, assignment, step_key):
        learner = _learner(db, goal)
        base = {"user": learner, "goal_uuid": goal.goal_uuid, "step_uuid": step.step_uuid}
        if learner and learner["user_uuid"] in left_out:
            left.append(base)
        elif _value(progress.status) in DONE_STEP_STATUSES:
            skipped.append({**base, "reason": "already_done"})
        else:
            try:
                row = completion.set_status(db, goal, step, StepStatus.COMPLETED, actor_user_id=current_user.id, method=CompletionMethod.STAFF, note=note)
            except HTTPException as refused:
                skipped.append({**base, "reason": refused.detail})
                continue
            settled.append({**base, "status": _value(row.status)})
    return {"assignment_uuid": assignment_uuid, "step_key": step_key, "settled": settled, "skipped": skipped, "left": left}

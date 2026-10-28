"""What happens after a learner doesn't reach an activity's pass mark.

The activity's ``settings.grading.if_not_passed`` decides: ``try_again`` starts
the activity over the next time they open it, ``redo_missed`` sends them back
to the pages they didn't get full marks on, and ``staff_decide`` puts the run
in the review queue until a staff member passes it or asks them to try again.
"""

from datetime import datetime

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.goals import Goal
from src.db.learning import LearningActivity, LearningPage, LearningPageProgress, LearningRun, LearningRunStatus
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import access_rules, grading, run_navigation


def _result(run: LearningRun) -> dict:
    return (run.data or {}).get("completion_result") or {}


def retake_on_start(db_session: Session, run: LearningRun) -> bool:
    """Reopen the pages a learner redoes after not passing. Returns whether anything changed."""
    result = _result(run)
    if run.status == LearningRunStatus.COMPLETED or result.get("passed") is not False or result.get("retaking"):
        return False
    policy = result.get("if_not_passed")
    if policy not in ("try_again", "redo_missed"):
        return False
    pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == run.activity_id)).all()
    missed = set(result.get("missed_page_uuids") or [])
    reopen = {page.id for page in pages if policy == "try_again" or page.page_uuid in missed}
    _reopen(db_session, run, reopen)
    run.data = {**(run.data or {}), "completion_result": {**result, "retaking": True}, "retakes": int((run.data or {}).get("retakes") or 0) + 1}
    run.update_date = str(datetime.utcnow())
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    return True


def _reopen(db_session: Session, run: LearningRun, page_ids: set) -> None:
    for progress in db_session.exec(select(LearningPageProgress).where(LearningPageProgress.run_id == run.id)).all():
        if progress.page_id in page_ids and progress.complete:
            progress.complete = False
            progress.completed_at = None
            db_session.add(progress)


async def decide_run(
    request: Request,
    run_uuid: str,
    passed: bool,
    note: str | None,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """A staff member passes a run that missed the pass mark, or asks the learner to try again."""
    from src.services.learning.response_review import _grading_org_id

    run = db_session.exec(select(LearningRun).where(LearningRun.run_uuid == access_rules._clean_uuid(run_uuid, "learning_run_"))).first()
    if not run:
        raise HTTPException(status_code=404, detail="Activity run not found")
    staff = access_rules._require_user(current_user)
    goal = db_session.get(Goal, run.goal_id) if run.goal_id else None
    if not goal or _grading_org_id(db_session, goal, staff) is None:
        raise HTTPException(status_code=403, detail="You are not a reviewer on this learner's goal")
    if not _result(run).get("awaiting_staff_decision"):
        raise HTTPException(status_code=409, detail="This activity isn't waiting on a decision")
    activity = db_session.get(LearningActivity, run.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Learning activity not found")
    now = datetime.utcnow()
    decision = {"passed": passed, "note": (note or "").strip(), "user_id": staff.id, "decided_at": now.isoformat()}
    if passed:
        run.data = {**(run.data or {}), "staff_decision": "passed", "decision": decision}
        _, completion_result = grading._activity_meets_completion_rules(db_session, run, activity)
        run.data = {**(run.data or {}), "completion_result": completion_result}
        run.status = LearningRunStatus.COMPLETED
        run.completed_at = now
    else:
        # Try again from the start.
        pages = db_session.exec(select(LearningPage).where(LearningPage.activity_id == run.activity_id)).all()
        _reopen(db_session, run, {page.id for page in pages})
        result = {key: value for key, value in _result(run).items() if key != "awaiting_staff_decision"}
        run.data = {**(run.data or {}), "decision": decision, "completion_result": {**result, "if_not_passed": "try_again", "retaking": True}}
        run.status = LearningRunStatus.IN_PROGRESS
        run.completed_at = None
    run.update_date = str(now)
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    from src.services.goals.completion import on_run_changed
    on_run_changed(db_session, run)
    db_session.refresh(run)
    return run_navigation._serialize_run(db_session, run).model_dump()

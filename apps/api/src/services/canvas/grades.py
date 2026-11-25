"""Plan results in Canvas's gradebook (LTI Assignment and Grade Services, PF-5).

A plan a teacher adds as a Canvas assignment comes with a gradebook column: the deep linking response asks
Canvas for a line item (deep_linking.content_item), and every launch from the assignment names the column's
address in its AGS claim, which `remember_link` keeps on the plan's link.

When a student finishes the plan (goals/completion.finish_if_complete), `on_goal_finished` queues one score per
graded Canvas link of that plan in a course the student is in. The worker started with the app sends them with
a client credentials token (score scope) and retries with backoff, so a Canvas outage doesn't lose a result.
Students who haven't finished get nothing posted, so Canvas shows them as not submitted.

Plans have no points of their own yet, so a finished plan scores full marks, marked Completed and FullyGraded.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import httpx
from sqlmodel import Session, col, select

from src.db.canvas import CanvasConnection, CanvasCourseGroup, CanvasPlanLink, CanvasScore, CanvasUserLink
from src.db.goals import Goal, GoalStatus
from src.db.usergroup_user import UserGroupUser
from src.services.canvas import nrps

logger = logging.getLogger(__name__)

LINEITEM_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem"
SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score"
SCORE_MEDIA_TYPE = "application/vnd.ims.lis.v1.score+json"
SCORE_MAXIMUM = 100.0
EVERY = 60
BATCH = 50
MAX_ATTEMPTS = 20
MAX_BACKOFF = timedelta(hours=6)
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
PENDING, SENT, FAILED = "pending", "sent", "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _stamp(value: datetime | None = None) -> str:
    return (value or _now()).isoformat()


def line_item(plan: dict) -> dict:
    """The gradebook column Canvas makes for a plan added as an assignment."""
    return {"scoreMaximum": SCORE_MAXIMUM, "label": plan["title"][:255], "resourceId": plan["uuid"][:255]}


def lineitem_from(claims: dict) -> str | None:
    """The gradebook column's address from a launch's AGS claim, when Canvas grants us scores for it."""
    from src.services.canvas.launch import AGS_CLAIM

    service = claims.get(AGS_CLAIM) if isinstance(claims, dict) else None
    if not isinstance(service, dict):
        return None
    url = service.get("lineitem")
    return url.strip()[:2000] if isinstance(url, str) and url.strip() else None


def _same_host(url: str, connection: CanvasConnection) -> bool:
    return nrps._same_host(url, connection)


def remember_link(db: Session, connection: CanvasConnection, resource_link_id: str | None, course_id: str | None,
                  template_id: int, lineitem_url: str | None) -> CanvasPlanLink | None:
    """Keep the Canvas item that opens this plan, and its gradebook column when it has one (committed). A column
    seen for the first time picks up the results of students who finished before anyone opened it."""
    if not resource_link_id:
        return None
    if lineitem_url and not _same_host(lineitem_url, connection):
        lineitem_url = None
    link = db.exec(select(CanvasPlanLink).where(CanvasPlanLink.connection_id == connection.id,
                                                CanvasPlanLink.resource_link_id == resource_link_id)).first()
    now = _stamp()
    new_column = False
    if link is None:
        link = CanvasPlanLink(connection_id=int(connection.id), resource_link_id=resource_link_id, canvas_course_id=course_id,  # type: ignore[arg-type]
                              template_id=template_id, lineitem_url=lineitem_url, creation_date=now, update_date=now)
        new_column = bool(lineitem_url)
    else:
        changed = False
        if link.template_id != template_id:
            link.template_id, changed = template_id, True
        if course_id and link.canvas_course_id != course_id:
            link.canvas_course_id, changed = course_id, True
        if lineitem_url and link.lineitem_url != lineitem_url:
            new_column = True
            link.lineitem_url, changed = lineitem_url, True
        if not changed:
            return link
        link.update_date = now
    db.add(link)
    db.commit()
    db.refresh(link)
    if new_column:
        queue_for_link(db, link)
    return link


def _course_members(db: Session, link: CanvasPlanLink) -> set[int]:
    if not link.canvas_course_id:
        return set()
    group = db.exec(select(CanvasCourseGroup).where(CanvasCourseGroup.connection_id == link.connection_id,
                                                    CanvasCourseGroup.canvas_course_id == link.canvas_course_id)).first()
    if group is None:
        return set()
    return {int(user_id) for user_id in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == group.usergroup_id)).all()}


def _queue(db: Session, link: CanvasPlanLink, user_id: int, canvas_user_id: str, finished_at: datetime | None) -> None:
    row = db.exec(select(CanvasScore).where(CanvasScore.plan_link_id == link.id, CanvasScore.user_id == user_id)).first()
    now = _stamp()
    finished = (finished_at.replace(tzinfo=timezone.utc) if finished_at and finished_at.tzinfo is None else finished_at) or _now()
    if row is None:
        row = CanvasScore(plan_link_id=int(link.id), user_id=user_id, creation_date=now)  # type: ignore[arg-type]
    row.canvas_user_id, row.score_given, row.score_maximum = canvas_user_id, SCORE_MAXIMUM, SCORE_MAXIMUM
    row.finished_at, row.status, row.attempts, row.next_attempt_at = _stamp(finished), PENDING, 0, now
    row.last_error, row.update_date = None, now
    db.add(row)


def _canvas_ids(db: Session, user_id: int) -> dict[int, str]:
    return {int(row.connection_id): row.canvas_user_id for row in db.exec(select(CanvasUserLink).where(CanvasUserLink.user_id == user_id)).all()}


def on_goal_finished(db: Session, goal: Goal) -> int:
    """Queue this finished plan's result for each of its graded Canvas assignments in the student's courses."""
    if not goal.template_id or not goal.subject_user_id:
        return 0
    user_id = int(goal.subject_user_id)
    canvas_ids = _canvas_ids(db, user_id)
    if not canvas_ids:
        return 0
    links = db.exec(select(CanvasPlanLink).where(CanvasPlanLink.template_id == goal.template_id,
                                                 col(CanvasPlanLink.connection_id).in_(list(canvas_ids)),
                                                 col(CanvasPlanLink.lineitem_url).is_not(None))).all()
    queued = 0
    for link in links:
        if user_id in _course_members(db, link):
            _queue(db, link, user_id, canvas_ids[int(link.connection_id)], goal.finished_at)
            queued += 1
    if queued:
        db.commit()
    return queued


def queue_for_link(db: Session, link: CanvasPlanLink) -> int:
    """A gradebook column just appeared: queue the results of the course's students who already finished the plan."""
    members = _course_members(db, link)
    if not members or not link.lineitem_url:
        return 0
    canvas_ids = dict(db.exec(select(CanvasUserLink.user_id, CanvasUserLink.canvas_user_id).where(
        CanvasUserLink.connection_id == link.connection_id, col(CanvasUserLink.user_id).in_(list(members)))).all())
    goals = db.exec(select(Goal).where(Goal.template_id == link.template_id, Goal.status == GoalStatus.FINISHED,
                                       col(Goal.subject_user_id).in_(list(canvas_ids)))).all()
    done: set[int] = set()
    for goal in goals:
        user_id = int(goal.subject_user_id)  # type: ignore[arg-type]
        if user_id not in done:
            _queue(db, link, user_id, canvas_ids[user_id], goal.finished_at)
            done.add(user_id)
    if done:
        db.commit()
    return len(done)


def scores_url(lineitem_url: str) -> str:
    """`.../line_items/5?x=1` -> `.../line_items/5/scores?x=1` (AGS)."""
    parts = urlsplit(lineitem_url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/") + "/scores", parts.query, ""))


def _score_body(row: CanvasScore) -> dict:
    return {
        "userId": row.canvas_user_id,
        "scoreGiven": row.score_given,
        "scoreMaximum": row.score_maximum,
        "activityProgress": "Completed",
        "gradingProgress": "FullyGraded",
        "timestamp": row.finished_at or _stamp(),
        "comment": "Finished in Life2Launch",
    }


def _retry(row: CanvasScore, error: str) -> None:
    row.attempts += 1
    row.last_error = error[:500]
    if row.attempts >= MAX_ATTEMPTS:
        row.status = FAILED
    else:
        row.next_attempt_at = _stamp(_now() + min(timedelta(minutes=2 ** row.attempts), MAX_BACKOFF))
    row.update_date = _stamp()


def _give_up(row: CanvasScore, error: str) -> None:
    row.attempts += 1
    row.status, row.last_error, row.update_date = FAILED, error[:500], _stamp()


def send_due(db: Session, client: httpx.Client | None = None) -> dict:
    """Send the scores that are due, one token per connection. Returns counts for logs and tests."""
    rows = db.exec(select(CanvasScore).where(CanvasScore.status == PENDING, CanvasScore.next_attempt_at <= _stamp())
                   .order_by(col(CanvasScore.id)).limit(BATCH)).all()
    counts = {SENT: 0, PENDING: 0, FAILED: 0}
    if not rows:
        return counts
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT, follow_redirects=False)
    tokens: dict[int, str | None] = {}
    try:
        for row in rows:
            link = db.get(CanvasPlanLink, row.plan_link_id)
            connection = db.get(CanvasConnection, link.connection_id) if link else None
            if link is None or connection is None or not link.lineitem_url:
                _give_up(row, "The Canvas assignment is gone.")
            elif not connection.enabled:
                _retry(row, "The school's Canvas connection is switched off.")
            elif not _same_host(link.lineitem_url, connection):
                _give_up(row, "The gradebook column isn't on the school's Canvas.")
            else:
                if int(connection.id) not in tokens:  # type: ignore[arg-type]
                    try:
                        tokens[int(connection.id)] = nrps.access_token(db, connection, client, SCORE_SCOPE)  # type: ignore[arg-type]
                    except nrps.RosterError as error:
                        logger.info("No Canvas score token for connection %s: %s", connection.id, error.message)
                        tokens[int(connection.id)] = None  # type: ignore[arg-type]
                token = tokens[int(connection.id)]  # type: ignore[arg-type]
                if token is None:
                    _retry(row, "Canvas didn't give Life2Launch a grade token. The developer key may need the score permission.")
                else:
                    _post(row, link, token, client)
            counts[row.status] += 1
            db.add(row)
            db.commit()
    finally:
        if own:
            client.close()
    return counts


def _post(row: CanvasScore, link: CanvasPlanLink, token: str, client: httpx.Client) -> None:
    try:
        response = client.post(scores_url(str(link.lineitem_url)), json=_score_body(row),
                               headers={"Authorization": f"Bearer {token}", "Content-Type": SCORE_MEDIA_TYPE})
    except httpx.HTTPError as error:
        _retry(row, f"Couldn't reach Canvas: {type(error).__name__}")
        return
    if response.status_code < 300:
        row.status, row.sent_at, row.last_error, row.update_date = SENT, _stamp(), None, _stamp()
        row.attempts += 1
    elif response.status_code in (400, 404, 422):
        # Canvas refuses this score for good: the student left the course, or the assignment was deleted.
        _give_up(row, f"Canvas refused the score ({response.status_code}).")
    else:
        _retry(row, f"Canvas answered {response.status_code}.")


def run_due(engine) -> dict:
    with Session(engine) as db:
        return send_due(db)


async def run_forever(engine, every: int = EVERY) -> None:
    """The grade worker: started with the app, wakes every minute."""
    import asyncio

    while True:
        try:
            await asyncio.to_thread(run_due, engine)
        except Exception:
            logger.exception("Sending Canvas grades failed; will retry")
        await asyncio.sleep(every)


"""Tester feedback, saved in the app first and synced to Jira in the background.

Sending saves the submission (and its screenshots) and returns at once; a background task files it in Jira
and drops the screenshots. If Jira is slow or down it stays pending and is retried on the next send or list.
A person's list comes from a cache that's refreshed from Jira behind the scenes once it's a minute old, with
anything still pending shown first.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from fastapi import BackgroundTasks, HTTPException, UploadFile
from sqlmodel import Session, col, select

from src.db.feedback_outbox import FeedbackListCache, FeedbackSubmission, FeedbackSubmissionFile
from src.security.file_validation import validate_image_content
from src.services.candidate_jira import FEEDBACK_PROPERTY, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, CandidateJira, serialize_feedback

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(seconds=60)
# A pending submission is retried once it's been waiting this long (its first try runs right after sending).
RETRY_AFTER = timedelta(seconds=30)
MAX_ATTEMPTS = 20
IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
PENDING_PREFIX = "pending-"
# Marks a submission's context as already posted to its issue, so a retry doesn't post it again.
POSTED = "_posted"


def _jql(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def jira_items(client: CandidateJira, org_id: int | None, user_id: int | None, *, admin: bool) -> list[dict]:
    """The feedback Jira holds: everyone's for admins, else this person's in this organization."""
    org_filter = "" if admin else f'AND labels = "{_jql(f"launchlms-org-{org_id}")}" '
    issues = client.search(f'project = "{_jql(client.project)}" AND labels = "launchlms-feedback" {org_filter}ORDER BY updated DESC')
    result = []
    for issue in issues:
        metadata = client.property(issue["key"], FEEDBACK_PROPERTY) or {}
        if not admin and (int(metadata.get("org_id", -1)) != org_id or int(metadata.get("user_id", -1)) != user_id):
            continue
        if not admin and "tester-confirmed" in set((issue.get("fields") or {}).get("labels") or []):
            continue
        result.append(serialize_feedback(issue, metadata, client, admin=admin))
    return result


def with_unread(items: list[dict], current_user) -> list[dict]:
    """Marks what changed since the person last looked (a new status or a reply shared with them)."""
    seen = (current_user.details or {}).get("candidate_feedback_seen", {})
    result = []
    for item in items:
        if item.get("pending"):
            result.append({**item, "has_unread": False})
            continue
        previous = seen.get(item["key"])
        has_visible_update = item["status_category"] != "new" or bool(item["visible_revision"].partition(":")[2])
        result.append({**item, "has_unread": previous != item["visible_revision"] and (previous is not None or has_visible_update)})
    return result


def _pending_item(submission: FeedbackSubmission, files: int) -> dict:
    created = submission.created_at.isoformat() + "Z"
    return {
        "key": f"{PENDING_PREFIX}{submission.submission_uuid}", "message": submission.message, "status": "Sending",
        "status_id": "", "status_category": "new", "done_at": None, "priority": "Medium", "priority_id": "",
        "visible_revision": "", "intent": submission.intent, "tester_confirmed": False, "created_at": created, "updated_at": created,
        "entries": [], "attachments": [], "pending": True, "pending_attachments": files,
    }


def _cache(db: Session, org_id: int, user_id: int) -> FeedbackListCache | None:
    return db.exec(select(FeedbackListCache).where(FeedbackListCache.org_id == org_id, FeedbackListCache.user_id == user_id)).first()


def _store(db: Session, org_id: int, user_id: int, items: list[dict]) -> None:
    row = _cache(db, org_id, user_id) or FeedbackListCache(org_id=org_id, user_id=user_id)
    row.items = json.loads(json.dumps(items, default=str))
    row.refreshed_at = datetime.utcnow()
    db.add(row)
    db.commit()


def remember(db: Session, org_id: int, user_id: int, item: dict) -> dict:
    """Puts a fresh copy of one item (after a comment or a status change) into the cached list."""
    row = _cache(db, org_id, user_id)
    if row:
        items = [entry for entry in row.items if entry.get("key") != item.get("key")]
        row.items = json.loads(json.dumps([item, *items], default=str))
        db.add(row)
        db.commit()
    return item


def forget(db: Session, org_id: int, user_id: int, key: str) -> None:
    row = _cache(db, org_id, user_id)
    if row:
        row.items = [entry for entry in row.items if entry.get("key") != key]
        db.add(row)
        db.commit()


def _pending(db: Session, org_id: int, user_id: int) -> list[FeedbackSubmission]:
    return list(db.exec(select(FeedbackSubmission).where(
        FeedbackSubmission.org_id == org_id, FeedbackSubmission.user_id == user_id, FeedbackSubmission.status == "pending",
    ).order_by(col(FeedbackSubmission.created_at).desc())).all())


def _file_counts(db: Session, ids: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for submission_id in db.exec(select(FeedbackSubmissionFile.submission_id).where(col(FeedbackSubmissionFile.submission_id).in_(ids or [0]))).all():
        counts[submission_id] = counts.get(submission_id, 0) + 1
    return counts


def refresh(org_id: int, user_id: int) -> None:
    """Background: retry what's pending, then reload the person's list from Jira."""
    from src.core.events.database import engine

    with Session(engine) as db:
        due = datetime.utcnow() - RETRY_AFTER
        for submission in _pending(db, org_id, user_id):
            if submission.created_at <= due and submission.attempts < MAX_ATTEMPTS:
                sync(int(submission.id or 0))
        try:
            _store(db, org_id, user_id, jira_items(CandidateJira(), org_id, user_id, admin=False))
        except Exception:
            logger.warning("Couldn't refresh feedback from Jira for org %s user %s", org_id, user_id, exc_info=True)


def listing(db: Session, org_id: int, user_id: int, background: BackgroundTasks | None, *, refresh_missing: bool = True) -> list[dict]:
    """Pending submissions first, then the cached list; refreshes from Jira when there's no cache yet or it's stale."""
    row = _cache(db, org_id, user_id)
    if row is None and refresh_missing:
        refresh(org_id, user_id)
        db.expire_all()
        row = _cache(db, org_id, user_id)
    elif row is not None and refresh_missing and row.refreshed_at < datetime.utcnow() - STALE_AFTER:
        if background is not None:
            background.add_task(refresh, org_id, user_id)
        else:
            refresh(org_id, user_id)
            db.expire_all()
            row = _cache(db, org_id, user_id)
    pending = _pending(db, org_id, user_id)
    counts = _file_counts(db, [int(item.id or 0) for item in pending])
    return [*[_pending_item(item, counts.get(int(item.id or 0), 0)) for item in pending], *(list(row.items) if row else [])]


def _read_image(upload: UploadFile) -> tuple[str, str, bytes]:
    content = upload.file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Each screenshot must be 5 MB or smaller")
    if upload.content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPG, PNG, GIF, and WebP screenshots are supported")
    if not validate_image_content(content):
        raise HTTPException(status_code=415, detail="Screenshot content is invalid")
    return upload.filename or "screenshot.png", str(upload.content_type), content


def submit(db: Session, *, org_id: int, user_id: int, submission_uuid: str, message: str, intent: str | None,
           context: dict, images: list[UploadFile], background: BackgroundTasks | None) -> dict:
    """Saves the submission and queues its sync. The same submission_uuid again returns what was saved."""
    existing = db.exec(select(FeedbackSubmission).where(FeedbackSubmission.submission_uuid == submission_uuid)).first()
    if existing:
        if existing.user_id != user_id or existing.org_id != org_id:
            raise HTTPException(status_code=409, detail="That submission belongs to someone else")
        return _pending_item(existing, len(_file_counts(db, [int(existing.id or 0)]))) if existing.status == "pending" else {"key": existing.issue_key, "pending": False}
    if len(images) > MAX_ATTACHMENTS:
        raise HTTPException(status_code=422, detail=f"Attach up to {MAX_ATTACHMENTS} screenshots")
    files = [_read_image(image) for image in images]
    submission = FeedbackSubmission(submission_uuid=submission_uuid, org_id=org_id, user_id=user_id, message=message, intent=intent, context=context)
    db.add(submission)
    db.flush()
    for filename, content_type, content in files:
        db.add(FeedbackSubmissionFile(submission_id=int(submission.id or 0), filename=filename, content_type=content_type, content=content))
    db.commit()
    db.refresh(submission)
    if background is not None:
        background.add_task(sync, int(submission.id or 0))
    return _pending_item(submission, len(files))


def sync(submission_id: int) -> str | None:
    """Files one pending submission in Jira: the issue, its reproduction context, then its screenshots. Returns the key."""
    from src.core.events.database import engine
    from src.db.users import User

    with Session(engine) as db:
        submission = db.get(FeedbackSubmission, submission_id)
        if submission is None or submission.status != "pending":
            return submission.issue_key if submission else None
        submission.attempts += 1
        db.add(submission)
        db.commit()
        try:
            client = CandidateJira()
            if not submission.issue_key:
                user = db.get(User, submission.user_id)
                issue = client.create_feedback(org_id=submission.org_id, user=user, message=submission.message, intent=submission.intent)
                # Keep the key straight away, so a later retry adds to this issue instead of filing another.
                submission.issue_key = issue["key"]
                db.add(submission)
                db.commit()
            if not submission.context.get(POSTED):
                client.add_comment(str(submission.issue_key), "Anonymous reproduction context\n" + json.dumps(submission.context, indent=2), internal=True)
                submission.context = {**submission.context, POSTED: True}
                db.add(submission)
                db.commit()
            for file in db.exec(select(FeedbackSubmissionFile).where(FeedbackSubmissionFile.submission_id == submission.id).order_by(col(FeedbackSubmissionFile.id))).all():
                client.add_screenshot(str(submission.issue_key), file.filename, file.content_type, file.content)
                db.delete(file)
                db.commit()
            submission.status = "synced"
            submission.synced_at = datetime.utcnow()
            submission.last_error = ""
            db.add(submission)
            db.commit()
            item = serialize_feedback(client.issue(str(submission.issue_key)), client.property(str(submission.issue_key), FEEDBACK_PROPERTY) or {}, client, admin=False)
            remember(db, submission.org_id, submission.user_id, item)
            return submission.issue_key
        except Exception as error:
            db.rollback()
            submission = db.get(FeedbackSubmission, submission_id)
            if submission is not None:
                submission.last_error = str(getattr(error, "detail", error))[:500]
                db.add(submission)
                db.commit()
            logger.warning("Feedback %s isn't in Jira yet; it will be retried", submission_id, exc_info=True)
            return None

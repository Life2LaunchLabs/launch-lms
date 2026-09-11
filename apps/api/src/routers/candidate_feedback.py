from datetime import datetime, timezone
import os
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.users import PublicUser, User
from src.security.auth import get_current_user
from src.security.org_auth import is_org_admin, require_org_admin, require_org_membership
from src.services.candidate_jira import (
    FEEDBACK_PROPERTY,
    MAX_ATTACHMENTS,
    RELEASE_PROPERTY,
    CandidateJira,
    CandidateGitHub,
    current_revision,
    github_release,
    revision_label,
    serialize_feedback,
)

router = APIRouter()


class FeedbackEdit(BaseModel):
    message: str


class FeedbackAdminUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    release_note: str | None = None


class FeedbackReply(BaseModel):
    message: str
    internal: bool = False


class FeedbackConfirmation(BaseModel):
    solved: bool


def _clean_message(message: str) -> str:
    value = message.strip()
    if not value:
        raise HTTPException(status_code=422, detail="Write a message first")
    if len(value) > 10_000:
        raise HTTPException(status_code=422, detail="Message must be 10,000 characters or fewer")
    return value


def _jql_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _feedback_issue(client: CandidateJira, issue_key: str, org_id: int, current_user: PublicUser, db_session: Session, *, admin=False):
    require_org_membership(current_user.id, org_id, db_session)
    if admin:
        require_org_admin(current_user.id, org_id, db_session)
    issue = client.issue(issue_key)
    metadata = client.property(issue_key, FEEDBACK_PROPERTY)
    if not metadata or int(metadata.get("org_id", -1)) != org_id:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if not admin and int(metadata.get("user_id", -1)) != current_user.id:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return issue, metadata


@router.get("/configuration")
def feedback_configuration():
    client = CandidateJira()
    channel = os.getenv("LAUNCHLMS_RELEASE_CHANNEL", "").casefold()
    if not channel:
        try:
            channel = str(json.loads(Path("/app/build-info.json").read_text()).get("source_branch", "")).casefold()
        except (OSError, json.JSONDecodeError):
            channel = ""
    return {
        "feedback_configured": client.configured,
        "revision": current_revision(),
        "release_channel": channel or "stable",
        "unstable": channel in {"unstable", "candidate", "dev"},
    }


@router.get("/feedback")
def list_feedback(
    org_id: int,
    admin: bool = False,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    require_org_membership(current_user.id, org_id, db_session)
    if admin:
        require_org_admin(current_user.id, org_id, db_session)
    client = CandidateJira()
    org_label = _jql_value(f"launchlms-org-{org_id}")
    issues = client.search(
        f'project = "{_jql_value(client.project)}" AND labels = "launchlms-feedback" '
        f'AND labels = "{org_label}" ORDER BY updated DESC'
    )
    result = []
    for issue in issues:
        metadata = client.property(issue["key"], FEEDBACK_PROPERTY) or {}
        if int(metadata.get("org_id", -1)) != org_id:
            continue
        if not admin and int(metadata.get("user_id", -1)) != current_user.id:
            continue
        result.append(serialize_feedback(issue, metadata, client, admin=admin))
    return result


@router.post("/feedback", status_code=201)
def create_feedback(
    org_id: int = Form(...),
    message: str = Form(...),
    images: list[UploadFile] = File(default=[]),
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    require_org_membership(current_user.id, org_id, db_session)
    if len(images) > MAX_ATTACHMENTS:
        raise HTTPException(status_code=422, detail=f"Attach up to {MAX_ATTACHMENTS} screenshots")
    client = CandidateJira()
    issue = client.create_feedback(org_id=org_id, user=current_user, message=_clean_message(message))
    for image in images:
        client.add_attachment(issue["key"], image)
    issue = client.issue(issue["key"])
    metadata = client.property(issue["key"], FEEDBACK_PROPERTY) or {}
    return serialize_feedback(issue, metadata, client, admin=False)


@router.patch("/feedback/{issue_key}")
def edit_feedback(
    issue_key: str,
    body: FeedbackEdit,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    issue, metadata = _feedback_issue(client, issue_key, org_id, current_user, db_session)
    message = _clean_message(body.message)
    client.update_fields(issue_key, {"summary": message.splitlines()[0][:110], "description": {
        "type": "doc", "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": message}]}],
    }})
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=False)


@router.patch("/feedback/{issue_key}/admin")
def admin_update_feedback(
    issue_key: str,
    body: FeedbackAdminUpdate,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    issue, metadata = _feedback_issue(client, issue_key, org_id, current_user, db_session, admin=True)
    fields = issue.get("fields", {})
    labels = set(fields.get("labels") or [])
    if body.priority:
        if body.priority not in {"normal", "high"}:
            raise HTTPException(status_code=422, detail="Priority must be normal or high")
        client.update_fields(issue_key, {"priority": {"name": "High" if body.priority == "high" else "Medium"}})
    if body.status:
        if body.status not in client.statuses:
            raise HTTPException(status_code=422, detail="Unknown feedback status")
        labels.discard("feedback-ignored")
        labels.discard("tester-confirmed")
        labels.discard("tester-confirmation")
        if body.status == "ignored":
            labels.add("feedback-ignored")
        if body.status == "awaiting_confirmation":
            revision = current_revision()
            labels.update({"tester-confirmation", revision_label(revision)})
            note = _clean_message(body.release_note or "This push should have solved the reported problem.")
            client.set_property(issue_key, RELEASE_PROPERTY, {"revision": revision, "note": note})
            client.add_comment(issue_key, note, internal=False)
        client.update_fields(issue_key, {"labels": sorted(labels)})
        current_status = str(((issue.get("fields") or {}).get("status") or {}).get("name", ""))
        if current_status.casefold() != client.statuses[body.status].casefold():
            client.transition(issue_key, body.status)
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=True)


@router.post("/feedback/{issue_key}/reply")
def reply_to_feedback(
    issue_key: str,
    body: FeedbackReply,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    _, metadata = _feedback_issue(client, issue_key, org_id, current_user, db_session, admin=True)
    client.add_comment(issue_key, _clean_message(body.message), internal=body.internal)
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=True)


@router.post("/feedback/{issue_key}/confirm")
def confirm_feedback(
    issue_key: str,
    body: FeedbackConfirmation,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    issue, metadata = _feedback_issue(client, issue_key, org_id, current_user, db_session)
    labels = set((issue.get("fields") or {}).get("labels") or [])
    if "tester-confirmation" not in labels:
        raise HTTPException(status_code=409, detail="This feedback is not awaiting confirmation")
    labels.discard("tester-confirmation")
    if body.solved:
        labels.add("tester-confirmed")
        client.add_comment(issue_key, "Tester confirmed this is solved.", internal=False)
        target = "solved"
    else:
        client.add_comment(issue_key, "Tester says this still needs work.", internal=False)
        target = "open"
    client.update_fields(issue_key, {"labels": sorted(labels)})
    client.transition(issue_key, target)
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=False)


@router.get("/feedback/{issue_key}/attachments/{attachment_id}")
def get_feedback_attachment(
    issue_key: str,
    attachment_id: str,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    issue, _ = _feedback_issue(
        client, issue_key, org_id, current_user, db_session,
        admin=is_org_admin(current_user.id, org_id, db_session),
    )
    attachment = next((item for item in (issue.get("fields") or {}).get("attachment") or [] if str(item.get("id")) == attachment_id), None)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    body, content_type = client._request("GET", f"/rest/api/3/attachment/content/{attachment_id}", raw=True)
    return Response(body, media_type=content_type, headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})


@router.get("/releases")
def release_feed(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    revision = current_revision()
    if revision == "unknown":
        return {"current_revision": revision, "repository": "", "has_unread": False, "unseen": [], "previous": []}
    details = dict(current_user.details or {})
    seen = details.get("candidate_release_seen")
    github = CandidateGitHub()
    unseen_commits = github.commits(base=seen, head=revision) if seen != revision else []
    unseen = [github_release(commit, github) for commit in reversed(unseen_commits)]
    unseen_shas = {item["revision"] for item in unseen}
    previous = [
        github_release(commit, github)
        for commit in github.recent_commits(revision)
        if commit.get("sha") not in unseen_shas
    ]
    return {
        "current_revision": revision,
        "repository": github.repository,
        "has_unread": bool(unseen),
        "unseen": unseen,
        "previous": previous,
    }


@router.post("/releases/viewed")
def mark_release_feed_viewed(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    details = dict(user.details or {})
    details["candidate_release_seen"] = current_revision()
    details["candidate_release_seen_at"] = datetime.now(timezone.utc).isoformat()
    user.details = details
    db_session.add(user)
    db_session.commit()
    return {"revision": details["candidate_release_seen"]}

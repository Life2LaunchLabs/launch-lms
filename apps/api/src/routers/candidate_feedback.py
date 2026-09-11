from datetime import datetime, timezone
import os
import json
from pathlib import Path
import re
from uuid import uuid4
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.users import PublicUser, User
from src.security.auth import get_current_user
from src.security.org_auth import require_org_membership
from src.security.superadmin import (
    is_user_owner_org_admin,
    is_user_superadmin,
    require_superadmin,
)
from src.services.candidate_jira import (
    ANNOUNCEMENTS_PROPERTY,
    FEEDBACK_PROPERTY,
    MAX_ATTACHMENTS,
    CandidateJira,
    CandidateGitHub,
    current_revision,
    github_release,
    serialize_feedback,
)

router = APIRouter()


class FeedbackAdminUpdate(BaseModel):
    status_id: str | None = None
    priority_id: str | None = None


class FeedbackReply(BaseModel):
    message: str
    internal: bool = False


class AnnouncementCreate(BaseModel):
    title: str
    message: str


class FeedbackResolution(BaseModel):
    outcome: Literal["looks_good", "still_happening"]


FEEDBACK_INTENTS = {"stuck", "broken", "confusing", "missing", "love"}


def _update_user_details(db_session: Session, user_id: int, key: str, value) -> None:
    user = db_session.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    details = dict(user.details or {})
    details[key] = value
    user.details = details
    db_session.add(user)
    db_session.commit()


def _has_platform_access(user_id: int, db_session: Session) -> bool:
    return is_user_superadmin(user_id, db_session) or is_user_owner_org_admin(
        user_id, db_session
    )


def _clean_message(message: str) -> str:
    value = message.strip()
    if not value:
        raise HTTPException(status_code=422, detail="Write a message first")
    if len(value) > 10_000:
        raise HTTPException(
            status_code=422, detail="Message must be 10,000 characters or fewer"
        )
    return value


def _jql_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _feedback_issue(
    client: CandidateJira,
    issue_key: str,
    org_id: int | None,
    current_user: PublicUser,
    db_session: Session,
    *,
    admin=False,
):
    if admin:
        if not _has_platform_access(current_user.id, db_session):
            raise HTTPException(
                status_code=403, detail="Platform admin access required"
            )
    elif org_id is None:
        raise HTTPException(status_code=422, detail="Organization is required")
    else:
        require_org_membership(current_user.id, org_id, db_session)
    issue = client.issue(issue_key)
    metadata = client.property(issue_key, FEEDBACK_PROPERTY)
    if not metadata or (not admin and int(metadata.get("org_id", -1)) != org_id):
        raise HTTPException(status_code=404, detail="Feedback not found")
    if not admin and int(metadata.get("user_id", -1)) != current_user.id:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return issue, metadata


_STATIC_ROUTE_SEGMENTS = {
    "orgs",
    "hub",
    "portfolio",
    "projects",
    "preview",
    "plans",
    "plan",
    "live",
    "assignments",
    "requirements",
    "badges",
    "badge",
    "learning-path",
    "resources",
    "resource",
    "communities",
    "community",
    "discussion",
    "store",
    "offers",
    "account",
    "admin",
    "platform",
    "users",
    "settings",
    "feedback",
    "news",
    "podcasts",
    "playgrounds",
    "editor",
    "boards",
    "analytics",
    "overview",
    "new",
    "edit",
}


def sanitize_route(value: str) -> str:
    path = str(value or "").split("?", 1)[0].split("#", 1)[0]
    parts = [part for part in path.split("/") if part]
    safe = [
        part if part.casefold() in _STATIC_ROUTE_SEGMENTS else ":id"
        for part in parts[:12]
    ]
    return "/" + "/".join(safe) if safe else "/"


def _browser_family(user_agent: str) -> str:
    for label, pattern in (
        ("Edge", r"Edg/(\d+)"),
        ("Chrome", r"Chrome/(\d+)"),
        ("Firefox", r"Firefox/(\d+)"),
        ("Safari", r"Version/(\d+).+Safari/"),
    ):
        match = re.search(pattern, user_agent)
        if match:
            return f"{label} {match.group(1)}"
    return "Unknown browser"


def _dimension(value) -> int:
    try:
        return min(max(int(value or 0), 0), 20_000)
    except TypeError, ValueError:
        return 0


def _pixel_ratio(value) -> float:
    try:
        return min(max(float(value or 1), 0.5), 8)
    except TypeError, ValueError:
        return 1


def _platform_family(value: str) -> str:
    platform = value.casefold()
    if "android" in platform:
        return "Android"
    if any(token in platform for token in ("iphone", "ipad", "ios")):
        return "iOS"
    if "win" in platform:
        return "Windows"
    if "mac" in platform:
        return "macOS"
    if "linux" in platform:
        return "Linux"
    return "Other"


def sanitize_context(raw: str | None) -> dict:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError:
        value = {}
    if not isinstance(value, dict):
        value = {}
    viewport = value.get("viewport") if isinstance(value.get("viewport"), dict) else {}
    screen = value.get("screen") if isinstance(value.get("screen"), dict) else {}
    routes = value.get("routes") if isinstance(value.get("routes"), list) else []
    return {
        "routes": list(
            dict.fromkeys(
                sanitize_route(item) for item in routes[-5:] if isinstance(item, str)
            )
        ),
        "viewport": {
            "width": _dimension(viewport.get("width")),
            "height": _dimension(viewport.get("height")),
        },
        "screen": {
            "width": _dimension(screen.get("width")),
            "height": _dimension(screen.get("height")),
        },
        "pixel_ratio": _pixel_ratio(value.get("pixel_ratio")),
        "browser": _browser_family(str(value.get("user_agent") or "")),
        "platform": _platform_family(str(value.get("platform") or "")),
        "color_scheme": "dark" if value.get("color_scheme") == "dark" else "light",
        "touch": bool(value.get("touch")),
        "revision": current_revision(),
    }


@router.get("/configuration")
def feedback_configuration():
    client = CandidateJira()
    channel = os.getenv("LAUNCHLMS_RELEASE_CHANNEL", "").casefold()
    if not channel:
        try:
            channel = str(
                json.loads(Path("/app/build-info.json").read_text()).get(
                    "source_branch", ""
                )
            ).casefold()
        except OSError, json.JSONDecodeError:
            channel = ""
    return {
        "feedback_configured": client.configured,
        "revision": current_revision(),
        "release_channel": channel or "stable",
        "unstable": channel in {"unstable", "candidate", "dev"},
    }


@router.get("/feedback")
def list_feedback(
    org_id: int | None = None,
    admin: bool = False,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    if admin:
        if not _has_platform_access(current_user.id, db_session):
            raise HTTPException(
                status_code=403, detail="Platform admin access required"
            )
    elif org_id is None:
        raise HTTPException(status_code=422, detail="Organization is required")
    else:
        require_org_membership(current_user.id, org_id, db_session)
    client = CandidateJira()
    closed_status_ids = set()
    if not admin:
        try:
            closed_status_ids = {
                status_id
                for column in client.board_columns()
                if column["name"].casefold() in {"closed", "archive", "archived"}
                for status_id in column["status_ids"]
            }
        except HTTPException:
            pass
    org_label = _jql_value(f"launchlms-org-{org_id}")
    org_filter = "" if admin else f'AND labels = "{org_label}" '
    issues = client.search(
        f'project = "{_jql_value(client.project)}" AND labels = "launchlms-feedback" {org_filter}ORDER BY updated DESC'
    )
    result = []
    for issue in issues:
        metadata = client.property(issue["key"], FEEDBACK_PROPERTY) or {}
        if not admin and int(metadata.get("org_id", -1)) != org_id:
            continue
        if not admin and int(metadata.get("user_id", -1)) != current_user.id:
            continue
        labels = set((issue.get("fields") or {}).get("labels") or [])
        status_id = str(((issue.get("fields") or {}).get("status") or {}).get("id", ""))
        if not admin and (
            "tester-confirmed" in labels or status_id in closed_status_ids
        ):
            continue
        serialized = serialize_feedback(issue, metadata, client, admin=admin)
        if not admin:
            seen = (current_user.details or {}).get("candidate_feedback_seen", {})
            previous = seen.get(serialized["key"])
            has_visible_update = serialized["status_category"] != "new" or bool(
                serialized["visible_revision"].partition(":")[2]
            )
            serialized["has_unread"] = previous != serialized["visible_revision"] and (
                previous is not None or has_visible_update
            )
        result.append(serialized)
    return result


@router.post("/feedback", status_code=201)
def create_feedback(
    org_id: int = Form(...),
    message: str = Form(...),
    intent: str | None = Form(default=None),
    context: str | None = Form(default=None),
    images: list[UploadFile] = File(default=[]),
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    require_org_membership(current_user.id, org_id, db_session)
    if len(images) > MAX_ATTACHMENTS:
        raise HTTPException(
            status_code=422, detail=f"Attach up to {MAX_ATTACHMENTS} screenshots"
        )
    client = CandidateJira()
    normalized_intent = str(intent or "").strip().casefold() or None
    if normalized_intent not in FEEDBACK_INTENTS | {None}:
        raise HTTPException(status_code=422, detail="Unknown feedback intent")
    issue = client.create_feedback(
        org_id=org_id,
        user=current_user,
        message=_clean_message(message),
        intent=normalized_intent,
    )
    client.add_comment(
        issue["key"],
        "Anonymous reproduction context\n"
        + json.dumps(sanitize_context(context), indent=2),
        internal=True,
    )
    for image in images:
        client.add_attachment(issue["key"], image)
    issue = client.issue(issue["key"])
    metadata = client.property(issue["key"], FEEDBACK_PROPERTY) or {}
    return serialize_feedback(issue, metadata, client, admin=False)


@router.patch("/feedback/{issue_key}/admin")
def admin_update_feedback(
    issue_key: str,
    body: FeedbackAdminUpdate,
    org_id: int | None = None,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    issue, metadata = _feedback_issue(
        client, issue_key, org_id, current_user, db_session, admin=True
    )
    if body.priority_id:
        if body.priority_id not in {item["id"] for item in client.priorities()}:
            raise HTTPException(status_code=422, detail="Unknown Jira priority")
        client.update_fields(issue_key, {"priority": {"id": body.priority_id}})
    if body.status_id and body.status_id != str(
        ((issue.get("fields") or {}).get("status") or {}).get("id", "")
    ):
        client.transition(issue_key, body.status_id)
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=True)


@router.post("/feedback/{issue_key}/reply")
def reply_to_feedback(
    issue_key: str,
    body: FeedbackReply,
    org_id: int | None = None,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    _, metadata = _feedback_issue(
        client, issue_key, org_id, current_user, db_session, admin=True
    )
    client.add_comment(issue_key, _clean_message(body.message), internal=body.internal)
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=True)


@router.post("/feedback/{issue_key}/comment")
def comment_on_feedback(
    issue_key: str,
    body: FeedbackReply,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    _, metadata = _feedback_issue(client, issue_key, org_id, current_user, db_session)
    client.add_tester_comment(issue_key, _clean_message(body.message))
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=False)


@router.post("/feedback/{issue_key}/resolution")
def resolve_feedback(
    issue_key: str,
    body: FeedbackResolution,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    issue, metadata = _feedback_issue(
        client, issue_key, org_id, current_user, db_session
    )
    fields = issue.get("fields") or {}
    if ((fields.get("status") or {}).get("statusCategory") or {}).get("key") != "done":
        raise HTTPException(
            status_code=409, detail="This feedback is not ready to review"
        )
    labels = set(fields.get("labels") or [])
    columns = client.board_columns()
    if body.outcome == "looks_good":
        closed_ids = {
            status_id
            for column in columns
            if column["name"].casefold() in {"closed", "archive", "archived"}
            for status_id in column["status_ids"]
        }
        transition = next(
            (
                item
                for item in client.transitions(issue_key)
                if item["to"]["id"] in closed_ids
            ),
            None,
        )
        if transition:
            client.transition(issue_key, transition["to"]["id"])
        labels.add("tester-confirmed")
        client.update_fields(issue_key, {"labels": sorted(labels)})
        client.add_tester_comment(issue_key, "Looks good now.")
    else:
        open_ids = set(columns[0]["status_ids"] if columns else [])
        transition = next(
            (
                item
                for item in client.transitions(issue_key)
                if item["to"]["id"] in open_ids
            ),
            None,
        )
        if not transition:
            raise HTTPException(
                status_code=409,
                detail="Jira has no direct transition back to the open column",
            )
        client.transition(issue_key, transition["to"]["id"])
        labels.discard("tester-confirmed")
        client.update_fields(issue_key, {"labels": sorted(labels)})
        client.add_tester_comment(issue_key, "Still happening after completion.")
    return serialize_feedback(client.issue(issue_key), metadata, client, admin=False)


@router.post("/feedback/viewed")
def mark_feedback_viewed(
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    require_org_membership(current_user.id, org_id, db_session)
    client = CandidateJira()
    org_label = _jql_value(f"launchlms-org-{org_id}")
    issues = client.search(
        f'project = "{_jql_value(client.project)}" AND labels = "launchlms-feedback" '
        f'AND labels = "{org_label}" ORDER BY updated DESC'
    )
    seen = dict((current_user.details or {}).get("candidate_feedback_seen", {}))
    for issue in issues:
        metadata = client.property(issue["key"], FEEDBACK_PROPERTY) or {}
        if int(metadata.get("user_id", -1)) != current_user.id:
            continue
        item = serialize_feedback(issue, metadata, client, admin=False)
        seen[item["key"]] = item["visible_revision"]
    _update_user_details(
        db_session,
        current_user.id,
        "candidate_feedback_seen",
        dict(list(seen.items())[-100:]),
    )
    return {"seen": len(seen)}


@router.get("/feedback/{issue_key}/attachments/{attachment_id}")
def get_feedback_attachment(
    issue_key: str,
    attachment_id: str,
    org_id: int | None = None,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    client = CandidateJira()
    admin = bool(org_id is None and _has_platform_access(current_user.id, db_session))
    issue, _ = _feedback_issue(
        client, issue_key, org_id, current_user, db_session, admin=admin
    )
    attachment = next(
        (
            item
            for item in (issue.get("fields") or {}).get("attachment") or []
            if str(item.get("id")) == attachment_id
        ),
        None,
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    body, content_type = client._request(
        "GET", f"/rest/api/3/attachment/content/{attachment_id}", raw=True
    )
    return Response(
        body,
        media_type=content_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/releases")
def release_feed(
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    revision = current_revision()
    if revision == "unknown":
        return {
            "current_revision": revision,
            "repository": "",
            "has_unread": False,
            "unseen": [],
            "previous": [],
        }
    details = dict(current_user.details or {})
    seen = details.get("candidate_release_seen")
    github = CandidateGitHub()
    unseen_commits = (
        github.commits(base=seen, head=revision) if seen != revision else []
    )
    unseen = [
        release
        for commit in reversed(unseen_commits)
        if (release := github_release(commit, github))
    ]
    unseen_shas = {item["revision"] for item in unseen}
    previous = [
        release
        for commit in github.recent_commits(revision)
        if commit.get("sha") not in unseen_shas
        and (release := github_release(commit, github))
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


@router.get("/feedback/workflow")
def feedback_workflow(current_user: PublicUser = Depends(require_superadmin)):
    client = CandidateJira()
    return {"columns": client.board_columns(), "priorities": client.priorities()}


@router.get("/announcements")
def list_announcements(current_user: PublicUser = Depends(get_current_user)):
    items = (CandidateJira().project_property(ANNOUNCEMENTS_PROPERTY) or {}).get(
        "items", []
    )
    seen = set((current_user.details or {}).get("candidate_announcements_seen", []))
    return {
        "items": items,
        "unread": [item for item in reversed(items) if item.get("id") not in seen],
    }


@router.post("/announcements/viewed")
def mark_announcements_viewed(
    announcement_ids: list[str],
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    valid = {
        item.get("id")
        for item in (
            CandidateJira().project_property(ANNOUNCEMENTS_PROPERTY) or {}
        ).get("items", [])
    }
    seen = list(
        dict.fromkeys(
            [
                *(current_user.details or {}).get("candidate_announcements_seen", []),
                *[item for item in announcement_ids if item in valid],
            ]
        )
    )[-100:]
    _update_user_details(
        db_session, current_user.id, "candidate_announcements_seen", seen
    )
    return {"seen": seen}


@router.post("/announcements", status_code=201)
def create_announcement(
    body: AnnouncementCreate, current_user: PublicUser = Depends(require_superadmin)
):
    client = CandidateJira()
    items = (client.project_property(ANNOUNCEMENTS_PROPERTY) or {}).get("items", [])
    announcement = {
        "id": uuid4().hex,
        "title": _clean_message(body.title)[:120],
        "message": _clean_message(body.message)[:1000],
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    client.set_project_property(
        ANNOUNCEMENTS_PROPERTY, {"items": [announcement, *items][:10]}
    )
    return announcement


@router.delete("/announcements/{announcement_id}", status_code=204)
def delete_announcement(
    announcement_id: str, current_user: PublicUser = Depends(require_superadmin)
):
    client = CandidateJira()
    items = (client.project_property(ANNOUNCEMENTS_PROPERTY) or {}).get("items", [])
    client.set_project_property(
        ANNOUNCEMENTS_PROPERTY,
        {"items": [item for item in items if item.get("id") != announcement_id]},
    )

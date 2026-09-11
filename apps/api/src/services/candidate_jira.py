"""Jira-backed tester feedback and candidate release notes.

The application owns no second feedback database. Jira issues, comments,
attachments, statuses, priorities, labels, and issue properties are the durable
record. Only per-user "last viewed revision" lives on the existing user record.
"""

from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from src.security.file_validation import validate_image_content

FEEDBACK_PROPERTY = "launchlms.feedback"
RELEASE_PROPERTY = "launchlms.release-note"
PUBLIC_REPLY_PREFIX = "[Launch LMS reply]"
INTERNAL_NOTE_PREFIX = "[Launch LMS internal note]"
MAX_ATTACHMENTS = 3
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
BUILD_INFO_PATH = Path("/app/build-info.json")


def _adf(text: str) -> dict:
    return {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text[:28000]}]}],
    }


def _adf_text(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if value.get("type") == "text":
        return str(value.get("text", ""))
    return "".join(_adf_text(child) for child in value.get("content", []))


def current_revision() -> str:
    try:
        value = json.loads(BUILD_INFO_PATH.read_text()).get("commit_sha", "unknown")
    except (OSError, json.JSONDecodeError):
        value = os.getenv("LAUNCHLMS_BUILD_REVISION", "unknown")
    return str(value or "unknown").lower()


def revision_label(revision: str) -> str:
    safe = re.sub(r"[^a-z0-9-]", "", revision.lower())[:12]
    return f"candidate-{safe or 'unknown'}"


class CandidateJira:
    def __init__(self, environment=None):
        env = environment or os.environ
        self.base_url = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_BASE_URL", env.get("JIRA_BASE_URL", ""))).rstrip("/")
        self.email = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_EMAIL", env.get("JIRA_EMAIL", "")))
        self.token = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_API_TOKEN", env.get("JIRA_API_TOKEN", "")))
        self.project = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_PROJECT_KEY", env.get("JIRA_PROJECT_KEY", "")))
        self.issue_type = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_ISSUE_TYPE", "Task"))
        self.statuses = {
            "open": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_STATUS_OPEN", "To Do")),
            "in_progress": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_STATUS_IN_PROGRESS", "In Progress")),
            "awaiting_confirmation": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_STATUS_CONFIRM", "In Review")),
            "solved": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_STATUS_SOLVED", "Done")),
            "ignored": str(env.get("LAUNCHLMS_FEEDBACK_JIRA_STATUS_IGNORED", "Done")),
        }
        self.configured = all((self.base_url, self.email, self.token, self.project))
        parsed = urlparse(self.base_url)
        if self.configured and parsed.scheme != "https" and parsed.hostname not in {"127.0.0.1", "localhost"}:
            raise HTTPException(status_code=503, detail="Jira feedback URL must use HTTPS")
        credential = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()
        self.authorization = f"Basic {credential}"

    def _request(self, method: str, path: str, payload=None, *, headers=None, raw=False):
        if not self.configured:
            raise HTTPException(status_code=503, detail="Tester feedback is not connected to Jira")
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode() if payload is not None else None
        request_headers = {"Accept": "application/json", "Authorization": self.authorization}
        if payload is not None and not isinstance(payload, bytes):
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        request = Request(f"{self.base_url}{path}", data=data, method=method, headers=request_headers)
        try:
            with urlopen(request, timeout=25) as response:
                body = response.read()
                if raw:
                    return body, response.headers.get("Content-Type", "application/octet-stream")
                return json.loads(body) if body else {}
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise HTTPException(status_code=502, detail=f"Jira request failed ({error.code}): {detail}") from None
        except URLError as error:
            raise HTTPException(status_code=503, detail=f"Could not reach Jira: {error.reason}") from None

    def search(self, jql: str) -> list[dict]:
        result = self._request("POST", "/rest/api/3/search/jql", {
            "jql": jql,
            "fields": ["summary", "description", "status", "priority", "labels", "comment", "attachment", "updated", "created"],
            "maxResults": 100,
        })
        return result.get("issues", [])

    def property(self, issue_key: str, property_key: str) -> dict | None:
        try:
            return self._request("GET", f"/rest/api/3/issue/{quote(issue_key)}/properties/{quote(property_key)}").get("value")
        except HTTPException as error:
            if "(404)" in error.detail:
                return None
            raise

    def set_property(self, issue_key: str, property_key: str, value: dict):
        self._request("PUT", f"/rest/api/3/issue/{quote(issue_key)}/properties/{quote(property_key)}", value)

    def issue(self, issue_key: str) -> dict:
        fields = "summary,description,status,priority,labels,comment,attachment,updated,created"
        return self._request("GET", f"/rest/api/3/issue/{quote(issue_key)}?fields={fields}")

    def create_feedback(self, *, org_id: int, user, message: str) -> dict:
        fields = {
            "project": {"key": self.project},
            "issuetype": {"name": self.issue_type},
            "summary": message.strip().splitlines()[0][:110],
            "description": _adf(message.strip()),
            "priority": {"name": "Medium"},
            "labels": ["launchlms-feedback", f"launchlms-org-{org_id}"],
        }
        created = self._request("POST", "/rest/api/3/issue", {"fields": fields})
        self.set_property(created["key"], FEEDBACK_PROPERTY, {
            "org_id": org_id,
            "user_id": user.id,
            "user_uuid": user.user_uuid,
            "username": user.username,
            "source": "unstable",
        })
        return self.issue(created["key"])

    def update_fields(self, issue_key: str, fields: dict):
        self._request("PUT", f"/rest/api/3/issue/{quote(issue_key)}", {"fields": fields})

    def add_comment(self, issue_key: str, message: str, *, internal: bool):
        prefix = INTERNAL_NOTE_PREFIX if internal else PUBLIC_REPLY_PREFIX
        self._request("POST", f"/rest/api/3/issue/{quote(issue_key)}/comment", {"body": _adf(f"{prefix} {message.strip()}")})

    def transition(self, issue_key: str, state: str):
        target = self.statuses[state]
        transitions = self._request("GET", f"/rest/api/3/issue/{quote(issue_key)}/transitions").get("transitions", [])
        match = next((item for item in transitions if item.get("to", {}).get("name", "").casefold() == target.casefold()), None)
        if not match:
            raise HTTPException(status_code=409, detail=f"Jira has no direct transition to {target}")
        self._request("POST", f"/rest/api/3/issue/{quote(issue_key)}/transitions", {"transition": {"id": match["id"]}})

    def add_attachment(self, issue_key: str, upload: UploadFile):
        content = upload.file.read(MAX_ATTACHMENT_BYTES + 1)
        upload.file.seek(0)
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="Each screenshot must be 5 MB or smaller")
        if upload.content_type not in {"image/jpeg", "image/png", "image/gif", "image/webp"}:
            raise HTTPException(status_code=415, detail="Only JPG, PNG, GIF, and WebP screenshots are supported")
        if not validate_image_content(content):
            raise HTTPException(status_code=415, detail="Screenshot content is invalid")
        boundary = f"----launchlms-{uuid4().hex}"
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", upload.filename or "screenshot.png")
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{safe_name}\"\r\n"
            f"Content-Type: {upload.content_type}\r\n\r\n"
        ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
        return self._request(
            "POST", f"/rest/api/3/issue/{quote(issue_key)}/attachments", body,
            headers={"X-Atlassian-Token": "no-check", "Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    def attachment(self, attachment_id: str):
        return self._request("GET", f"/rest/api/3/attachment/content/{quote(attachment_id)}", raw=True)


class CandidateGitHub:
    """Read deployed-commit notes from GitHub merge and commit history."""

    def __init__(self, environment=None):
        env = environment or os.environ
        self.repository = str(env.get("LAUNCHLMS_GITHUB_REPOSITORY", "Life2LaunchLabs/launch-lms")).strip()
        self.token = str(env.get("LAUNCHLMS_GITHUB_TOKEN", "")).strip()
        self.api_url = str(env.get("LAUNCHLMS_GITHUB_API_URL", "https://api.github.com")).rstrip("/")

    def _request(self, path: str):
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "Launch-LMS-candidate-notes",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(f"{self.api_url}{path}", headers=headers)
        try:
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read())
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:300]
            raise HTTPException(status_code=502, detail=f"GitHub release notes failed ({error.code}): {detail}") from None
        except URLError as error:
            raise HTTPException(status_code=503, detail=f"Could not reach GitHub: {error.reason}") from None

    def commits(self, *, base: str | None, head: str) -> list[dict]:
        repo = quote(self.repository, safe="/")
        if base and base != "unknown":
            try:
                result = self._request(f"/repos/{repo}/compare/{quote(base)}...{quote(head)}")
                return result.get("commits", [])[-20:]
            except HTTPException:
                pass
        try:
            return [self._request(f"/repos/{repo}/commits/{quote(head)}")]
        except HTTPException:
            return []

    def recent_commits(self, head: str, limit=20) -> list[dict]:
        repo = quote(self.repository, safe="/")
        return self._request(f"/repos/{repo}/commits?sha={quote(head)}&per_page={limit}")

    def pull_for_commit(self, sha: str) -> dict | None:
        repo = quote(self.repository, safe="/")
        pulls = self._request(f"/repos/{repo}/commits/{quote(sha)}/pulls")
        return pulls[0] if pulls else None


def _release_note_from_body(body: str | None) -> str | None:
    match = re.search(
        r"(?ims)^#{1,3}\s*(?:release note|what'?s new)\s*$\s*(.+?)(?=^#{1,3}\s|\Z)",
        body or "",
    )
    if not match:
        match = re.search(r"(?im)^release note:\s*(.+)$", body or "")
    if not match:
        return None
    note = re.sub(r"\s+", " ", match.group(1)).strip(" -*\t\n")
    if note.casefold() in {"none", "n/a", "not applicable"}:
        return None
    return note[:500] or None


def github_release(commit: dict, client: CandidateGitHub) -> dict:
    sha = str(commit.get("sha", ""))
    commit_data = commit.get("commit") or {}
    subject = str(commit_data.get("message", "Update")).splitlines()[0]
    note = _release_note_from_body(str(commit_data.get("message", "")))
    pull = None
    if not note and subject.casefold().startswith("merge pull request"):
        pull = client.pull_for_commit(sha)
        note = _release_note_from_body((pull or {}).get("body")) or (pull or {}).get("title")
    note = str(note or subject)
    author = commit_data.get("author") or {}
    return {
        "revision": sha,
        "published_at": author.get("date"),
        "title": f"Push {sha[:7]}",
        "notes": [{
            "text": note,
            "url": (pull or {}).get("html_url") or commit.get("html_url"),
            "pull_number": (pull or {}).get("number"),
        }],
    }


def state_for_issue(issue: dict, client: CandidateJira) -> str:
    fields = issue.get("fields", {})
    labels = set(fields.get("labels") or [])
    if "feedback-ignored" in labels:
        return "ignored"
    if "tester-confirmed" in labels:
        return "solved"
    status = (fields.get("status") or {}).get("name", "")
    for state, name in client.statuses.items():
        if status.casefold() == name.casefold() and state != "ignored":
            return state
    return "open"


def serialize_feedback(issue: dict, metadata: dict, client: CandidateJira, *, admin: bool) -> dict:
    fields = issue.get("fields", {})
    comments = ((fields.get("comment") or {}).get("comments") or [])
    entries = []
    for comment in comments:
        body = _adf_text(comment.get("body")).strip()
        internal = body.startswith(INTERNAL_NOTE_PREFIX)
        public = body.startswith(PUBLIC_REPLY_PREFIX)
        if not (internal or public) or (internal and not admin):
            continue
        prefix = INTERNAL_NOTE_PREFIX if internal else PUBLIC_REPLY_PREFIX
        entries.append({
            "id": str(comment.get("id", "")),
            "message": body[len(prefix):].strip(),
            "internal": internal,
            "author": (comment.get("author") or {}).get("displayName", "Administrator"),
            "created_at": comment.get("created"),
        })
    return {
        "key": issue.get("key"),
        "message": _adf_text(fields.get("description")).strip(),
        "status": state_for_issue(issue, client),
        "priority": "high" if (fields.get("priority") or {}).get("name", "").casefold() in {"high", "highest"} else "normal",
        "fixed_in_revision": (client.property(issue["key"], RELEASE_PROPERTY) or {}).get("revision"),
        "submitter": metadata.get("username", "Tester") if admin else None,
        "created_at": fields.get("created"),
        "updated_at": fields.get("updated"),
        "entries": entries,
        "attachments": [{
            "id": str(item.get("id", "")), "filename": item.get("filename"),
            "content_type": item.get("mimeType"), "size": item.get("size"),
        } for item in fields.get("attachment") or []],
    }

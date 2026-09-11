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
PUBLIC_REPLY_PREFIX = "[Launch LMS reply]"
INTERNAL_NOTE_PREFIX = "[Launch LMS internal note]"
TESTER_COMMENT_PREFIX = "[Launch LMS tester comment]"
ANNOUNCEMENTS_PROPERTY = "launchlms.candidate-announcements"
MAX_ATTACHMENTS = 3
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
BUILD_INFO_PATH = Path("/app/build-info.json")


def _adf(text: str) -> dict:
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text[:28000]}]}
        ],
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
    except OSError, json.JSONDecodeError:
        value = os.getenv("LAUNCHLMS_BUILD_REVISION", "unknown")
    return str(value or "unknown").lower()


class CandidateJira:
    def __init__(self, environment=None):
        env = environment or os.environ
        self.base_url = str(
            env.get("LAUNCHLMS_FEEDBACK_JIRA_BASE_URL", env.get("JIRA_BASE_URL", ""))
        ).rstrip("/")
        self.email = str(
            env.get("LAUNCHLMS_FEEDBACK_JIRA_EMAIL", env.get("JIRA_EMAIL", ""))
        )
        self.token = str(
            env.get("LAUNCHLMS_FEEDBACK_JIRA_API_TOKEN", env.get("JIRA_API_TOKEN", ""))
        )
        self.project = str(
            env.get(
                "LAUNCHLMS_FEEDBACK_JIRA_PROJECT_KEY", env.get("JIRA_PROJECT_KEY", "")
            )
        )
        self.issue_type = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_ISSUE_TYPE", "Task"))
        self.board_id = str(env.get("LAUNCHLMS_FEEDBACK_JIRA_BOARD_ID", "")).strip()
        self.configured = all((self.base_url, self.email, self.token, self.project))
        parsed = urlparse(self.base_url)
        if (
            self.configured
            and parsed.scheme != "https"
            and parsed.hostname not in {"127.0.0.1", "localhost"}
        ):
            raise HTTPException(
                status_code=503, detail="Jira feedback URL must use HTTPS"
            )
        credential = base64.b64encode(f"{self.email}:{self.token}".encode()).decode()
        self.authorization = f"Basic {credential}"

    def _request(
        self, method: str, path: str, payload=None, *, headers=None, raw=False
    ):
        if not self.configured:
            raise HTTPException(
                status_code=503, detail="Tester feedback is not connected to Jira"
            )
        data = (
            payload
            if isinstance(payload, bytes)
            else json.dumps(payload).encode()
            if payload is not None
            else None
        )
        request_headers = {
            "Accept": "application/json",
            "Authorization": self.authorization,
        }
        if payload is not None and not isinstance(payload, bytes):
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        request = Request(
            f"{self.base_url}{path}", data=data, method=method, headers=request_headers
        )
        try:
            with urlopen(request, timeout=25) as response:
                body = response.read()
                if raw:
                    return body, response.headers.get(
                        "Content-Type", "application/octet-stream"
                    )
                return json.loads(body) if body else {}
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            raise HTTPException(
                status_code=502, detail=f"Jira request failed ({error.code}): {detail}"
            ) from None
        except URLError as error:
            raise HTTPException(
                status_code=503, detail=f"Could not reach Jira: {error.reason}"
            ) from None

    def search(self, jql: str) -> list[dict]:
        result = self._request(
            "POST",
            "/rest/api/3/search/jql",
            {
                "jql": jql,
                "fields": [
                    "summary",
                    "description",
                    "status",
                    "statuscategorychangedate",
                    "priority",
                    "labels",
                    "comment",
                    "attachment",
                    "updated",
                    "created",
                ],
                "maxResults": 100,
            },
        )
        return result.get("issues", [])

    def property(self, issue_key: str, property_key: str) -> dict | None:
        try:
            return self._request(
                "GET",
                f"/rest/api/3/issue/{quote(issue_key)}/properties/{quote(property_key)}",
            ).get("value")
        except HTTPException as error:
            if "(404)" in error.detail:
                return None
            raise

    def set_property(self, issue_key: str, property_key: str, value: dict):
        self._request(
            "PUT",
            f"/rest/api/3/issue/{quote(issue_key)}/properties/{quote(property_key)}",
            value,
        )

    def issue(self, issue_key: str) -> dict:
        fields = "summary,description,status,statuscategorychangedate,priority,labels,comment,attachment,updated,created"
        return self._request(
            "GET", f"/rest/api/3/issue/{quote(issue_key)}?fields={fields}"
        )

    def project_property(self, property_key: str) -> dict | None:
        try:
            return self._request(
                "GET",
                f"/rest/api/3/project/{quote(self.project)}/properties/{quote(property_key)}",
            ).get("value")
        except HTTPException as error:
            if "(404)" in error.detail:
                return None
            raise

    def set_project_property(self, property_key: str, value: dict):
        self._request(
            "PUT",
            f"/rest/api/3/project/{quote(self.project)}/properties/{quote(property_key)}",
            value,
        )

    def project_statuses(self) -> list[dict]:
        groups = self._request(
            "GET", f"/rest/api/3/project/{quote(self.project)}/statuses"
        )
        statuses = []
        seen = set()
        matching_groups = [
            group for group in groups if group.get("name") == self.issue_type
        ] or groups
        for group in matching_groups:
            for status in group.get("statuses") or []:
                if status.get("id") in seen:
                    continue
                seen.add(status.get("id"))
                statuses.append(
                    {
                        "id": str(status.get("id", "")),
                        "name": status.get("name", "Unknown"),
                        "category": (status.get("statusCategory") or {}).get(
                            "key", "new"
                        ),
                    }
                )
        return statuses

    def board_columns(self) -> list[dict]:
        board_id = self.board_id
        if not board_id:
            boards = self._request(
                "GET",
                f"/rest/agile/1.0/board?projectKeyOrId={quote(self.project)}&type=kanban&maxResults=1",
            ).get("values", [])
            board_id = str((boards[0] if boards else {}).get("id", ""))
        if board_id:
            configuration = self._request(
                "GET", f"/rest/agile/1.0/board/{quote(board_id)}/configuration"
            )
            columns = []
            for index, column in enumerate(
                (configuration.get("columnConfig") or {}).get("columns") or []
            ):
                status_ids = []
                for status in column.get("statuses") or []:
                    status_id = str(status.get("id", ""))
                    if not status_id:
                        status_id = (
                            str(status.get("self", "")).rstrip("/").rsplit("/", 1)[-1]
                        )
                    if status_id:
                        status_ids.append(status_id)
                columns.append(
                    {
                        "id": f"column-{index}",
                        "name": column.get("name", "Open"),
                        "status_ids": status_ids,
                    }
                )
            if columns:
                return columns
        return [
            {
                "id": f"status-{status['id']}",
                "name": status["name"],
                "status_ids": [status["id"]],
            }
            for status in self.project_statuses()
        ]

    def priorities(self) -> list[dict]:
        return [
            {"id": str(item.get("id", "")), "name": item.get("name", "")}
            for item in self._request("GET", "/rest/api/3/priority")
        ]

    def transitions(self, issue_key: str) -> list[dict]:
        values = self._request(
            "GET", f"/rest/api/3/issue/{quote(issue_key)}/transitions"
        ).get("transitions", [])
        return [
            {
                "id": str(item.get("id", "")),
                "name": item.get("name", ""),
                "to": {
                    "id": str((item.get("to") or {}).get("id", "")),
                    "name": (item.get("to") or {}).get("name", ""),
                    "category": (
                        (item.get("to") or {}).get("statusCategory") or {}
                    ).get("key", "new"),
                },
            }
            for item in values
        ]

    def create_feedback(
        self, *, org_id: int, user, message: str, intent: str | None = None
    ) -> dict:
        labels = ["launchlms-feedback", f"launchlms-org-{org_id}"]
        if intent:
            labels.append(f"feedback-intent-{intent}")
        fields = {
            "project": {"key": self.project},
            "issuetype": {"name": self.issue_type},
            "summary": message.strip().splitlines()[0][:110],
            "description": _adf(message.strip()),
            "priority": {"name": "Medium"},
            "labels": labels,
        }
        created = self._request("POST", "/rest/api/3/issue", {"fields": fields})
        self.set_property(
            created["key"],
            FEEDBACK_PROPERTY,
            {
                "org_id": org_id,
                "user_id": user.id,
                "user_uuid": user.user_uuid,
                "username": user.username,
                "intent": intent,
                "source": "unstable",
            },
        )
        return self.issue(created["key"])

    def update_fields(self, issue_key: str, fields: dict):
        self._request(
            "PUT", f"/rest/api/3/issue/{quote(issue_key)}", {"fields": fields}
        )

    def add_comment(self, issue_key: str, message: str, *, internal: bool):
        prefix = INTERNAL_NOTE_PREFIX if internal else PUBLIC_REPLY_PREFIX
        self._request(
            "POST",
            f"/rest/api/3/issue/{quote(issue_key)}/comment",
            {"body": _adf(f"{prefix} {message.strip()}")},
        )

    def add_tester_comment(self, issue_key: str, message: str):
        self._request(
            "POST",
            f"/rest/api/3/issue/{quote(issue_key)}/comment",
            {"body": _adf(f"{TESTER_COMMENT_PREFIX} {message.strip()}")},
        )

    def transition(self, issue_key: str, status_id: str):
        transitions = self._request(
            "GET", f"/rest/api/3/issue/{quote(issue_key)}/transitions"
        ).get("transitions", [])
        match = next(
            (
                item
                for item in transitions
                if str(item.get("to", {}).get("id", "")) == str(status_id)
            ),
            None,
        )
        if not match:
            raise HTTPException(
                status_code=409, detail="Jira has no direct transition to that status"
            )
        self._request(
            "POST",
            f"/rest/api/3/issue/{quote(issue_key)}/transitions",
            {"transition": {"id": match["id"]}},
        )

    def add_attachment(self, issue_key: str, upload: UploadFile):
        content = upload.file.read(MAX_ATTACHMENT_BYTES + 1)
        upload.file.seek(0)
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(
                status_code=413, detail="Each screenshot must be 5 MB or smaller"
            )
        if upload.content_type not in {
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
        }:
            raise HTTPException(
                status_code=415,
                detail="Only JPG, PNG, GIF, and WebP screenshots are supported",
            )
        if not validate_image_content(content):
            raise HTTPException(status_code=415, detail="Screenshot content is invalid")
        boundary = f"----launchlms-{uuid4().hex}"
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", upload.filename or "screenshot.png")
        body = (
            (
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
                f"Content-Type: {upload.content_type}\r\n\r\n"
            ).encode()
            + content
            + f"\r\n--{boundary}--\r\n".encode()
        )
        return self._request(
            "POST",
            f"/rest/api/3/issue/{quote(issue_key)}/attachments",
            body,
            headers={
                "X-Atlassian-Token": "no-check",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )

    def attachment(self, attachment_id: str):
        return self._request(
            "GET", f"/rest/api/3/attachment/content/{quote(attachment_id)}", raw=True
        )


class CandidateGitHub:
    """Read deployed-commit notes from GitHub merge and commit history."""

    def __init__(self, environment=None):
        env = environment or os.environ
        self.repository = str(
            env.get("LAUNCHLMS_GITHUB_REPOSITORY", "Life2LaunchLabs/launch-lms")
        ).strip()
        self.token = str(env.get("LAUNCHLMS_GITHUB_TOKEN", "")).strip()
        self.api_url = str(
            env.get("LAUNCHLMS_GITHUB_API_URL", "https://api.github.com")
        ).rstrip("/")

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
            raise HTTPException(
                status_code=502,
                detail=f"GitHub release notes failed ({error.code}): {detail}",
            ) from None
        except URLError as error:
            raise HTTPException(
                status_code=503, detail=f"Could not reach GitHub: {error.reason}"
            ) from None

    def commits(self, *, base: str | None, head: str) -> list[dict]:
        repo = quote(self.repository, safe="/")
        if base and base != "unknown":
            try:
                result = self._request(
                    f"/repos/{repo}/compare/{quote(base)}...{quote(head)}"
                )
                return result.get("commits", [])[-20:]
            except HTTPException:
                pass
        try:
            return [self._request(f"/repos/{repo}/commits/{quote(head)}")]
        except HTTPException:
            return []

    def recent_commits(self, head: str, limit=20) -> list[dict]:
        repo = quote(self.repository, safe="/")
        return self._request(
            f"/repos/{repo}/commits?sha={quote(head)}&per_page={limit}"
        )

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


def github_release(commit: dict, client: CandidateGitHub) -> dict | None:
    sha = str(commit.get("sha", ""))
    commit_data = commit.get("commit") or {}
    note = _release_note_from_body(str(commit_data.get("message", "")))
    pull = None
    if not note:
        pull = client.pull_for_commit(sha)
        note = _release_note_from_body((pull or {}).get("body")) or (pull or {}).get(
            "title"
        )
    if not note:
        return None
    author = commit_data.get("author") or {}
    return {
        "revision": sha,
        "published_at": author.get("date"),
        "title": (pull or {}).get("title") or "Release update",
        "notes": [
            {
                "text": note,
                "url": (pull or {}).get("html_url") or commit.get("html_url"),
                "pull_number": (pull or {}).get("number"),
            }
        ],
    }


def serialize_feedback(
    issue: dict, metadata: dict, client: CandidateJira, *, admin: bool
) -> dict:
    fields = issue.get("fields", {})
    comments = (fields.get("comment") or {}).get("comments") or []
    entries = []
    for comment in comments:
        body = _adf_text(comment.get("body")).strip()
        internal = body.startswith(INTERNAL_NOTE_PREFIX)
        public = body.startswith(PUBLIC_REPLY_PREFIX)
        tester = body.startswith(TESTER_COMMENT_PREFIX)
        if not (internal or public or tester) or (internal and not admin):
            continue
        prefix = (
            INTERNAL_NOTE_PREFIX
            if internal
            else TESTER_COMMENT_PREFIX
            if tester
            else PUBLIC_REPLY_PREFIX
        )
        entries.append(
            {
                "id": str(comment.get("id", "")),
                "message": body[len(prefix) :].strip(),
                "internal": internal,
                "author": "You"
                if tester and not admin
                else (comment.get("author") or {}).get("displayName", "Administrator"),
                "audience": "internal"
                if internal
                else "tester"
                if tester
                else "shared",
                "created_at": comment.get("created"),
            }
        )
    status = fields.get("status") or {}
    priority = fields.get("priority") or {}
    status_category = (status.get("statusCategory") or {}).get("key", "new")
    last_shared_comment = next(
        (entry["id"] for entry in reversed(entries) if entry["audience"] == "shared"),
        "",
    )
    result = {
        "key": issue.get("key"),
        "message": _adf_text(fields.get("description")).strip(),
        "status": status.get("name", "Open"),
        "status_id": str(status.get("id", "")),
        "status_category": status_category,
        "done_at": fields.get("statuscategorychangedate")
        if status_category == "done"
        else None,
        "priority": priority.get("name", "Medium"),
        "priority_id": str(priority.get("id", "")),
        "visible_revision": f"{status.get('id', '')}:{last_shared_comment}",
        "submitter": metadata.get("username", "Tester") if admin else None,
        "intent": metadata.get("intent"),
        "tester_confirmed": "tester-confirmed" in set(fields.get("labels") or []),
        "created_at": fields.get("created"),
        "updated_at": fields.get("updated"),
        "entries": entries,
        "attachments": [
            {
                "id": str(item.get("id", "")),
                "filename": item.get("filename"),
                "content_type": item.get("mimeType"),
                "size": item.get("size"),
            }
            for item in fields.get("attachment") or []
        ],
    }
    if admin:
        result["transitions"] = client.transitions(issue["key"])
    return result

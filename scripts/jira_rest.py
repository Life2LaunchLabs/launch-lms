"""Small credential-safe Jira REST boundary for repository agent workflows."""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class JiraError(RuntimeError):
    pass


def load_env_file(path: str | None) -> None:
    if not path:
        return
    source = Path(path).expanduser()
    if not source.is_file():
        raise JiraError(f"Jira environment file does not exist: {source}")
    for raw in source.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def settings(project: str, env_file: str | None = None) -> dict[str, str]:
    load_env_file(env_file or os.getenv("LAUNCHLMS_JIRA_ENV_FILE"))
    feedback = project.upper() == "FEED"
    prefix = "LAUNCHLMS_FEEDBACK_JIRA_" if feedback else "JIRA_"

    def value(name: str, fallback: str = "", shared: bool = True) -> str:
        generic = os.getenv("JIRA_" + name) if shared else None
        return str(os.getenv(prefix + name) or generic or fallback).strip()

    result = {
        "base_url": value("BASE_URL").rstrip("/"),
        "email": value("EMAIL"),
        "token": value("API_TOKEN"),
        "project": value("PROJECT_KEY", project.upper(), shared=not feedback),
        "board_id": value("BOARD_ID", shared=not feedback),
    }
    missing = [key for key in ("base_url", "email", "token", "project") if not result[key]]
    if missing:
        raise JiraError("Missing Jira configuration: " + ", ".join(missing))
    if not result["base_url"].startswith("https://"):
        raise JiraError("Jira base URL must use HTTPS")
    return result


def adf(text: str) -> dict:
    return {"type": "doc", "version": 1, "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": text[:28000]}]}
    ]}


def adf_text(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if value.get("type") == "text":
        return str(value.get("text", ""))
    return "".join(adf_text(child) for child in value.get("content", []))


class JiraClient:
    def __init__(self, configuration: dict[str, str]):
        self.configuration = configuration
        self.base_url = configuration["base_url"]
        self.project = configuration["project"]
        raw = f'{configuration["email"]}:{configuration["token"]}'.encode()
        self.authorization = "Basic " + base64.b64encode(raw).decode()

    def request(self, method: str, path: str, payload=None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(
            self.base_url + path, data=data, method=method,
            headers={"Accept": "application/json", "Content-Type": "application/json", "Authorization": self.authorization},
        )
        try:
            with urlopen(request, timeout=25) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")[:500]
            raise JiraError(f"Jira request failed ({error.code}): {body}") from None
        except URLError as error:
            raise JiraError(f"Could not reach Jira: {error.reason}") from None

    def search(self, jql: str, fields: list[str] | None = None) -> list[dict]:
        issues, token = [], None
        requested = fields or [
            "summary", "description", "status", "priority", "issuetype", "parent",
            "subtasks", "labels", "comment", "attachment", "issuelinks", "created", "updated",
        ]
        while True:
            payload = {"jql": jql, "fields": requested, "maxResults": 100}
            if token:
                payload["nextPageToken"] = token
            page = self.request("POST", "/rest/api/3/search/jql", payload)
            issues.extend(page.get("issues", []))
            token = page.get("nextPageToken")
            if not token:
                return issues

    def issue(self, key: str) -> dict:
        fields = "summary,description,status,priority,issuetype,parent,subtasks,labels,comment,attachment,issuelinks,created,updated"
        return self.request("GET", f"/rest/api/3/issue/{quote(key)}?fields={fields}")

    def statuses(self) -> list[dict]:
        return self.request("GET", f"/rest/api/3/project/{quote(self.project)}/statuses")

    def transitions(self, key: str) -> list[dict]:
        return self.request("GET", f"/rest/api/3/issue/{quote(key)}/transitions").get("transitions", [])

    def transition(self, key: str, target_status_id: str) -> None:
        transition = next((item for item in self.transitions(key) if str((item.get("to") or {}).get("id")) == str(target_status_id)), None)
        if not transition:
            raise JiraError(f"{key} has no direct transition to status {target_status_id}")
        self.request("POST", f"/rest/api/3/issue/{quote(key)}/transitions", {"transition": {"id": transition["id"]}})

    def update(self, key: str, fields: dict) -> None:
        self.request("PUT", f"/rest/api/3/issue/{quote(key)}", {"fields": fields})

    def comment(self, key: str, text: str) -> None:
        self.request("POST", f"/rest/api/3/issue/{quote(key)}/comment", {"body": adf(text)})

    def property(self, key: str, name: str) -> dict:
        try:
            return self.request("GET", f"/rest/api/3/issue/{quote(key)}/properties/{quote(name)}").get("value") or {}
        except JiraError as error:
            if "(404)" in str(error):
                return {}
            raise

    def set_property(self, key: str, name: str, value: dict) -> None:
        self.request("PUT", f"/rest/api/3/issue/{quote(key)}/properties/{quote(name)}", value)

    def link(self, feed_key: str, bot_key: str, link_type: str) -> None:
        self.request("POST", "/rest/api/3/issueLink", {
            "type": {"name": link_type}, "inwardIssue": {"key": feed_key}, "outwardIssue": {"key": bot_key},
        })

    def create(self, fields: dict) -> str:
        value = self.request("POST", "/rest/api/3/issue", {"fields": fields})
        if not value.get("key"):
            raise JiraError("Jira created an issue without returning its key")
        return value["key"]


def summarize(issue: dict) -> dict:
    fields = issue.get("fields") or {}
    comments = (fields.get("comment") or {}).get("comments") or []
    return {
        "key": issue.get("key"), "summary": fields.get("summary"),
        "description": adf_text(fields.get("description")),
        "status": (fields.get("status") or {}).get("name"),
        "status_id": str((fields.get("status") or {}).get("id", "")),
        "priority": (fields.get("priority") or {}).get("name"),
        "labels": fields.get("labels") or [], "created": fields.get("created"), "updated": fields.get("updated"),
        "comments": [{"id": str(item.get("id", "")), "body": adf_text(item.get("body")), "created": item.get("created")} for item in comments],
        "links": fields.get("issuelinks") or [], "attachments": fields.get("attachment") or [],
        "subtasks": fields.get("subtasks") or [],
    }

"""Download my data: one zip with everything the platform keeps about a person, in JSON, plus the files they uploaded.

The export follows a fixed list of what belongs to a person (their account, portfolio, plans, badges, activity answers,
school records, chats, Coach conversations, saved resources and media) rather than every table that mentions them, so
nothing staff wrote only for staff (staff-only chat notes, chat reports), nothing about security (password
hashes, lockouts, sign-in IPs, tokens, OAuth grants) and nothing about other people's private work leaves through it.
Organizations export their own records from the admin panel (EPP caseload, requirement evidence, Insights captures).
"""

from __future__ import annotations

import base64
import datetime as dt
import decimal
import enum
import json
import logging
import re
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from sqlalchemy import Table, or_, select
from sqlmodel import Session, SQLModel

from src.db.users import PublicUser
from src.services.utils.storage import read_file_content

logger = logging.getLogger(__name__)

# Uploaded files go in the zip until they add up to this much; the rest are listed in files.json with their link.
MAX_FILE_BYTES = 500 * 1024 * 1024

# Columns that never leave the platform, whatever table they are in.
_SECRET_COLUMN = re.compile(r"password|token|secret|(^|_)hash$|^failed_login_attempts$|^locked_until$|^last_login_ip$")


@dataclass(frozen=True)
class Part:
    """One file of the export: rows of ``table`` whose ``column`` is the person (``parent`` None) or one of the ids
    of an earlier part's rows (``parent`` names that part, ``parent_column`` the column of its rows to match)."""

    path: str
    table: str
    column: str | tuple[str, ...]
    parent: str | None = None
    parent_column: str = "id"
    note: str = ""


def _parts() -> list[Part]:
    return [
        # Account
        Part("account/profile", "user", "id", note="Your account: name, email, profile and settings."),
        Part("account/organizations", "userorganization", "user_id", note="Organizations you belong to and your role in each."),
        Part("account/groups", "usergroupuser", "user_id", note="Groups you are in."),
        Part("account/join_requests", "organization_join_request", "user_id"),
        Part("account/invitations", "organizationinvitation", "target_user_id"),
        Part("account/blocked_people", "userblock", "blocker_user_id"),
        Part("account/payments", "paymentsenrollment", "user_id"),
        Part("account/feedback", "feedback_submission", "user_id", note="Feedback you sent about the app."),
        Part("account/feedback_files", "feedback_submission_file", "submission_id", "account/feedback"),
        # Portfolio
        Part("portfolio/portfolio", "portfolio", "user_id"),
        Part("portfolio/sections", "portfoliosection", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/projects", "projectitem", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/project_blocks", "projectitemblock", "project_item_id", "portfolio/projects"),
        Part("portfolio/timeline", "timelineentry", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/timeline_blocks", "timelineentryblock", "timeline_entry_id", "portfolio/timeline"),
        Part("portfolio/timeline_project_links", "timelineprojectlink", "timeline_entry_id", "portfolio/timeline"),
        Part("portfolio/links", "portfoliolink", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/traits", "profiletrait", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/credentials", "portfoliocredential", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/contacts", "portfoliocontact", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/quotes", "portfolioquote", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/results", "portfolioresult", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/resumes", "resumeversion", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/documents", "portfoliodocument", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/imports", "portfolioimport", "portfolio_id", "portfolio/portfolio"),
        Part("portfolio/people", "portfolioperson", "portfolio_id", "portfolio/portfolio"),
        # Plans and goals
        Part("plans/plans", "goal", ("owner_user_id", "subject_user_id"), note="Your plans and goals."),
        Part("plans/stages", "goal_stage", "goal_id", "plans/plans"),
        Part("plans/steps", "goal_step", "goal_id", "plans/plans"),
        Part("plans/step_progress", "step_progress", "step_id", "plans/steps"),
        Part("plans/step_entries", "step_entry", "step_id", "plans/steps", note="What you wrote and uploaded for each step."),
        Part("plans/stories", "goal_story", "goal_id", "plans/plans"),
        Part("plans/history", "planactivity", "goal_id", "plans/plans"),
        Part("plans/attachments", "planattachment", "goal_id", "plans/plans"),
        Part("plans/collaborators", "plancollaborator", "goal_id", "plans/plans"),
        Part("plans/assignments", "goal_assignment", "user_id"),
        Part("plans/join_requests", "plan_join_request", "user_id"),
        Part("plans/weekly_focus", "planweeklyfocus", "user_id"),
        Part("plans/life_plan", "lifeplan", "user_id", note="Your life plan: phases and budget."),
        # Badges, activities and requirements
        Part("badges/badges", "badge_award", "user_id", note="Badges you earned."),
        Part("activities/runs", "learningrun", "user_id", note="Interactive activities you started."),
        Part("activities/page_progress", "learningpageprogress", "run_id", "activities/runs"),
        Part("activities/answers", "learningresponseattempt", "user_id"),
        Part("requirements/enrollments", "requirementenrollment", "user_id"),
        Part("requirements/evidence", "requirementattainmentsource", "enrollment_id", "requirements/enrollments"),
        # School
        Part("school/epp_courses", "eppcourse", "user_id", note="Courses in your Education Plan and Profile."),
        Part("school/epp_records", "epprecord", "user_id", note="Reviewed Education Plan and Profile records."),
        Part("school/support", "learnersupport", "user_id", note="Schools and programs you let support your portfolio."),
        # Messages
        Part("messages/memberships", "conversationmember", "user_id"),
        Part("messages/conversations", "conversation", "id", "messages/memberships", "conversation_id"),
        Part("messages/messages", "conversationmessage", "conversation_id", "messages/conversations",
             note="Messages in your chats. Notes staff wrote only for staff are not included."),
        Part("messages/reactions", "conversationreaction", "user_id"),
        Part("messages/inbox", "inboxmessage", "recipient_user_id"),
        # Coach
        Part("coach/conversations", "hubconversation", "user_id"),
        Part("coach/messages", "hubconversationmessage", "conversation_id", "coach/conversations"),
        Part("coach/notes", "coach_note", "user_id", note="What Coach noticed on your goals at check-ins."),
        Part("coach/memories", "hubmemory", "user_id", note="What Coach remembers about you."),
        Part("coach/memory_setting", "hubmemorypreference", "user_id"),
        Part("coach/questions", "hubquestion", "user_id"),
        # Resources
        Part("resources/saved", "usersavedresource", "user_id"),
        Part("resources/my_channels", "userresourcechannel", "user_id"),
        Part("resources/saved_in_channels", "usersavedresourcechannel", "saved_resource_id", "resources/saved"),
        Part("resources/notes", "resourcenoteblock", "user_id"),
        Part("resources/comments", "resourcecomment", "author_id"),
        # Media
        Part("media/files", "mediaasset", "owner_user_id", note="Files you uploaded. The files themselves are in the files folder."),
        Part("media/folders", "mediafolder", "owner_user_id"),
    ]


def _json_value(value):
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(value)).decode()
    return value


def _rows(db: Session, table: Table, column: str | tuple[str, ...], values: set) -> list[dict]:
    if not values:
        return []
    columns = (column,) if isinstance(column, str) else column
    statement = select(table).where(or_(*(table.c[name].in_(sorted(values)) for name in columns)))
    if table.name == "conversationmessage":
        statement = statement.where(table.c.visibility != "staff")
    if "id" in table.c:
        statement = statement.order_by(table.c.id)
    rows = []
    for row in db.execute(statement).mappings():
        rows.append({key: _json_value(value) for key, value in row.items() if not _SECRET_COLUMN.search(key)})
    return rows


def collect(db: Session, user_id: int) -> dict[str, list[dict]]:
    """Every part of the export, as lists of rows keyed by path. Parts whose table is missing are skipped."""
    tables = SQLModel.metadata.tables
    found: dict[str, list[dict]] = {}
    for part in _parts():
        table = tables.get(part.table)
        if table is None:
            continue
        if part.parent is None:
            values = {user_id}
        else:
            values = {row.get(part.parent_column) for row in found.get(part.parent, [])} - {None}
        found[part.path] = _rows(db, table, part.column, values)
    return found


def _content_key(url: str, user_uuid: str) -> str | None:
    """The storage key of one of this person's own uploads, from its /content/users/<uuid>/... link, or None."""
    if not url:
        return None
    marker = url.find("/content/users/")
    if marker < 0:
        return None
    path = url[marker + 1:].split("?", 1)[0].split("#", 1)[0]
    parts = PurePosixPath(path).parts
    if len(parts) < 4 or parts[2] != user_uuid or any(part in ("..", ".") for part in parts):
        return None
    return str(PurePosixPath(*parts))


def _readme(user: PublicUser, found: dict[str, list[dict]], files: list[dict], generated: str) -> str:
    notes = {part.path: part.note for part in _parts()}
    lines = [
        "Your Launch LMS data",
        "=" * 20,
        "",
        f"For: {user.first_name} {user.last_name} ({user.username}, {user.email})".replace("  ", " "),
        f"Made: {generated}",
        "",
        "Each .json file holds a list of records. Records point at each other by their numeric ids, so",
        "plans/steps.json rows with goal_id 12 belong to the plan with id 12 in plans/plans.json.",
        "Files you uploaded are in the files folder; files.json lists each one and where it came from.",
        "",
        "Not included: your password and other sign-in secrets, notes staff wrote only for staff, and",
        "other people's private work. Your school or program can export the records it keeps about you.",
        "",
        "What's inside",
        "-------------",
    ]
    for path, rows in found.items():
        if rows:
            note = f"  {notes.get(path)}" if notes.get(path) else ""
            lines.append(f"{path}.json: {len(rows)} record{'s' if len(rows) != 1 else ''}.{note}")
    included = sum(1 for item in files if item["included"])
    lines.append(f"files: {included} of {len(files)} uploaded file{'s' if len(files) != 1 else ''}.")
    if included < len(files):
        lines.append("  Files not in the zip (too big, or stored elsewhere) are listed in files.json with their link.")
    return "\n".join(lines) + "\n"


def _file_name(asset: dict, used: set[str]) -> str:
    raw = asset.get("filename") or PurePosixPath(str(asset.get("url") or "")).name or "file"
    base = re.sub(r"[^\w.\- ]+", "_", raw).strip(" .") or "file"
    name, n = base, 1
    while name.lower() in used:
        stem, dot, ext = base.rpartition(".")
        name = f"{stem or base} ({n}){dot}{ext}" if dot else f"{base} ({n})"
        n += 1
    used.add(name.lower())
    return name


def build_zip(db: Session, user: PublicUser) -> tuple[str, tempfile.SpooledTemporaryFile]:
    """The person's export as a zip (in a temporary file, rewound) and the name to download it as."""
    generated = dt.datetime.now(dt.UTC).replace(microsecond=0)
    found = collect(db, user.id)
    out = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)
    files: list[dict] = []
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, rows in found.items():
            if rows:
                archive.writestr(f"{path}.json", json.dumps(rows, indent=2, ensure_ascii=False, default=str))
        used: set[str] = set()
        total = 0
        for asset in found.get("media/files", []):
            entry = {"asset_uuid": asset.get("asset_uuid"), "title": asset.get("title"), "url": asset.get("url"), "included": False, "path": None}
            key = _content_key(str(asset.get("url") or ""), user.user_uuid)
            size = asset.get("size_bytes") or 0
            if key and total + size <= MAX_FILE_BYTES:
                try:
                    body = read_file_content(key)
                except Exception:  # one unreadable file never stops the export
                    logger.exception("data export: could not read %s", key)
                    body = None
                if body is not None and total + len(body) <= MAX_FILE_BYTES:
                    name = f"files/{_file_name(asset, used)}"
                    archive.writestr(name, body)
                    total += len(body)
                    entry.update(included=True, path=name)
            files.append(entry)
        if files:
            archive.writestr("files.json", json.dumps(files, indent=2, ensure_ascii=False))
        archive.writestr("README.txt", _readme(user, found, files, generated.isoformat()))
    out.seek(0)
    handle = re.sub(r"[^\w\-]+", "_", user.username or "me").strip("_") or "me"
    return f"launch-lms-data_{handle}_{generated.date().isoformat()}.zip", out

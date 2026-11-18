"""Splits an Oregon CIS bulk export into one CIS import per learner.

Assumption (Product lead, 2026-11-15): the bulk export is the single-learner "Download my data" workbook with
more learners listed. Of its sheets, Profile (and About this export) hold one row per learner; every other sheet
holds many rows per learner and needs a column that says whose row it is. We look for that column by name
(``LEARNER_COLUMNS``), on Profile first. If there is none, rows are matched on the learner's name (first and
last name, or a name column), which every sheet of the download is assumed to carry too. No sample bulk export
was available before release (Henry, 2026-11-16: ship on the assumption, patch later); a file with neither is
refused with a clear message rather than guessed at.

A single learner's download (one Profile row, no learner column) reads as a bulk export of one, so staff can
use the same preview and send for either.

Nothing here saves anything: ``split`` returns each learner's sheets, ``learner_workbook`` turns them back into
a workbook the learner-side import (portfolio_import_sources.read_cis) reads exactly as a download."""

import hashlib
import io
import re
from datetime import date, datetime

from fastapi import HTTPException

from src.services.portfolio_import_sources import _text, cis_export, read_cis_workbook

# Column names that say which learner a row belongs to, best first. Compared lowercased with spaces squeezed.
LEARNER_COLUMNS = (
    "student id", "student number", "ssid", "state student id", "district student id", "cis id", "user id",
    "username", "user name", "login", "login name", "e-mail", "email", "email address",
)
EMAIL_COLUMNS = ("e-mail", "email", "email address", "e-mail address", "student email", "student e-mail")
FIRST_NAME_COLUMNS = ("first name", "first", "given name", "preferred name")
LAST_NAME_COLUMNS = ("last name", "last", "family name", "surname")
NAME_COLUMNS = ("name", "student name", "full name")
# Sheets with one row per learner in the single-learner download. Every other sheet is split on the learner column.
ROSTER_SHEETS = ("profile", "about this export")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_LEARNERS = 1000


def _norm(column: str) -> str:
    return " ".join(str(column).lower().split())


def _column(rows: list[dict], wanted: tuple[str, ...]) -> str | None:
    """The first column (as written in the sheet) whose name is one of ``wanted``, best match first."""
    names = {_norm(name): name for row in rows for name in row}
    return next((names[want] for want in wanted if want in names), None)


def _value(row: dict, column: str | None) -> str:
    return _text(row.get(column)) if column else ""


def _roster(sheets: dict[str, list[dict]]) -> tuple[str, list[dict]]:
    for wanted in ROSTER_SHEETS:
        for title, rows in sheets.items():
            if title.lower() == wanted and rows:
                return title, rows
    raise HTTPException(status_code=422, detail="This export has no Profile sheet, so we can't tell who the learners are")


def _identity(row: dict) -> dict:
    first, last = _value(row, _column([row], FIRST_NAME_COLUMNS)), _value(row, _column([row], LAST_NAME_COLUMNS))
    name = " ".join(part for part in (first, last) if part) or _value(row, _column([row], NAME_COLUMNS))
    email = _value(row, _column([row], EMAIL_COLUMNS)).lower()
    return {"name": name, "email": email}


def learner_key(value: str) -> str:
    """An opaque key for a learner in this file, so the preview never echoes the school's student id."""
    return "lrn_" + hashlib.sha1(_norm(value).encode()).hexdigest()[:16]


def _name_columns(rows: list[dict]) -> tuple[str, ...]:
    """The columns that together give a learner's name in a sheet: first and last name, or one name column."""
    first, last = _column(rows, FIRST_NAME_COLUMNS), _column(rows, LAST_NAME_COLUMNS)
    if first and last:
        return (first, last)
    name = _column(rows, NAME_COLUMNS)
    return (name,) if name else ()


def _key(row: dict, columns: tuple[str, ...]) -> str:
    """Whose row this is, from its key columns; empty when any of them is blank."""
    parts = [_norm(_value(row, column)) for column in columns]
    return "|".join(parts) if columns and all(parts) else ""


def split(sheets: dict[str, list[dict]]) -> dict:
    """``{learners: [{key, name, email, sheets}], unmatched: {sheet: rows}, column}`` for a CIS export's sheets.

    Rows are matched to learners on a learner column (``LEARNER_COLUMNS``) when the export has one, otherwise on
    the learner's name (first and last name, or a name column) on every sheet. Two learners with the same name
    can't be told apart that way, so neither is listed and their rows count as unmatched."""
    roster_title, roster = _roster(sheets)
    column = _column(roster, LEARNER_COLUMNS)
    by_name = column is None
    roster_columns = (column,) if column else _name_columns(roster)
    if not roster_columns or (by_name and len(roster) == 1):
        if len(roster) == 1:
            # A single learner's download: every row is theirs.
            person = _identity(roster[0])
            return {"learners": [{"key": learner_key(person["email"] or person["name"] or "learner"), **person, "sheets": sheets}], "unmatched": {}, "column": None}
        raise HTTPException(
            status_code=422,
            detail="This export lists several learners but has no column saying whose row is whose (such as Student ID, E-mail or their name)",
        )
    if len(roster) > MAX_LEARNERS:
        raise HTTPException(status_code=413, detail=f"This export has more than {MAX_LEARNERS} learners. Split it and upload each part.")
    learners: dict[str, dict] = {}
    seen: dict[str, int] = {}
    for row in roster:
        value = _key(row, roster_columns)
        if not value:
            continue
        seen[value] = seen.get(value, 0) + 1
        if value not in learners:
            learners[value] = {"key": learner_key(value), **_identity(row), "sheets": {}}
    if by_name:
        # Two learners with the same name: we can't tell whose rows are whose, so neither comes over.
        for value, count in seen.items():
            if count > 1:
                learners.pop(value)
    unmatched: dict[str, int] = {}
    for title, rows in sheets.items():
        if title == roster_title:
            sheet_columns = roster_columns
        elif by_name:
            sheet_columns = _name_columns(rows)
        else:
            found = _column(rows, (_norm(column),)) or _column(rows, LEARNER_COLUMNS)
            sheet_columns = (found,) if found else ()
        for row in rows:
            owner = learners.get(_key(row, sheet_columns))
            if owner is None:
                unmatched[title] = unmatched.get(title, 0) + 1
                continue
            # Without the learner columns the slice is laid out like the learner's own download (the profiler
            # is re-scored from its answer columns in order, so an extra column would shift them).
            kept = row if title == roster_title else {name: value for name, value in row.items() if name not in sheet_columns}
            owner["sheets"].setdefault(title, []).append(kept)
    label = column or " + ".join(roster_columns)
    return {"learners": list(learners.values()), "unmatched": unmatched, "column": label}


def _problem(learner: dict, seen: set[str]) -> str | None:
    email = learner["email"]
    if not email:
        return "No email in the export. Add one to send an invitation."
    if not EMAIL.match(email):
        return "This email doesn't look right. Fix it to send an invitation."
    if email in seen:
        return "Another learner in this file has the same email."
    return None


def preview(content: bytes, filename: str) -> dict:
    """What a CIS export would bring over for each learner in it, without saving anything."""
    sheets, files = read_cis_workbook(content, filename)
    result = split(sheets)
    learners, seen = [], set()
    single = result["column"] is None
    for learner in result["learners"]:
        export = cis_export(learner["sheets"], files if single else {})
        groups: dict[str, int] = {}
        for item in export["items"]:
            groups[item["group"]] = groups.get(item["group"], 0) + 1
        problem = _problem(learner, seen)
        if learner["email"]:
            seen.add(learner["email"])
        learners.append({
            "key": learner["key"], "name": learner["name"], "email": learner["email"], "problem": problem,
            "items": len(export["items"]), "groups": groups, "kept": {sheet: len(rows) for sheet, rows in export["kept"].items()},
        })
    # A bulk zip's other files can't be matched to learners until we've seen a real one, so they're left out.
    skipped_files = 0 if single else len(files)
    return {"kind": "single" if single else "bulk", "learners": learners, "unmatched": result["unmatched"], "skipped_files": skipped_files}


def _cell(value):
    return value if isinstance(value, (int, float, datetime, date)) or value is None else str(value)


def learner_workbook(sheets: dict[str, list[dict]]) -> bytes:
    """One learner's sheets as a workbook the learner-side CIS import reads like their own download."""
    from openpyxl import Workbook

    workbook = Workbook(write_only=True)
    keep = set(LEARNER_COLUMNS + EMAIL_COLUMNS + FIRST_NAME_COLUMNS + LAST_NAME_COLUMNS + NAME_COLUMNS)
    for title, rows in sheets.items():
        if title.lower() == "profile":
            # Profile's demographics are never read, so the held copy doesn't keep them.
            rows = [{column: value for column, value in row.items() if _norm(column) in keep} for row in rows]
        sheet = workbook.create_sheet(title[:31])
        header: list[str] = []
        for row in rows:
            header.extend(column for column in row if column not in header)
        sheet.append(header)
        for row in rows:
            sheet.append([_cell(row.get(column)) for column in header])
    book = io.BytesIO()
    workbook.save(book)
    return book.getvalue()


def learner_exports(content: bytes, filename: str) -> list[dict]:
    """Each learner in a CIS export as ``{key, name, email, content, filename}`` ready to hold for them.

    A single learner's download is held as uploaded (its zip keeps the PEP and saved files); a bulk export's
    learners are each held as a workbook of just their rows."""
    sheets, _files = read_cis_workbook(content, filename)
    result = split(sheets)
    if result["column"] is None:
        learner = result["learners"][0]
        return [{"key": learner["key"], "name": learner["name"], "email": learner["email"], "content": content, "filename": filename}]
    return [
        {"key": learner["key"], "name": learner["name"], "email": learner["email"], "content": learner_workbook(learner["sheets"]), "filename": "Oregon CIS data.xlsx"}
        for learner in result["learners"]
    ]

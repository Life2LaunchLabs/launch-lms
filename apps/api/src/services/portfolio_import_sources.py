"""Reads exports from other apps into items a learner can pick from before anything is added.

Oregon CIS: the "Download my data" zip (the workbook, the PEP PDF and saved files) or the workbook on its own.
LinkedIn: the "Get a copy of your data" zip of CSV files.

Each item is ``{key, group, kind, title, detail, record}``. ``key`` comes from the row's content, so the same
row in a newer export gets the same key and is not added twice."""

import csv
import hashlib
import io
import re
import zipfile
from datetime import date, datetime, timedelta

from fastapi import HTTPException

MAX_UPLOAD = 25 * 1024 * 1024
MAX_UNPACKED = 80 * 1024 * 1024
MAX_MEMBERS = 500
DOCUMENT_EXTENSIONS = {".pdf": "document", ".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image"}

# Sheets the portfolio reads. Every other sheet belongs to plans and is kept as raw rows; Profile is neither,
# because it holds demographics we don't take.
CIS_PORTFOLIO_SHEETS = {"about this export", "profile", "links"}
HOLLAND = {"R": "Realistic", "I": "Investigative", "A": "Artistic", "S": "Social", "E": "Enterprising", "C": "Conventional"}
LIKERT = {"strongly like": 4, "like": 3, "unsure": 2, "dislike": 1, "strongly dislike": 0}


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\s+", " ", str(value)).strip()


def _key(prefix: str, *parts) -> str:
    return f"{prefix}:{hashlib.sha1('|'.join(_text(part).lower() for part in parts).encode()).hexdigest()[:12]}"


MONTHS = ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y-%m", "%b %Y", "%B %Y", "%m/%Y")


def _month(value) -> tuple[str | None, str]:
    """A date from either export as (YYYY-MM, precision). CIS sometimes writes raw Excel serial numbers."""
    if value is None or value == "":
        return None, "month"
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m"), "month"
    if isinstance(value, (int, float)) and 20000 < value < 80000:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).strftime("%Y-%m"), "month"
    text = _text(value)
    if re.fullmatch(r"\d{5}(\.\d+)?", text):
        return _month(float(text))
    if re.fullmatch(r"(19|20)\d{2}", text):
        return f"{text}-01", "year"
    for pattern in MONTHS:
        try:
            return datetime.strptime(text, pattern).strftime("%Y-%m"), "month"
        except ValueError:
            continue
    return None, "month"


def _present(value) -> bool:
    return _text(value).lower() in {"present", "current", "now", "ongoing"}


def _span(start, end) -> dict:
    start_date, precision = _month(start)
    current = _present(end)
    end_date = None if current else _month(end)[0]
    if start_date and end_date and end_date < start_date:
        end_date = None
    return {"start_date": start_date, "end_date": end_date, "start_precision": precision, "is_current": current and bool(start_date)}


def _when(span: dict) -> str:
    start, end = span.get("start_date") or "", span.get("end_date") or ""
    return f"{start} – {'now' if span.get('is_current') else end}".strip(" –") if start else end


def _join(*parts, sep=", ") -> str:
    return sep.join(part for part in (_text(item) for item in parts) if part)


def _timeline(key, group, entry_type, title, organization="", location="", summary="", span=None, details=None) -> dict:
    span = span or {}
    record = {"entry_type": entry_type, "title": _text(title)[:200], "organization": _text(organization)[:200], "location_label": location, "summary": summary.strip(), "details": details or {}, **span}
    return {"key": key, "group": group, "kind": "timeline", "title": record["title"], "detail": _join(organization, _when(span), sep=" · "), "record": record}


def _item(key, group, kind, title, detail, record) -> dict:
    return {"key": key, "group": group, "kind": kind, "title": _text(title)[:200], "detail": detail, "record": record}


def _check_zip(archive: zipfile.ZipFile) -> None:
    members = archive.infolist()
    if len(members) > MAX_MEMBERS or sum(member.file_size for member in members) > MAX_UNPACKED:
        raise HTTPException(status_code=413, detail="This export is too big to bring in")


# ---------------------------------------------------------------- Oregon CIS

def _sheets(content: bytes) -> dict[str, list[dict]]:
    from openpyxl import load_workbook

    try:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as error:  # openpyxl raises many kinds for a file that isn't a workbook
        raise HTTPException(status_code=422, detail="This doesn't look like an Oregon CIS export") from error
    sheets: dict[str, list[dict]] = {}
    for sheet in workbook.worksheets:
        rows = [list(row) for row in sheet.iter_rows(values_only=True)]
        if not rows:
            continue
        header = [_text(cell) for cell in rows[0]]
        sheets[sheet.title] = [{name: value for name, value in zip(header, row) if name and value not in (None, "")} for row in rows[1:] if any(cell not in (None, "") for cell in row)]
    workbook.close()
    return sheets


def _sheet(sheets: dict, name: str) -> list[dict]:
    return next((rows for title, rows in sheets.items() if title.lower() == name.lower()), [])


def _profiler_scores(answers: dict) -> dict:
    """Re-scores the Interest Profiler Short Form from its 60 answers: they come in pairs of R, I, A, S, E, C."""
    scores = dict.fromkeys(HOLLAND, 0)
    for index, answer in enumerate(answers.values()):
        scores["RIASEC"[(index // 2) % 6]] += LIKERT.get(_text(answer).lower(), 0)
    return scores


def _scores_text(text: str) -> dict:
    found = {letter: int(match.group(1)) for letter, name in HOLLAND.items() if (match := re.search(rf"{name}\D{{0,3}}(\d+)", text, re.I))}
    return found if len(found) == 6 else {}


def _interest_result(key: str, name: str, scores: dict, taken) -> dict:
    ordered = sorted(scores, key=lambda letter: -scores[letter])
    top = ordered[:3]
    # A tie for third place is shown as one, since the profiler doesn't say which comes first.
    tied = [letter for letter in ordered[3:] if scores[letter] == scores[top[2]]]
    summary = " · ".join([HOLLAND[top[0]], HOLLAND[top[1]], " / ".join(HOLLAND[letter] for letter in [top[2], *tied])])
    code = "".join(top[:2]) + "/".join([top[2], *tied])
    record = {"kind": "interests", "name": name, "summary": summary, "data": {"scores": scores, "code": code}, "taken_on": _month(taken)[0]}
    return _item(key, "results", "result", name, f"{code}: {summary}", record)


def _cis_results(sheets: dict) -> list[dict]:
    items = []
    short_form = {_text(row.get("Set #")): row for row in _sheet(sheets, "Interest Profiler Short Form")}
    for row in _sheet(sheets, "Assessments"):
        name, number = _text(row.get("Assessment")), _text(row.get("Set #"))
        answers = short_form.get(number) if name.lower() == "interest profiler short form" else None
        if answers:
            scores = _profiler_scores({column: value for column, value in answers.items() if column not in ("Set #", "Date saved")})
        else:
            scores = _scores_text(_text(row.get("Scores")))
        if scores:
            items.append(_interest_result(_key("cis-result", name, number, row.get("Date saved")), f"{name} (Oregon CIS)", scores, row.get("Date saved")))
    return items


def _cis_bio(sheets: dict) -> list[dict]:
    items = []
    for row in _sheet(sheets, "Career Bio - Education"):
        school = row.get("School")
        span = _span(row.get("Start"), row.get("End"))
        summary = "\n".join(filter(None, [_join(row.get("Major")), _text(row.get("Activities")) and f"Activities: {_text(row.get('Activities'))}", _text(row.get("Courses")) and f"Courses: {_text(row.get('Courses'))}"]))
        items.append(_timeline(_key("cis-edu", school, row.get("Start")), "experience", "education", row.get("Degree") or row.get("Major") or "Student", school, _join(row.get("City"), row.get("State")), summary, span, {"gpa": _text(row.get("GPA"))} if row.get("GPA") else None))
    for row in _sheet(sheets, "Career Bio - Work & Volunteer"):
        volunteer = _text(row.get("Type")).lower().startswith("volunteer")
        employer = row.get("Employer or organization")
        summary = "\n".join(filter(None, [_text(row.get("Duties")), _text(row.get("Highlights")) or _text(row.get("Accomplishments"))]))
        hours = _join(_text(row.get("Hours per week")) and f"{_text(row.get('Hours per week'))} hours a week", _text(row.get("Total hours")) and f"{_text(row.get('Total hours'))} hours in all")
        items.append(_timeline(_key("cis-work", employer, row.get("Title"), row.get("Start")), "experience", "leadership_service" if volunteer else "work_career", row.get("Title") or ("Volunteer" if volunteer else "Job"), employer, _join(row.get("City"), row.get("State")), summary, _span(row.get("Start"), row.get("End")), {"hours": hours} if hours else None))
    for row in _sheet(sheets, "Career Bio - Activities"):
        achievement = _text(row.get("Type")).lower().startswith("achiev")
        # CIS puts an activity's organization under "Contact role" when there's no contact.
        organization = row.get("From") or (row.get("Contact role") if not row.get("Contact name") else "")
        title = row.get("Category") if achievement else _join(row.get("Title"), row.get("Category") if not row.get("Title") else "")
        items.append(_timeline(_key("cis-act", row.get("Type"), row.get("Category"), row.get("Title"), row.get("Start")), "experience", "awards_recognition" if achievement else "teams_activities", title or "Activity", organization, "", _text(row.get("Description")), _span(row.get("Start"), row.get("End"))))
    for row in _sheet(sheets, "Career Bio - Skills & Certs"):
        # CIS writes the skill's name under "Category" and leaves "Name" empty.
        name = _text(row.get("Name")) or _text(row.get("Category"))
        if not name:
            continue
        if row.get("Expires") or re.search(r"certif|licen[cs]e|card|permit", name, re.I):
            record = {"kind": "card" if re.search(r"card|permit", name, re.I) else "certificate", "name": name, "expires_on": _month(row.get("Expires"))[0]}
            items.append(_item(_key("cis-cert", name), "credentials", "credential", name, "Certificate", record))
        else:
            items.append(_item(_key("cis-skill", name), "results", "result", name, "Skill", {"kind": "skills", "name": name, "summary": name, "data": {"description": _text(row.get("Description"))}}))
    for row in _sheet(sheets, "Career Bio - Test Scores"):
        test = _text(row.get("Test"))
        if test:
            record = {"kind": "test_score", "name": test, "issuer": _text(row.get("Location")), "score": _text(row.get("Results"))[:120], "issued_on": _month(row.get("Date"))[0], "visibility": "private"}
            items.append(_item(_key("cis-test", test, row.get("Date")), "credentials", "credential", test, "Test score · only you see it", record))
    for row in _sheet(sheets, "Career Bio - References"):
        name = _text(row.get("Name"))
        if name:
            role = _join(row.get("Title"), row.get("Employer")) or _text(row.get("Relationship"))
            record = {"name": name, "role_label": role, "email": _text(row.get("E-mail")), "phone": _text(row.get("Work phone")) or _text(row.get("Home phone")), "note": _text(row.get("Relationship")), "is_reference": True}
            items.append(_item(_key("cis-ref", name, row.get("E-mail")), "people", "contact", name, f"Reference · {role}" if role else "Reference", record))
    return items


def _cis_kept(sheets: dict) -> dict:
    def plain(value):
        return value.isoformat() if isinstance(value, (datetime, date)) else value

    return {title: [{column: plain(value) for column, value in row.items()} for row in rows] for title, rows in sheets.items() if rows and title.lower() not in CIS_PORTFOLIO_SHEETS and not title.lower().startswith("career bio")}


def _links(rows: list[dict], prefix: str, name_column: str, url_column: str) -> list[dict]:
    items = []
    for row in rows:
        url = _text(row.get(url_column))
        if re.match(r"https?://", url):
            label = _text(row.get(name_column)) or url
            items.append(_item(_key(prefix, url), "links", "link", label, url, {"label": label[:120], "url": url}))
    return items


def read_cis(content: bytes, filename: str) -> dict:
    files: dict[str, bytes] = {}
    if zipfile.is_zipfile(io.BytesIO(content)) and not filename.lower().endswith(".xlsx"):
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            _check_zip(archive)
            names = [info.filename for info in archive.infolist() if not info.is_dir()]
            workbook = next((name for name in names if name.lower().endswith(".xlsx")), None)
            if not workbook:
                raise HTTPException(status_code=422, detail="This zip doesn't have an Oregon CIS workbook in it")
            sheets = _sheets(archive.read(workbook))
            files = {name: archive.read(name) for name in names if name != workbook}
    else:
        sheets = _sheets(content)
    if not any(title.lower().startswith(("career bio", "assessments", "profile")) for title in sheets):
        raise HTTPException(status_code=422, detail="This doesn't look like an Oregon CIS export")
    items = _cis_bio(sheets) + _cis_results(sheets) + _links(_sheet(sheets, "Links"), "cis-link", "Name", "Web address")
    skipped = []
    for name, data in files.items():
        base = name.rsplit("/", 1)[-1]
        extension = "." + base.rsplit(".", 1)[-1].lower() if "." in base else ""
        if not base or base.startswith("."):
            continue
        if extension not in DOCUMENT_EXTENSIONS:
            skipped.append(base)
            continue
        pep = base.lower().startswith("pep")
        title = "Oregon CIS Education Plan and Profile" if pep else base.rsplit(".", 1)[0]
        items.append(_item(_key("cis-file", base, len(data)), "documents", "document", title, "PDF · only you see it" if extension == ".pdf" else "Picture · only you see it", {"member": name, "filename": base, "media_type": DOCUMENT_EXTENSIONS[extension], "kind": "archive" if pep else "upload"}))
    return {"source": "cis", "items": items, "kept": _cis_kept(sheets), "skipped": skipped, "files": files}


# ---------------------------------------------------------------- LinkedIn

def _csv(archive: zipfile.ZipFile, wanted: str) -> list[dict]:
    name = next((info.filename for info in archive.infolist() if info.filename.rsplit("/", 1)[-1].lower() == wanted.lower()), None)
    if not name:
        return []
    lines = archive.read(name).decode("utf-8-sig", errors="replace").splitlines()
    # Some LinkedIn files start with a few lines of notes before the header.
    start = next((index for index, line in enumerate(lines) if line.count(",") >= 1 and not line.lower().startswith("notes")), 0)
    return [{_text(column): value for column, value in row.items() if column} for row in csv.DictReader(lines[start:])]


def read_linkedin(content: bytes) -> dict:
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=422, detail="Upload the zip LinkedIn sends you")
    items: list[dict] = []
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        _check_zip(archive)
        for row in _csv(archive, "Positions.csv"):
            company = row.get("Company Name")
            items.append(_timeline(_key("li-job", company, row.get("Title"), row.get("Started On")), "experience", "work_career", row.get("Title") or "Job", company, _text(row.get("Location")), _text(row.get("Description")), _span(row.get("Started On"), row.get("Finished On") or ("Present" if row.get("Started On") else ""))))
        for row in _csv(archive, "Education.csv"):
            school = row.get("School Name")
            summary = "\n".join(filter(None, [_text(row.get("Notes")), _text(row.get("Activities")) and f"Activities: {_text(row.get('Activities'))}"]))
            items.append(_timeline(_key("li-edu", school, row.get("Start Date")), "experience", "education", row.get("Degree Name") or "Student", school, "", summary, _span(row.get("Start Date"), row.get("End Date"))))
        for row in _csv(archive, "Volunteering.csv"):
            company = row.get("Company Name")
            items.append(_timeline(_key("li-vol", company, row.get("Role"), row.get("Started On")), "experience", "leadership_service", row.get("Role") or "Volunteer", company, "", _text(row.get("Description")), _span(row.get("Started On"), row.get("Finished On"))))
        for row in _csv(archive, "Honors.csv"):
            items.append(_timeline(_key("li-honor", row.get("Title"), row.get("Issued On")), "experience", "awards_recognition", row.get("Title") or "Award", "", "", _text(row.get("Description")), _span(row.get("Issued On"), None)))
        for row in _csv(archive, "Projects.csv"):
            title = _text(row.get("Title"))
            if title:
                span = _span(row.get("Started On"), row.get("Finished On"))
                record = {"title": title, "summary": _text(row.get("Description")), "start_date": span["start_date"], "end_date": span["end_date"]}
                items.append(_item(_key("li-project", title), "projects", "project", title, _when(span), record))
        for row in _csv(archive, "Certifications.csv"):
            name = _text(row.get("Name"))
            if name:
                record = {"kind": "certificate", "name": name, "issuer": _text(row.get("Authority")), "issued_on": _month(row.get("Started On"))[0], "expires_on": _month(row.get("Finished On"))[0]}
                items.append(_item(_key("li-cert", name, row.get("Authority")), "credentials", "credential", name, _join(row.get("Authority"), "Certificate", sep=" · "), record))
        for row in _csv(archive, "Skills.csv"):
            name = _text(row.get("Name"))
            if name:
                items.append(_item(_key("li-skill", name), "results", "result", name, "Skill", {"kind": "skills", "name": name, "summary": name, "data": {}}))
        for row in _csv(archive, "Recommendations_Received.csv"):
            name, text = _join(row.get("First Name"), row.get("Last Name"), sep=" "), _text(row.get("Text"))
            if name and text and _text(row.get("Status")).upper() in ("", "VISIBLE"):
                record = {"name": name, "role_label": _join(row.get("Job Title"), row.get("Company")), "quote": text}
                items.append(_item(_key("li-rec", name, text[:80]), "people", "contact", name, "Recommendation", record))
    if not items:
        raise HTTPException(status_code=422, detail="We couldn't find anything to bring in from this LinkedIn export")
    return {"source": "linkedin", "items": items, "kept": {}, "skipped": [], "files": {}}


def read_export(source: str, content: bytes, filename: str) -> dict:
    if len(content) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="This export is too big to bring in")
    if source == "cis":
        return read_cis(content, filename)
    if source == "linkedin":
        return read_linkedin(content)
    raise HTTPException(status_code=422, detail="Unknown kind of import")

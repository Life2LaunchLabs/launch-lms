"""Reads a résumé PDF, or the profile PDF LinkedIn makes ("Save to PDF"), into items to pick from.

There's no AI here: it finds the usual section headings, then entries by their date ranges. It gets odd layouts
wrong, so everything goes through the learner's pick list, and the PDF itself is kept as a private document."""

import io
import re

from fastapi import HTTPException

from src.services.portfolio_import_sources import _item, _join, _key, _span, _text, _timeline

SECTIONS = {
    "summary": ("summary", "profile", "about", "about me", "objective", "career objective"),
    "experience": ("experience", "work experience", "employment", "employment history", "work history", "jobs", "professional experience"),
    "volunteer": ("volunteer", "volunteering", "volunteer experience", "community service", "service", "leadership", "leadership & service", "leadership and service"),
    "activities": ("activities", "extracurricular activities", "extracurriculars", "clubs", "sports", "teams"),
    "education": ("education", "schools", "academic background"),
    "awards": ("awards", "honors", "honors & awards", "honors-awards", "awards & honors", "achievements", "recognition"),
    "certifications": ("certifications", "certificates", "licenses", "licenses & certifications", "certifications & licenses", "credentials"),
    "skills": ("skills", "top skills", "core skills", "technical skills", "key skills", "abilities"),
    "languages": ("languages",),
    "projects": ("projects", "portfolio projects"),
    "references": ("references",),
    "contact": ("contact", "contact information"),
}
HEADINGS = {name: section for section, names in SECTIONS.items() for name in names}
TIMELINE_SECTIONS = {"experience": "work_career", "volunteer": "leadership_service", "activities": "teams_activities", "education": "education", "awards": "awards_recognition"}
MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
DATE = rf"(?:{MONTH}\s+\d{{4}}|\d{{1,2}}/\d{{4}}|(?:spring|summer|fall|autumn|winter)\s+\d{{4}}|\d{{4}})"
RANGE = re.compile(rf"({DATE})\s*(?:-|–|—|to)\s*({DATE}|present|current|now)|({DATE})", re.I)
BULLET = re.compile(r"^\s*(?:[•●▪◦·\-–*]|\d+\.)\s+")
DEGREE = re.compile(r"diploma|degree|bachelor|associate|master|\bb\.?[as]\.?\b|\ba\.?a\.?s?\b|certificate|\bged\b", re.I)
SCHOOL = re.compile(r"school|academy|college|university|institute", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")
NOISE = re.compile(r"^page \d+ of \d+$", re.I)


def _lines(content: bytes) -> list[str]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:10])
    except Exception as error:  # pypdf raises many kinds for a broken file
        raise HTTPException(status_code=422, detail="We couldn't read this PDF") from error
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return [line for line in lines if line and not NOISE.match(line)]


def _heading(line: str) -> str | None:
    return HEADINGS.get(re.sub(r"[:\s]+$", "", line).strip().lower())


def _sections(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current = "top"
    for line in lines:
        section = _heading(line) if len(line) < 40 else None
        if section:
            current = section
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)
    return sections


def _clean_date(value: str | None) -> str | None:
    if not value:
        return value
    value = re.sub(r"(?i)\bsept\b", "Sep", value.replace(".", ""))
    season = re.match(r"(?i)(spring|summer|fall|autumn|winter)\s+(\d{4})", value)
    if season:
        return f"{season.group(2)}-{ {'spring': '03', 'summer': '06', 'fall': '09', 'autumn': '09', 'winter': '12'}[season.group(1).lower()] }"
    match = re.match(r"(?i)([a-z]+)\s+(\d{4})", value)
    return f"{match.group(1)[:3].title()} {match.group(2)}" if match else value


def _entries(lines: list[str]) -> list[dict]:
    """Splits a section into entries at each date range: the one or two short lines before it are the heading,
    and what follows until the next heading is the description."""
    marks = [index for index, line in enumerate(lines) if RANGE.search(line) and not BULLET.match(line) and len(line) < 120]
    entries = []
    for number, index in enumerate(marks):
        floor = marks[number - 1] + 1 if number else 0
        line = lines[index]
        match = RANGE.search(line)
        rest = _text((line[: match.start()] + " " + line[match.end():]).strip(" ,|·-–—()"))
        rest = re.sub(r"\(\s*\d+ (years?|months?).*\)$", "", rest).strip()
        head: list[str] = [rest] if rest and not re.fullmatch(r"\(?\d+ (years?|months?).*", rest) else []
        cursor = index - 1
        while cursor >= floor and len(head) < 2 and not BULLET.match(lines[cursor]) and len(lines[cursor]) < 80:
            head.insert(0, lines[cursor])
            cursor -= 1
        if number:
            entries[-1]["body"] = entries[-1]["body"][: max(0, cursor + 1 - entries[-1]["start"])]
        start, end = (match.group(1), match.group(2)) if match.group(1) else (match.group(3), None)
        entries.append({"head": head, "start_date": _clean_date(start), "end_date": _clean_date(end), "single": not match.group(1), "start": index + 1, "body": lines[index + 1:]})
    return entries


def _school(line: str) -> bool:
    return bool(SCHOOL.search(line or "")) and not DEGREE.search(line or "")


def _split_head(head: list[str], linkedin: bool) -> tuple[str, str]:
    if len(head) >= 2:
        # LinkedIn puts the company first; most résumés put the role first.
        return (head[1], head[0]) if linkedin else (head[0], head[1])
    if not head:
        return "", ""
    parts = re.split(r"\s+(?:at|@)\s+|\s*[|,–—]\s+|\s+-\s+", head[0], maxsplit=1)
    return (parts[0], parts[1]) if len(parts) == 2 else (head[0], "")


def _timeline_items(section: str, lines: list[str], source: str, linkedin: bool) -> list[dict]:
    items = []
    for entry in _entries(lines):
        title, organization = _split_head(entry["head"], linkedin)
        body, location = entry["body"], ""
        if linkedin and body and len(body[0]) < 50 and "," in body[0] and not BULLET.match(body[0]):
            location, body = body[0], body[1:]
        summary = "\n".join(BULLET.sub("", line) for line in body)[:2000]
        if section == "education":
            school, degree = (title, organization) if _school(title) or DEGREE.search(organization) and not _school(organization) else (organization, title)
            title, organization = degree or "Student", school
        if section == "awards" and not title:
            title = organization or "Award"
        if not title:
            continue
        end = entry["end_date"] or ("" if entry["single"] else "Present")
        span = _span(entry["start_date"], end if not entry["single"] else None)
        if entry["single"] and section in ("experience", "volunteer", "activities"):
            span = _span(entry["start_date"], entry["start_date"])
        items.append(_timeline(_key(f"{source}-{section}", title, organization, entry["start_date"]), "experience", TIMELINE_SECTIONS[section], title, organization, location, summary, span))
    return items


def _list_items(lines: list[str]) -> list[str]:
    values = []
    for line in lines:
        for part in re.split(r"\s*[,;•●·|]\s*", BULLET.sub("", line)):
            part = part.strip(" .")
            if 1 < len(part) <= 40 and part not in values:
                values.append(part)
    return values[:30]


def _references(lines: list[str], source: str) -> list[dict]:
    items = []
    for index, line in enumerate(lines):
        email = EMAIL.search(line)
        if not email:
            continue
        around = [candidate for candidate in lines[max(0, index - 3): index] if not EMAIL.search(candidate) and not PHONE.search(candidate) and "available" not in candidate.lower()]
        if not around:
            continue
        name, role = around[0], _join(*around[1:])
        phone = next((found.group(0) for candidate in lines[max(0, index - 3): index + 2] if (found := PHONE.search(candidate))), "")
        record = {"name": name[:160], "role_label": role[:200], "email": email.group(0), "phone": phone, "note": "", "is_reference": True}
        items.append(_item(_key(f"{source}-ref", name, email.group(0)), "people", "contact", name, f"Reference · {role}" if role else "Reference", record))
    return items


def read_pdf(content: bytes, filename: str, source: str) -> dict:
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=422, detail="Upload a PDF")
    lines = _lines(content)
    if not lines:
        raise HTTPException(status_code=422, detail="This PDF has no text we can read. A scanned page won't work; try the original file.")
    sections = _sections(lines)
    linkedin = source == "linkedin" or ("top skills" in (line.lower() for line in lines[:40]) and "experience" in sections)
    items: list[dict] = []
    for section in ("experience", "volunteer", "activities", "education", "awards"):
        items += _timeline_items(section, sections.get(section, []), source, linkedin)
    for line in sections.get("certifications", []):
        name = BULLET.sub("", line).strip()
        if 2 < len(name) <= 120 and not RANGE.fullmatch(name):
            items.append(_item(_key(f"{source}-cert", name), "credentials", "credential", name, "Certificate", {"kind": "card" if re.search(r"card|permit", name, re.I) else "certificate", "name": name}))
    for skill in _list_items(sections.get("skills", [])):
        items.append(_item(_key(f"{source}-skill", skill), "results", "result", skill, "Skill", {"kind": "skills", "name": skill, "summary": skill, "data": {}}))
    items += _references(sections.get("references", []), source)
    title = "LinkedIn profile" if linkedin else f"Résumé ({filename.rsplit('.', 1)[0][:80]})"
    items.append(_item(_key(f"{source}-file", title), "documents", "document", title, "PDF · only you see it", {"member": "__upload__", "filename": filename if filename.lower().endswith(".pdf") else "resume.pdf", "media_type": "document", "kind": "resume"}))
    return {"source": source, "items": items, "kept": {}, "skipped": [], "files": {"__upload__": content}}

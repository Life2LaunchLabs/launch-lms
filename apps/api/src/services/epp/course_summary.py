"""SB 3 course evidence summary: for a course's learners, what each standard has as evidence and who
reviewed it, as a PDF with a class grid first and then one page per learner.

It reads the same rows, scope and permissions as the requirement evidence CSV
(`goals.requirement_evidence.evidence_rows`), so a teacher sees only the plans they can review. It reports
what was recorded and never decides credit: "Credit recorded by school" comes only from a staff-confirmed
completed course on the learner's EPP course plan, read through an active school support link.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import inspect
from sqlmodel import Session, col, select

from src.db.epp_courses import EppCourse
from src.db.requirement_exports import RequirementEvidenceExport
from src.db.users import PublicUser, User
from src.services.epp.pdf import INK, LINE, MUTED, _date, _num, _safe, _styles, _table
from src.services.goals import requirement_evidence
from src.services.portfolio_identity import shown_name
from src.services.school import support

REVIEWED = {"Staff-approved step", "Staff attestation"}
STATES = ("reviewed", "waiting", "changes", "recorded", "none")
MARK = {"reviewed": "✓", "waiting": "W", "changes": "C", "recorded": "•", "none": ""}
GRID_COLUMNS = 18
MAX_CODE = 6


def _initial(name: str) -> str:
    words = (name or "").split()
    return f"{words[0][0]}. {' '.join(words[1:])}" if len(words) > 1 else name


def _standard(rows: list[dict]) -> dict:
    """Where one standard stands for one learner, from its evidence rows."""
    reviewed = [row for row in rows if row.get("Evidence assessment") in REVIEWED]
    started = [row for row in rows if row.get("Step") and row.get("Step status") not in (None, "", "not_started")] + reviewed
    titles = list(dict.fromkeys(str(row["Step"]) for row in started if row.get("Step")))
    assessments = {row.get("Evidence assessment") for row in rows}
    state = ("reviewed" if reviewed else "waiting" if "Awaiting staff review" in assessments else "changes" if "Changes requested" in assessments
             else "recorded" if started else "none")
    first = reviewed[0] if reviewed else None
    return {"state": state, "evidence": titles, "reviewer": _initial(str(first.get("Completion recorded by") or "")) if first else "",
            "date": str(first.get("Completion recorded at (UTC)") or "") if first else ""}


def _short_codes(codes: list[str]) -> dict[str, str]:
    """HS.HECPS.A.1 → A.1 when every code shares the prefix."""
    parts = [code.split(".") for code in codes if code]
    common = 0
    while parts and all(len(item) > common + 1 for item in parts) and len({tuple(item[: common + 1]) for item in parts}) == 1:
        common += 1
    return {".".join(item): ".".join(item[common:]) for item in parts}


def _credit(db: Session, actor: PublicUser, org_id: int, user_id: int, request: RequirementEvidenceExport) -> str:
    bind = db.get_bind()
    if bind is None or not all(inspect(bind).has_table(name) for name in ("learnersupport", "eppcourse")) or not support.is_supported(db, org_id, actor.id, user_id):
        return "Not on a school record here"
    query = select(EppCourse).where(EppCourse.org_id == org_id, EppCourse.user_id == user_id, EppCourse.status == "completed", col(EppCourse.confirmed_at).is_not(None))
    for course in db.exec(query).all():
        same_code = request.course_code and course.course_code and course.course_code.strip().lower() == request.course_code.strip().lower()
        same_title = request.course_name and course.title.strip().lower() == request.course_name.strip().lower()
        if same_code or same_title:
            by = db.get(User, course.confirmed_by_user_id) if course.confirmed_by_user_id else None
            return f"Yes, {_num(course.credits)} credit, confirmed {_date(course.confirmed_at)}" + (f" by {shown_name(by)}" if by else "")
    return "Not yet"


def summarize(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> dict:
    rows = requirement_evidence.evidence_rows(db, actor, org_id, request)
    learners: dict[int, dict] = {}
    for row in rows:
        learner = learners.setdefault(int(row["Learner ID"]), {"user_id": int(row["Learner ID"]), "name": row["Learner name"], "frameworks": {}})
        key = row.get("Requirement code") or row.get("Requirement title")
        if not key or not row.get("Framework UUID"):
            continue
        framework = learner["frameworks"].setdefault(row["Framework UUID"], {"name": row.get("Framework") or "", "standards": {}})
        standard = framework["standards"].setdefault(key, {"code": row.get("Requirement code") or "", "title": row.get("Requirement title") or "", "rows": []})
        standard["rows"].append(row)
    for learner in learners.values():
        for framework in learner["frameworks"].values():
            codes = _short_codes([item["code"] for item in framework["standards"].values()])
            # Short codes (A.1) label the columns; long ones (INTERESTS.STRENGTHS) are numbered, with the code kept under the title.
            numbered = any(len(codes.get(item["code"], item["code"]) or "") > MAX_CODE for item in framework["standards"].values())
            framework["standards"] = [{"code": str(index) if numbered or not item["code"] else codes.get(item["code"], item["code"]),
                                       "full_code": item["code"] if numbered else "", "title": item["title"], **_standard(item["rows"])}
                                      for index, item in enumerate(framework["standards"].values(), 1)]
        learner["credit"] = _credit(db, actor, org_id, learner["user_id"], request)
    return {"learners": sorted(learners.values(), key=lambda item: str(item["name"]).lower()), "teacher": shown_name(db.get(User, actor.id)),
            "date": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------- the PDF

def _course_line(request: RequirementEvidenceExport, teacher: str) -> str:
    parts = [request.course_name, f"Course code {request.course_code}" if request.course_code else "", request.section, request.term, teacher]
    return " · ".join(part for part in parts if part)


def _grid(summary: dict, styles: dict) -> list:
    frameworks: dict[str, list[str]] = {}
    keys: dict[str, dict[str, str]] = {}
    for learner in summary["learners"]:
        for framework in learner["frameworks"].values():
            known = frameworks.setdefault(framework["name"], [])
            known += [item["code"] for item in framework["standards"] if item["code"] not in known]
            for item in framework["standards"]:
                if item["full_code"]:
                    keys.setdefault(framework["name"], {}).setdefault(item["code"], item["title"])
    parts = []
    for name, codes in frameworks.items():
        for start in range(0, len(codes), GRID_COLUMNS):
            chunk = codes[start:start + GRID_COLUMNS]
            cells = [[Paragraph("Learner", styles["muted"]), *[Paragraph(_safe(code), styles["muted"]) for code in chunk], Paragraph("Reviewed", styles["muted"])]]
            for learner in summary["learners"]:
                standards = {item["code"]: item for framework in learner["frameworks"].values() if framework["name"] == name for item in framework["standards"]}
                done = sum(1 for item in standards.values() if item["state"] == "reviewed")
                cells.append([Paragraph(f"<b>{_safe(learner['name'])}</b>", styles["body"]),
                              *[Paragraph(_safe(MARK[standards[code]["state"]] if code in standards else "–"), styles["body"]) for code in chunk],
                              Paragraph(_safe(f"{done} of {len(standards)}"), styles["body"])])
            width = (7 * inch - 1.7 * inch - 0.7 * inch) / max(len(chunk), 1)
            table = Table(cells, colWidths=[1.7 * inch] + [width] * len(chunk) + [0.7 * inch], repeatRows=1)
            table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                                       ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE)]))
            parts += [Paragraph(_safe(name + (f" (standards {start + 1} to {start + len(chunk)})" if len(codes) > GRID_COLUMNS else "")), styles["h3"]), table, Spacer(1, 8)]
        if keys.get(name):
            parts.append(Paragraph(_safe(" · ".join(f"{code} {title}" for code, title in keys[name].items())), styles["muted"]))
            parts.append(Spacer(1, 8))
    return parts + [Paragraph(_safe("✓ reviewed evidence · W submitted, waiting for review · C changes requested · • done, no review needed or recorded · blank: no evidence yet · – not in their plan"), styles["muted"])]


def _learner_page(learner: dict, request: RequirementEvidenceExport, summary: dict, styles: dict) -> list:
    parts = [Paragraph("SB 3 course evidence summary · Teacher of record", styles["kicker"]),
             Paragraph(_safe(learner["name"] + (f" · {request.course_name}" if request.course_name else "")), styles["h2"]),
             Paragraph(_safe(_course_line(request, summary["teacher"])), styles["muted"]), Spacer(1, 8)]
    if not learner["frameworks"]:
        return parts + [Paragraph("No requirement framework is attached to this learner's plans in this course.", styles["body"])]
    for framework in learner["frameworks"].values():
        standards = framework["standards"]
        count = {state: sum(1 for item in standards if item["state"] == state) for state in STATES}
        tiles = Table([[Paragraph(f"<b>{count['reviewed']} of {len(standards)}</b>", styles["h3"]), Paragraph(f"<b>{count['waiting']}</b>", styles["h3"]), Paragraph(f"<b>{count['none']}</b>", styles["h3"])],
                       [Paragraph("Standards with reviewed evidence", styles["muted"]), Paragraph("Submitted, waiting for your review", styles["muted"]), Paragraph("No evidence yet", styles["muted"])]],
                      colWidths=[2.33 * inch] * 3)
        tiles.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        rows = [[item["code"], Paragraph(_safe(item["title"]) + (f'<br/><font size="7.5" color="#505A6B">{_safe(item["full_code"])}</font>' if item["full_code"] else ""), styles["body"]),
                 ", ".join(item["evidence"]) or "None yet",
                 f"{item['reviewer']}, {_date(item['date'])}" if item["state"] == "reviewed" else {"waiting": "Waiting", "changes": "Changes requested", "recorded": "Done, not reviewed"}.get(item["state"], "")]
                for item in standards]
        parts += [Paragraph(_safe(framework["name"]), styles["h3"]), tiles, Spacer(1, 6),
                  _table(rows, ["Standard", "What it covers", "Evidence from this course", "Reviewed"], styles, [0.7 * inch, 2.3 * inch, 2.3 * inch, 1.7 * inch])]
    parts += [Spacer(1, 10), KeepTogether([Paragraph(f"<b>Credit recorded by school:</b> {_safe(learner['credit'])}", styles["body"]),
                                           Paragraph("Credit requires your judgment across all course standards.", styles["muted"])])]
    return parts


def render(summary: dict, request: RequirementEvidenceExport) -> bytes:
    styles = _styles()
    buffer = io.BytesIO()
    stamp = f"Summary date {_date(summary['date'])}"

    def footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Vera", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.55 * inch, "Standard titles come from the framework in this app; the state's text controls. This summary reports what was recorded.")
        canvas.drawString(0.75 * inch, 0.42 * inch, f"It isn't a grade or credit decision. {stamp}.")
        canvas.drawRightString(LETTER[0] - 0.75 * inch, 0.42 * inch, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buffer, pagesize=LETTER, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.7 * inch, bottomMargin=0.9 * inch,
                            title=f"SB 3 course evidence summary{': ' + request.course_name if request.course_name else ''}", author=summary["teacher"])
    story = [Paragraph("SB 3 course evidence summary · Class grid", styles["kicker"]), Paragraph(_safe(request.course_name or "Course evidence"), styles["h2"]),
             Paragraph(_safe(_course_line(request, summary["teacher"])), styles["muted"]), *_grid(summary, styles)]
    for learner in summary["learners"]:
        story += [PageBreak(), *_learner_page(learner, request, summary, styles)]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


def course_summary_pdf(db: Session, actor: PublicUser, org_id: int, request: RequirementEvidenceExport) -> tuple[str, bytes]:
    summary = summarize(db, actor, org_id, request)
    stem = "".join(char if char.isalnum() or char in "-_" else "_" for char in (request.course_name or "course").strip())[:60].strip("_") or "course"
    return f"{stem}_SB3_summary.pdf", render(summary, request)


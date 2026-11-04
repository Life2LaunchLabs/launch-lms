"""The Education Plan and Profile report as a PDF, for filing: the same parts and wording as the web
report (`components/Epp/EppReport.tsx`), drawn from the report JSON with ReportLab. Keep the two in step.

Text uses the Bitstream Vera fonts that ship with ReportLab. A character Vera lacks falls back to its
unaccented letter, so a name never prints as an empty box.
"""

from __future__ import annotations

import io
import os
import unicodedata
from datetime import datetime
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK, MUTED, BLUE, LINE, TINT, ATTENTION = (colors.HexColor(value) for value in ("#1C2433", "#505A6B", "#1B4FCC", "#D8DDE6", "#EEF3FE", "#A84300"))
STATUS_TEXT = {"complete": "✓ Complete", "reviewed": "✓ Reviewed", "needs_attention": "! Needs attention"}
KIND_LABEL = {"credential": "Credential", "result": "Result", "project": "Project", "experience": "Experience", "quote": "Quote"}
_FONTS: TTFont | None = None
CHECK = "\x00"  # Vera has no check mark; Paragraphs draw ZapfDingbats' instead.


def _font() -> TTFont:
    global _FONTS
    if _FONTS is None:
        folder = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
        for name, file in (("Vera", "Vera.ttf"), ("Vera-Bold", "VeraBd.ttf"), ("Vera-Italic", "VeraIt.ttf"), ("Vera-BoldItalic", "VeraBI.ttf")):
            pdfmetrics.registerFont(TTFont(name, os.path.join(folder, file)))
        pdfmetrics.registerFontFamily("Vera", normal="Vera", bold="Vera-Bold", italic="Vera-Italic", boldItalic="Vera-BoldItalic")
        _FONTS = pdfmetrics.getFont("Vera")  # type: ignore[assignment]
    return _FONTS  # type: ignore[return-value]


def _drawable(value) -> str:
    """Text Vera can draw."""
    glyphs = _font().face.charToGlyph
    out = []
    for char in str(value or ""):
        if (ord(char) in glyphs and char != CHECK) or char in "\n\t":
            out.append(char)
        else:
            out.append(CHECK if char in "✓✔" else "".join(part for part in unicodedata.normalize("NFKD", char) if ord(part) in glyphs) or "?")
    return "".join(out)


def _safe(value) -> str:
    """Text Vera can draw, escaped for a Paragraph."""
    return escape(_drawable(value)).replace(CHECK, '<font name="ZapfDingbats">4</font>')


def _styles() -> dict[str, ParagraphStyle]:
    _font()
    base = ParagraphStyle("body", fontName="Vera", fontSize=9.5, leading=13, textColor=INK)
    return {
        "body": base, "muted": ParagraphStyle("muted", parent=base, fontSize=8.5, leading=11.5, textColor=MUTED),
        "kicker": ParagraphStyle("kicker", parent=base, fontName="Vera-Bold", fontSize=8.5, textColor=BLUE),
        "title": ParagraphStyle("title", parent=base, fontName="Vera-Bold", fontSize=22, leading=27),
        "h2": ParagraphStyle("h2", parent=base, fontName="Vera-Bold", fontSize=14, leading=18, spaceBefore=4, spaceAfter=8),
        "h3": ParagraphStyle("h3", parent=base, fontName="Vera-Bold", fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3),
        "right": ParagraphStyle("right", parent=base, alignment=TA_RIGHT),
    }


def _num(value) -> str:
    number = float(value or 0)
    return str(int(number)) if number.is_integer() else f"{number:.2f}".rstrip("0").rstrip(".")


def _date(value: str | None, long: bool = True) -> str:
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(value if len(value) != 7 else f"{value}-01")
    except ValueError:
        return value
    return parsed.strftime("%b %-d, %Y") if long else parsed.strftime("%b %Y")


def _table(rows: list[list], head: list[str] | None, styles: dict, widths: list[float] | None = None) -> Table:
    cells = [[Paragraph(_safe(cell), styles["muted"]) for cell in head]] if head else []
    for row in rows:
        cells.append([cell if not isinstance(cell, str) else Paragraph(("<b>%s</b>" if index == 0 else "%s") % _safe(cell), styles["body"]) for index, cell in enumerate(row)])
    table = Table(cells, colWidths=widths, repeatRows=1 if head else 0)
    commands = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE)]
    if head:
        commands.append(("LINEBELOW", (0, 0), (-1, 0), 0.8, INK))
    table.setStyle(TableStyle(commands))
    return table


def _attention(text: str, on: bool, styles: dict) -> Paragraph:
    return Paragraph(f'<font color="#A84300"><b>{_safe(text)}</b></font>' if on else _safe(text), styles["body"])


def _summary(report: dict, styles: dict) -> list:
    learner, tally = report["learner"], report["graduation"]["tally"]
    facts = " · ".join(part for part in [f"Grade {learner['grade']}" if learner.get("grade") else "", f"Class of {learner['graduation_year']}" if learner.get("graduation_year") else "",
                                         learner.get("diploma") or "", f"Student ID {learner['student_id']}" if learner.get("student_id") else ""] if part)
    review, reviews = report.get("review"), report.get("reviews") or []
    stamp = f"Reviewed {_date(reviews[0]['date'])}" if reviews else "Saved when leaving" if review else "Not reviewed yet"
    version = f"Frozen record, version {review['version']}" if review else f"Live report, {_date(report.get('generated_at'))}"
    head = Table([[[Paragraph(_safe(f"Education Plan and Profile · {report['school_year']}"), styles["kicker"]), Paragraph(_safe(learner["name"]), styles["title"]),
                    Paragraph(_safe(facts), styles["muted"]),
                    Paragraph(_safe(report["org"]["name"] + (f" · Counselor: {learner['counselor']}" if learner.get("counselor") else "")), styles["muted"])],
                   [Paragraph(f"<b>{_safe(stamp)}</b>", styles["right"]), Paragraph(_safe(version), ParagraphStyle("v", parent=styles["muted"], alignment=TA_RIGHT))]]],
                 colWidths=[4.6 * inch, 2.4 * inch])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    band = Table([[[Paragraph("Next step after high school", styles["kicker"]), _attention(report.get("next_step") or "Not chosen yet", not report.get("next_step"), styles)],
                   [Paragraph("Interests", styles["kicker"]), Paragraph(_safe((report.get("interests") or ["No results yet"])[0]), styles["body"])]]], colWidths=[3.5 * inch] * 2)
    band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TINT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    parts = [head, Spacer(1, 12), band, Paragraph("Required plan and profile", styles["h3"]),
             _table([[item["label"], _attention(STATUS_TEXT.get(item["status"], item["status"]), item["status"] == "needs_attention", styles), item["detail"]] for item in report["components"]],
                    ["Component", "Status", "Detail"], styles, [1.8 * inch, 1.5 * inch, 3.7 * inch]),
             Paragraph("Graduation progress", styles["h3"]),
             Paragraph(_safe(f"{_num(tally['completed'])} completed · {_num(tally['planned'])} planned · {_num(tally['left'])} not planned, of {_num(tally['required'])} credits required"), styles["body"]),
             Spacer(1, 4),
             _table([[item["label"], _attention(("! " if item.get("attention") else "") + item["detail"], bool(item.get("attention")), styles)] for item in report["graduation"]["beyond_credits"]],
                    None, styles, [2.8 * inch, 4.2 * inch])]
    if report.get("to_talk_about"):
        parts += [Paragraph("To talk about", styles["h3"])] + [Paragraph(_safe(f"{index}. {item}"), styles["body"]) for index, item in enumerate(report["to_talk_about"], 1)]
    return parts


def _work(work: list[dict], first: str, styles: dict) -> list:
    done = [item for item in work if item.get("text") or item.get("items")]
    if not done:
        return [Paragraph(_safe(f"{first} hasn't written this yet." if work else "Not part of their plan yet."), styles["muted"])]
    parts = []
    for item in done:
        parts += [Paragraph(_safe(text), styles["body"]) for text in item.get("text") or []]
        parts += [Paragraph("• " + _safe(entry), styles["body"]) for entry in item.get("items") or []]
        source = f"✓ Teacher reviewed{' by ' + item['reviewed_by'] if item.get('reviewed_by') else ''}" if item.get("source") == "teacher_reviewed" else "Student entered"
        when = f", {_date(item['completed_at'], False)}" if item.get("completed_at") else ", waiting for review" if item.get("status") == "submitted" else ""
        parts += [Paragraph(_safe(source + when), styles["muted"]), Spacer(1, 4)]
    return parts


def _section(report: dict, key: str, heading: str, styles: dict) -> list:
    found = next((item for item in report["sections"] if item["key"] == key), None)
    parts = [Paragraph(_safe(heading), styles["h2"])]
    for requirement in (found or {}).get("requirements", []):
        parts.append(KeepTogether([Paragraph(_safe(requirement["label"]), styles["h3"]), *_work(requirement["work"], report["learner"]["first_name"], styles)]))
    return parts


INTEREST_LEVEL = {1: "A little interested", 2: "Interested", 3: "Really interested"}


def _careers(report: dict, styles: dict) -> list:
    """The careers the learner chose to show, with how interested they are and why."""
    careers = report.get("careers") or []
    if not careers:
        return []
    parts = [Paragraph("Careers I'm exploring", styles["h3"])]
    for career in careers:
        when = f" · {_date(career['saved_on'], False)}" if career.get("saved_on") else ""
        parts.append(KeepTogether([Paragraph(f"<b>{_safe(career['title'])}</b>", styles["body"]),
                                   Paragraph(_safe(INTEREST_LEVEL.get(career.get("interest_level") or 0, "Saved") + when), styles["muted"]),
                                   *([Paragraph(_safe(career["why"]), styles["body"])] if career.get("why") else []), Spacer(1, 4)]))
    return parts


def _courses(report: dict, styles: dict) -> list:
    def cell(courses: list[dict]) -> Paragraph:
        bits = [('<font color="#1B4FCC">%s</font>' if course["status"] != "completed" else "%s") % _safe(course["title"] + (" (dual credit)" if course.get("dual_credit") else "") + (" ✓" if course.get("school_confirmed") else ""))
                for course in courses]
        return Paragraph(", ".join(bits), styles["body"])
    rows = [[row["label"], *[cell(row["grades"].get(grade, [])) for grade in ("9", "10", "11", "12")]] for row in report["courses"]["grid"]]
    parts = [Paragraph("3 · Course plan", styles["h2"]), Paragraph(_safe("Blue means planned or in progress. ✓ means school confirmed."), styles["muted"]), Spacer(1, 4),
             _table(rows, ["Subject", "Grade 9", "Grade 10", "Grade 11", "Grade 12"], styles, [1.6 * inch] + [1.35 * inch] * 4)]
    dual = report["courses"].get("dual_credit") or []
    if dual:
        text = "; ".join(f"{course['title']}, {_num(course['credits'])} high school{' and ' + _num(course['college_credits']) + ' college' if course.get('college_credits') else ''} credits"
                         f"{' at ' + course['college'] if course.get('college') else ''}" for course in dual)
        parts += [Spacer(1, 6), Paragraph(f"<b>Dual credit:</b> {_safe(text)}.", styles["body"])]
    return parts


def _progress(report: dict, styles: dict) -> list:
    tally = report["graduation"]["tally"]
    rows = [[area["label"], _num(area["required"]), _num(area["completed"]), _num(area["planned"]), _attention(_num(area["left"]), bool(area["left"]), styles)] for area in tally["areas"]]
    rows.append(["Total", _num(tally["required"]), _num(tally["completed"]), _num(tally["planned"]), _num(tally["left"])])
    return [Paragraph("4 · Graduation progress", styles["h2"]), _table(rows, ["Oregon Diploma credits", "Required", "Completed", "Planned", "Left"], styles, [3 * inch] + [1 * inch] * 4),
            Spacer(1, 4), Paragraph("The transcript is the official record of credit. This school's own requirements may add to this table.", styles["muted"])]


def _evidence(report: dict, styles: dict) -> list:
    first = report["learner"]["first_name"]
    parts = [Paragraph("6 · Evidence", styles["h2"]), Paragraph(_safe(f"Chosen by {first} from their portfolio."), styles["muted"]), Spacer(1, 4)]
    if not report.get("evidence"):
        return parts + [Paragraph(_safe(f"{first} hasn't chosen anything from their portfolio yet."), styles["muted"])]
    for item in report["evidence"]:
        when = f" · {_date(item['date'], False)}{' to now' if item.get('ongoing') else ' to ' + _date(item['end'], False) if item.get('end') else ''}" if item.get("date") else ""
        title = f"“{item.get('summary')}”" if item["kind"] == "quote" else item["title"]
        lines = [Paragraph(f"<b>{_safe(title)}</b>", styles["body"]), Paragraph(_safe(KIND_LABEL.get(item["kind"], item["kind"]) + when), styles["muted"])]
        if item["kind"] == "quote":
            lines.append(Paragraph(_safe(item["title"] + (f", {item['detail']}" if item.get("detail") else "") + (", confirmed by them" if item.get("verified") else "")), styles["body"]))
        else:
            lines += [Paragraph(_safe(text), styles["body"]) for text in (item.get("detail"), item.get("summary")) if text]
        if item["kind"] == "credential" and item.get("verified"):
            lines.append(Paragraph(f"<b>{_safe('✓ Verified with the issuer')}</b>", styles["muted"]))
        parts += [KeepTogether(lines), Spacer(1, 6)]
    return parts


def _review(report: dict, styles: dict) -> list:
    first, review = report["learner"]["first_name"], report.get("review") or {}
    parts = [Paragraph("Review history", styles["h3"])]
    reviews = report.get("reviews") or []
    parts.append(_table([[_date(item["date"]), item.get("reviewer") or "School staff", item.get("outcome") or "—"] for item in reviews], ["Date", "Reviewed with", "Outcome"], styles,
                        [1.4 * inch, 2.2 * inch, 3.4 * inch]) if reviews else Paragraph("Not reviewed yet this year.", styles["muted"]))
    if review.get("staff_comment") or review.get("learner_comment"):
        parts.append(Paragraph("Comments", styles["h3"]))
        if review.get("staff_comment"):
            parts.append(Paragraph(f"<b>{_safe(review.get('reviewer') or 'Staff')}:</b> {_safe(review['staff_comment'])}", styles["body"]))
        if review.get("learner_comment"):
            parts.append(Paragraph(f"<b>{_safe(first)}:</b> {_safe(review['learner_comment'])}", styles["body"]))
    if review.get("correction_reason"):
        by = f" by {review['corrected_by']}" if review.get("corrected_by") else ""
        parts += [Spacer(1, 6), Paragraph(_safe(f"Corrected{by} on {_date(review.get('corrected_at'))}: {review['correction_reason']}"), styles["muted"])]
    lines = Table([[Paragraph(who, styles["muted"]), Paragraph("Date", styles["muted"])] for who in ("Student", "Parent or guardian", "Counselor or advisor")],
                  colWidths=[4.8 * inch, 1.8 * inch], rowHeights=[0.45 * inch] * 3)
    lines.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 0.8, INK), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    about = [Paragraph("About this report", styles["h3"]),
             Paragraph(_safe(f"Student entered is written by {first}. Teacher reviewed was checked by the named staff member. School confirmed was entered by school staff."), styles["body"])]
    if review:
        about.append(Paragraph(_safe(f"This is a frozen copy made for {report['org']['name']}. It stays the same if {first} changes their portfolio or deletes their account. "
                                     "Corrections create a new version."), styles["body"]))
    about.append(Paragraph("The school decides academic credit, and the transcript is the official record. Budgets, private items, documents and contact details aren't included.", styles["body"]))
    return parts + [Paragraph("Signatures", styles["h3"]), Paragraph("Optional. Your school may ask for these.", styles["muted"]), Spacer(1, 18), lines, Spacer(1, 10), KeepTogether(about)]


def render(report: dict) -> bytes:
    """One learner's report as PDF bytes, a part per page like the printed web report."""
    styles = _styles()
    learner = report["learner"]
    buffer = io.BytesIO()

    def footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Vera", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.5 * inch, _drawable(f"{learner['name']} · Education Plan and Profile {report['school_year']} · {report['org']['name']}"))
        canvas.drawRightString(LETTER[0] - 0.75 * inch, 0.5 * inch, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buffer, pagesize=LETTER, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                            title=f"{learner['name']}: Education Plan and Profile {report['school_year']}", author=report["org"]["name"])
    story = [*_summary(report, styles), PageBreak(),
             *_section(report, "who", "1 · Who I am", styles), *_careers(report, styles), Spacer(1, 12), *_section(report, "headed", "2 · Where I'm headed", styles), PageBreak(),
             *_courses(report, styles), PageBreak(), *_progress(report, styles), PageBreak(),
             *_section(report, "beyond", "5 · Learning beyond the classroom", styles), Spacer(1, 12), *_evidence(report, styles), PageBreak(),
             *_section(report, "review", "7 · Look back and review", styles), *_review(report, styles)]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()

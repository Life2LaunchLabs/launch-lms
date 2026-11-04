"""The live Oregon Education Plan and Profile report for one learner and one school.

`build` returns versioned JSON (`schema_version`) that the web lays out on screen and on paper, and that
slice 5 will freeze as the school's record. It finds the learner's work by requirement code
(`content.steps_for_code`), so whichever plan carries a step, the report fills the same place.

Privacy: only what the support consent covers goes in. That's work in plans the school gave the learner
(never their personal goals), the course plan, the school record, and the portfolio items the learner
picked that are still public. Budgets, contact details, private items, staff notes and file links never
enter the JSON, and `_scrub` drops any such key as a last line of defense.
"""

from __future__ import annotations

import html
import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, select

from src.db.goals import StepEntry, StepProgress
from src.db.learner_support import DIPLOMA_TRACKS, LearnerSupport, ReportPicks
from src.db.organizations import Organization
from src.db.portfolio import Portfolio, PortfolioModerationStatus
from src.db.users import PublicUser, User
from src.services.connect import people
from src.services.epp import content, courses
from src.services.portfolio_identity import shown_name
from src.services.school import roles, support

SCHEMA_VERSION = 1
DONE = {"completed", "excused"}
STARTED = DONE | {"in_progress", "submitted", "changes_requested"}
DIPLOMA_LABELS = {"standard": "Oregon Diploma", "modified": "Modified Diploma", "extended": "Extended Diploma", "alternative_certificate": "Alternative Certificate"}
ESSENTIAL_SKILLS = "Suspended by the state through 2027-28"
# Keys that must never reach a report, wherever they turn up.
PRIVATE_KEYS = {"email", "phone", "address", "budget", "password", "contacts", "documents", "resume_versions", "staff_notes",
                "reviewer_note", "learner_note", "visibility", "url", "photo_url", "cover_url", "pdf"}
PICK_KINDS = ("credential", "result", "project", "experience", "quote")

SECTIONS = [
    ("who", "Who I am", ["EPP.INTERESTS.STRENGTHS", "EPP.INTERESTS.ASSESSMENTS", "EPP.INTERESTS.CAREERS"]),
    ("headed", "Where I'm headed", ["EPP.GOALS.CAREER", "EPP.GOALS.EDUCATION", "EPP.GOALS.PREPARATION", "EPP.GOALS.ACTION", "EPP.GOALS.SUPPORT"]),
    ("beyond", "Learning beyond the classroom", ["EPP.CRLE.EXPERIENCE", "EPP.CRLE.REFLECTION", "EPP.EXTAPP.PLAN", "EPP.EXTAPP.EVIDENCE"]),
    ("review", "Look back and review", ["EPP.COURSES.PLAN", "EPP.ACCOMPLISHMENTS.LEARNING", "EPP.ACCOMPLISHMENTS.EVIDENCE", "EPP.PROGRESS.REVIEW"]),
]


def school_year(today: datetime | None = None) -> str:
    """Oregon school years start in the fall: 2026-27 runs from July 2026."""
    today = today or datetime.now(timezone.utc)
    start = today.year if today.month >= 7 else today.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def grade_for(graduation_year: int | None, year: str) -> int | None:
    if not graduation_year:
        return None
    grade = 12 - (graduation_year - (int(year[:4]) + 1))
    return grade if 9 <= grade <= 12 else None


def _plain(value) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _labels() -> dict[str, str]:
    return {node["code"]: node["title"] for node in content.framework_document()["nodes"]}


# ---------------------------------------------------------------- learner work, by code

def _submission_text(submission: dict) -> list[str]:
    """The words a learner wrote or chose, from any step type's submission, without links or file ids."""
    texts = []
    for key, value in (submission or {}).items():
        if key in PRIVATE_KEYS or key.endswith("_uuid") or key.endswith("_id"):
            continue
        for item in value if isinstance(value, list) else [value]:
            if isinstance(item, dict):
                item = item.get("label") or item.get("title") or item.get("text") or ""
            if isinstance(item, (str, int, float)) and not isinstance(item, bool) and _plain(item):
                texts.append(_plain(item))
    return texts


def _step_work(db: Session, step, learner_id: int) -> dict:
    progress = db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()
    status = str(getattr(progress.status, "value", progress.status)) if progress else "not_started"
    entries = db.exec(select(StepEntry).where(StepEntry.step_id == step.id).order_by(StepEntry.position, StepEntry.id)).all()
    items = [_plain(entry.title or entry.note) for entry in entries if _plain(entry.title or entry.note)]
    texts = _submission_text(progress.submission if progress else {}) + ([_plain(progress.answer)] if progress and _plain(progress.answer) else [])
    reviewed = bool(progress and status == "completed" and step.review_required and progress.completed_by_user_id and progress.completed_by_user_id != learner_id)
    reviewer = db.get(User, progress.completed_by_user_id) if reviewed and progress else None
    return {
        "step": step.title, "status": status, "text": texts, "items": items,
        "completed_at": progress.completed_at.isoformat() if progress and progress.completed_at else None,
        "source": "teacher_reviewed" if reviewed else "student_entered",
        "reviewed_by": shown_name(reviewer) if reviewer else None,
        "review_required": bool(step.review_required),
    }


def _work(db: Session, learner_id: int, org_id: int) -> dict[str, list[dict]]:
    return {code: [_step_work(db, step, learner_id) for step in content.steps_for_code(db, learner_id, org_id, code)] for code in content.codes()}


def _done(work: dict, code: str) -> bool:
    return any(item["status"] in DONE for item in work.get(code, []))


def _started(work: dict, code: str) -> bool:
    return any(item["status"] in STARTED for item in work.get(code, []))


# ---------------------------------------------------------------- portfolio picks

def _portfolio(db: Session, learner_id: int) -> Portfolio | None:
    return db.exec(select(Portfolio).where(Portfolio.user_id == learner_id)).first()


def choices(db: Session, learner_id: int) -> list[dict]:
    """The learner's public portfolio items they can choose for the report."""
    from src.services.portfolio import portfolio_shell

    portfolio = _portfolio(db, learner_id)
    # A portfolio held for moderation shares nothing, as on the learner's profile.
    if not portfolio or str(getattr(portfolio.moderation_status, "value", portfolio.moderation_status)) != PortfolioModerationStatus.CLEAR.value:
        return []
    shell = portfolio_shell(portfolio, db, public_only=True)
    found = []
    for item in shell.get("credentials") or []:
        found.append({"kind": "credential", "uuid": item["credential_uuid"], "title": item["name"], "detail": item.get("issuer") or "",
                      "date": item.get("issued_on") or item.get("expected_on"), "verified": item.get("verification_status") == "verified"})
    for item in shell.get("results") or []:
        found.append({"kind": "result", "uuid": item["result_uuid"], "title": item["name"], "detail": _plain(item.get("summary")), "date": item.get("taken_on")})
    for item in shell.get("projects") or []:
        found.append({"kind": "project", "uuid": item["project_uuid"], "title": item["title"], "detail": _plain(item.get("summary") or item.get("subtitle")),
                      "date": item.get("start_date"), "end": item.get("end_date"), "ongoing": bool(item.get("is_ongoing"))})
    for item in shell.get("timeline") or []:
        found.append({"kind": "experience", "uuid": item["timeline_uuid"], "title": item["title"], "detail": item.get("organization") or "",
                      "summary": _plain(item.get("summary")), "type": item.get("entry_type"), "date": item.get("start_date"), "end": item.get("end_date"),
                      "ongoing": bool(item.get("is_current"))})
    for item in shell.get("quotes") or []:
        found.append({"kind": "quote", "uuid": item["quote_uuid"], "title": item.get("name") or "", "detail": item.get("role_label") or "",
                      "summary": _plain(item.get("body")), "verified": bool(item.get("confirmed"))})
    return found


def careers(db: Session, learner_id: int, limit: int = 8) -> list[dict]:
    """Careers the learner saved from Discover and chose to show on their EPP, newest first, with what they wrote about each."""
    from src.db.resources import Resource, ResourceNoteBlock, UserSavedResource
    from src.services.life_plans.careers import code_of

    rows = db.exec(select(UserSavedResource, Resource).join(Resource, Resource.id == UserSavedResource.resource_id).where(
        UserSavedResource.user_id == learner_id, UserSavedResource.show_on_epp == True, Resource.resource_type == "career")  # noqa: E712
        .order_by(UserSavedResource.creation_date.desc())).all()
    out = []
    for saved, resource in rows[:limit]:
        notes = db.exec(select(ResourceNoteBlock).where(ResourceNoteBlock.user_id == learner_id, ResourceNoteBlock.resource_id == resource.id,
                                                        ResourceNoteBlock.block_type == "text").order_by(ResourceNoteBlock.sort_order, ResourceNoteBlock.id)).all()
        why = " ".join(text for text in [_plain(saved.notes)] + [_plain(note.content) for note in notes] if text)
        out.append({"title": resource.title, "code": code_of(resource), "why": why[:400], "interest_level": saved.interest_level,
                    "saved_on": (saved.creation_date or "")[:10]})
    return out


def _picked(db: Session, row: LearnerSupport, learner_id: int) -> list[dict]:
    available = {(item["kind"], item["uuid"]): item for item in choices(db, learner_id)}
    return [available[key] for key in ((pick.get("kind"), pick.get("uuid")) for pick in row.report_picks or []) if key in available]


# ---------------------------------------------------------------- the report

def _component(key: str, label: str, ok: bool, detail: str, ok_label: str = "complete") -> dict:
    return {"key": key, "label": label, "status": ok_label if ok else "needs_attention", "detail": detail}


def _credit_line(plan: dict, subject: str) -> str:
    rows = [course for course in plan["courses"] if course["subject"] == subject]
    if any(course["status"] == "completed" and course["school_confirmed"] for course in rows):
        return "Credit recorded by school"
    if any(course["status"] == "completed" for course in rows):
        return "Completed, not yet confirmed by the school"
    if rows:
        return "Planned: " + ", ".join(course["title"] for course in rows)
    return "Not planned yet"


def _course_grid(plan: dict) -> list[dict]:
    grid = []
    for subject in plan["subjects"]:
        by_grade = {str(grade): [{"title": course["title"], "status": course["status"], "dual_credit": course["dual_credit"], "school_confirmed": course["school_confirmed"]}
                                 for course in plan["courses"] if course["subject"] == subject["key"] and course["grade"] == grade] for grade in courses.GRADES}
        grid.append({"subject": subject["key"], "label": subject["label"], "grades": by_grade})
    return grid


def _history(db: Session, org_id: int, learner_id: int) -> list[dict]:
    from src.services.epp import records

    bind = db.get_bind()
    return records.history(db, org_id, learner_id) if bind is not None and inspect(bind).has_table("epprecord") else []


def _scrub(value):
    if isinstance(value, dict):
        return {key: _scrub(item) for key, item in value.items() if key not in PRIVATE_KEYS}
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    return value


def build(db: Session, org_id: int, learner_id: int, today: datetime | None = None) -> dict:
    """The report as it stands now. Callers check access first."""
    row = db.exec(select(LearnerSupport).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == learner_id)).one()
    org = db.get(Organization, org_id)
    learner = db.get(User, learner_id)
    if not org or not learner:
        raise HTTPException(status_code=404, detail="Not found")
    today = today or datetime.now(timezone.utc)
    year = school_year(today)
    first = shown_name(learner).split(" ")[0]
    work = _work(db, learner_id, org_id)
    labels = _labels()
    plan = courses.plan_dto(db, org_id, learner_id)
    tally = plan["tally"]
    evidence = _picked(db, row, learner_id)
    results = [item for item in choices(db, learner_id) if item["kind"] == "result"]
    explored = careers(db, learner_id)
    crle = work["EPP.CRLE.EXPERIENCE"]
    crle_done = [item for item in crle if item["status"] in DONE | {"submitted"}]
    crle_reviewed = [item for item in crle_done if item["source"] == "teacher_reviewed"]
    extapp = _started(work, "EPP.EXTAPP.PLAN")
    next_step = next((text for item in work["EPP.GOALS.EDUCATION"] for text in item["text"]), None)
    history = _history(db, org_id, learner_id)
    reviewed = _done(work, "EPP.PROGRESS.REVIEW") or any(item.get("school_year") == year for item in history)

    components = [
        _component("interests", "Interests", _done(work, "EPP.INTERESTS.ASSESSMENTS") or bool(results),
                   f"{len(results)} result{'' if len(results) == 1 else 's'}, {'careers explored' if _done(work, 'EPP.INTERESTS.CAREERS') or explored else 'no careers explored yet'}"),
        _component("goals", "Goals and next steps", all(_done(work, code) for code in ("EPP.GOALS.CAREER", "EPP.GOALS.EDUCATION", "EPP.GOALS.ACTION")),
                   "Goals, next step and action plan written" if all(_done(work, code) for code in ("EPP.GOALS.CAREER", "EPP.GOALS.EDUCATION", "EPP.GOALS.ACTION"))
                   else "Goals, next step or this year's action plan still open"),
        _component("courses", "Course of study", bool(plan["courses"]) and not tally["left"],
                   "No courses planned yet" if not plan["courses"] else (f"{tally['left']:g} credits have no planned course" if tally["left"] else "Every required credit is planned")),
        _component("progress", "Graduation progress", reviewed, "Reviewed this year" if reviewed else "Not reviewed this year", "reviewed"),
        _component("accomplishments", "Accomplishments", bool(evidence) or _done(work, "EPP.ACCOMPLISHMENTS.LEARNING"),
                   f"{len(evidence)} item{'' if len(evidence) == 1 else 's'} chosen by {first}"),
    ]
    talk = []
    if tally["left"]:
        talk.append(f"Plan {tally['left']:g} more credit{'' if tally['left'] == 1 else 's'} of courses.")
    if not extapp:
        talk.append("Pick an Extended Application.")
    if crle_done and len(crle_reviewed) < len(crle_done):
        talk.append("Review the career-related learning that's waiting.")
    if not crle_done:
        talk.append("Find a career-related learning experience.")
    if not next_step:
        talk.append("Choose a next step after high school.")
    if not evidence:
        talk.append(f"Help {first} choose evidence from their portfolio.")

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": today.isoformat(),
        "school_year": year,
        "org": {"name": org.name},
        "learner": {
            "name": shown_name(learner), "first_name": first, "student_id": row.student_id,
            "grade": grade_for(row.graduation_year, year), "graduation_year": row.graduation_year,
            "diploma_track": row.diploma_track, "diploma": DIPLOMA_LABELS.get(row.diploma_track or "", None) if row.diploma_track in DIPLOMA_TRACKS else None,
            "counselor": (people.person(db, row.counselor_user_id) or {}).get("name") if row.counselor_user_id else None,
        },
        "next_step": next_step,
        "interests": [item["title"] + (f": {item['detail']}" if item["detail"] else "") for item in results][:6],
        # Careers the learner saved in Discover and chose to show here, with why.
        "careers": explored,
        "components": components,
        "to_talk_about": talk[:5],
        "graduation": {
            "tally": tally,
            "beyond_credits": [
                {"key": "personal_finance", "label": "Personal Financial Education", "detail": _credit_line(plan, "personal_finance")},
                {"key": "career_path_skills", "label": "Higher Education and Career Path Skills", "detail": _credit_line(plan, "career_path_skills")},
                {"key": "crle", "label": "Career-related learning experiences", "detail": f"{len(crle_done)} documented, {len(crle_reviewed)} reviewed" if crle_done else "None documented yet",
                 "attention": not crle_done},
                {"key": "extended_application", "label": "Extended Application", "detail": "Planned" if extapp else "Not chosen yet", "attention": not extapp},
                {"key": "essential_skills", "label": "Essential Skills assessment", "detail": ESSENTIAL_SKILLS},
            ],
        },
        "courses": {"grid": _course_grid(plan), "dual_credit": [
            {"title": course["title"], "grade": course["grade"], "credits": course["credits"], "college": course["dual_credit_school"], "college_credits": course["dual_credit_credits"], "status": course["status"]}
            for course in plan["courses"] if course["dual_credit"]]},
        "sections": [{"key": key, "title": title, "requirements": [{"code": code, "label": labels.get(code, code), "work": work[code]} for code in codes]}
                     for key, title, codes in SECTIONS],
        "evidence": evidence,
        "reviews": history,
    }
    return _scrub(report)


# ---------------------------------------------------------------- access

def staff_report(db: Session, current_user: PublicUser, org_id: int, learner_id: int) -> dict:
    support.require_support(db, org_id, current_user.id, learner_id)
    return build(db, org_id, learner_id)


def _mine(db: Session, current_user: PublicUser, org_id: int) -> LearnerSupport:
    row = db.exec(select(LearnerSupport).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == current_user.id)).first()
    if not row or row.status != "active" or roles.org_role(db, org_id, current_user.id) != "learner":
        raise HTTPException(status_code=404, detail="This organization doesn't support your plan")
    return row


def my_report(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """The learner's own preview: the report the school sees, what they can choose for it, and what they chose."""
    row = _mine(db, current_user, org_id)
    return {"report": build(db, org_id, current_user.id), "choices": _scrub(choices(db, current_user.id)),
            "picks": [{"kind": pick.get("kind"), "uuid": pick.get("uuid")} for pick in row.report_picks or []]}


def set_picks(db: Session, current_user: PublicUser, org_id: int, payload: ReportPicks) -> dict:
    row = _mine(db, current_user, org_id)
    available = {(item["kind"], item["uuid"]) for item in choices(db, current_user.id)}
    picks, seen = [], set()
    for pick in payload.picks:
        key = (pick.get("kind"), pick.get("uuid"))
        if key[0] not in PICK_KINDS or key not in available:
            raise HTTPException(status_code=422, detail="You can only choose public items from your portfolio")
        if key not in seen:
            seen.add(key)
            picks.append({"kind": key[0], "uuid": key[1]})
    row.report_picks = picks
    row.update_date = datetime.now(timezone.utc).isoformat()
    db.add(row)
    db.commit()
    return my_report(db, current_user, org_id)

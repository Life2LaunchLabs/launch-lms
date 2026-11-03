"""A school's Education Plan and Profile caseload: who it supports, where each plan stands, and a class
export of the reviewed records as PDFs.

Only learners with a support link are listed (a learner who hasn't said yes yet shows as waiting). The
caseload builds each live report, so it's one report per supported learner; that's fine for a school's
pilot and is the first thing to cache if caseloads grow into the thousands.
"""

from __future__ import annotations

import io
import re
import unicodedata
import zipfile

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.epp_records import EppRecord
from src.db.learner_support import LearnerSupport
from src.db.users import PublicUser, User
from src.services.epp import pdf, records, report
from src.services.portfolio_identity import shown_name
from src.services.school import roles, support

COMPONENTS = ("interests", "goals", "courses", "progress", "accomplishments")


def _learner_row(db: Session, link: LearnerSupport, year: str) -> dict:
    user = db.get(User, link.user_id)
    base = {"user_id": link.user_id, "username": user.username if user else None, "name": shown_name(user) if user else "",
            "student_id": link.student_id, "grade": report.grade_for(link.graduation_year, year), "counselor_user_id": link.counselor_user_id}
    if link.status != "active":
        return {**base, "state": "waiting", "components": {}, "evidence": 0, "last_review": None, "due": True, "open": "Hasn't said yes to sharing yet"}
    live = report.build(db, link.org_id, link.user_id)
    marks = {item["key"]: item["status"] for item in live["components"]}
    last = next(iter(live.get("reviews") or []), None)
    reviewed = marks.get("progress") == "reviewed"
    ready = all(marks.get(key) == "complete" for key in COMPONENTS if key != "progress")
    return {
        **base, "state": "reviewed" if reviewed else "ready" if ready else "missing",
        "components": marks, "evidence": len(live["evidence"]),
        "last_review": last["date"] if last else None, "due": not reviewed,
        "open": (live["to_talk_about"] or ["Nothing open"])[0] if not ready or reviewed else "Ready for review",
    }


def caseload(db: Session, current_user: PublicUser, org_id: int, mine: bool = False) -> dict:
    """Every learner the school supports (or only those the viewer counsels), with where their plan stands."""
    if not roles.is_staff(db, org_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the organization's staff can do that")
    year = report.school_year()
    query = select(LearnerSupport).where(LearnerSupport.org_id == org_id, col(LearnerSupport.status).in_(("active", "requested")))
    if mine:
        query = query.where(LearnerSupport.counselor_user_id == current_user.id)
    rows = []
    for link in db.exec(query).all():
        # Someone who's staff now (or left) has no plan to review here.
        if link.status == "active" and not support.is_supported(db, org_id, current_user.id, link.user_id):
            continue
        rows.append(_learner_row(db, link, year))
    rows.sort(key=lambda row: (row["name"] or "").lower())
    states = [row["state"] for row in rows]
    return {
        "school_year": year, "learners": rows,
        "counts": {"total": len(rows), "reviewed": states.count("reviewed"), "ready": states.count("ready"),
                   "missing": states.count("missing"), "waiting": states.count("waiting")},
        "exportable": len(_reviewed_records(db, org_id, year, {row["user_id"] for row in rows})),
    }


# ---------------------------------------------------------------- PDFs

def _part(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9-]+", "", text.replace(" ", "-")).strip("-")


def file_name(db: Session, row: EppRecord) -> str:
    """Last_First_StudentID_EPP_2026-27.pdf, from the account's names while it exists."""
    user = db.get(User, row.user_id) if row.user_id else None
    first, last = (user.first_name, user.last_name) if user and (user.first_name or user.last_name) else (None, None)
    if first is None:
        words = (row.learner_name or "").split()
        first, last = (" ".join(words[:-1]), words[-1]) if len(words) > 1 else (row.learner_name or "", "")
    parts = [_part(last or ""), _part(first or ""), _part(row.student_id or ""), "EPP", row.school_year]
    name = "_".join(part for part in parts if part)
    return f"{name}{'' if row.version == 1 else f'_v{row.version}'}.pdf"


def _reviewed_records(db: Session, org_id: int, year: str, user_ids: set[int]) -> list[EppRecord]:
    """The newest reviewed record this school year for each learner, without corrected versions or exits."""
    replaced = records.superseded_ids(db, org_id)
    found: dict[int, EppRecord] = {}
    query = select(EppRecord).where(EppRecord.org_id == org_id, EppRecord.school_year == year, EppRecord.kind != "exit")
    for row in db.exec(query.order_by(col(EppRecord.reviewed_at).desc(), col(EppRecord.id).desc())).all():
        if row.id in replaced or row.user_id is None or row.user_id not in user_ids:
            continue
        found.setdefault(row.user_id, row)
    return list(found.values())


def record_pdf(db: Session, current_user: PublicUser, org_id: int, record_uuid: str) -> tuple[str, bytes]:
    row = records.get_record(db, current_user, org_id, record_uuid)
    return file_name(db, row), pdf.render(row.data)


def export_reviewed(db: Session, current_user: PublicUser, org_id: int, mine: bool = False) -> tuple[str, bytes]:
    """A zip with one PDF per learner in the caseload who has a reviewed record this school year."""
    listed = caseload(db, current_user, org_id, mine)
    rows = _reviewed_records(db, org_id, listed["school_year"], {row["user_id"] for row in listed["learners"]})
    buffer, used = io.BytesIO(), set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for row in rows:
            name = file_name(db, row)
            stem, count = name[:-4], 2
            while name in used:
                name, count = f"{stem}-{count}.pdf", count + 1
            used.add(name)
            archive.writestr(name, pdf.render(row.data))
    return f"EPP_{listed['school_year']}.zip", buffer.getvalue()

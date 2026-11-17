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
from src.db.school import UserGroupStaff
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.security.org_auth import is_org_admin
from src.services.epp import content, pdf, records, report
from src.services.portfolio_identity import legal_name, shown_name
from src.services.school import roles, support

COMPONENTS = ("interests", "goals", "courses", "progress", "accomplishments")
EXPORT_LIMIT = 200


def _learner_row(db: Session, link: LearnerSupport, year: str) -> dict:
    user = db.get(User, link.user_id)
    base = {"user_id": link.user_id, "user_uuid": user.user_uuid if user else None, "username": user.username if user else None, "name": (legal_name(user) or shown_name(user)) if user else "",
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


def _rows(db: Session, current_user: PublicUser, org_id: int, year: str, mine: bool = False, only: set[int] | None = None) -> list[dict]:
    if not roles.is_staff(db, org_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the organization's staff can do that")
    query = select(LearnerSupport).where(LearnerSupport.org_id == org_id, col(LearnerSupport.status).in_(("active", "requested")))
    if mine:
        query = query.where(LearnerSupport.counselor_user_id == current_user.id)
    if only is not None:
        query = query.where(col(LearnerSupport.user_id).in_(list(only) or [0]))
    rows = []
    for link in db.exec(query).all():
        # Someone who's staff now (or left) has no plan to review here.
        if link.status == "active" and not support.is_supported(db, org_id, current_user.id, link.user_id):
            continue
        rows.append(_learner_row(db, link, year))
    rows.sort(key=lambda row: (row["name"] or "").lower())
    return rows


def caseload(db: Session, current_user: PublicUser, org_id: int, mine: bool = False) -> dict:
    """Every learner the school supports (or only those the viewer counsels), with where their plan stands."""
    year = report.school_year()
    rows = _rows(db, current_user, org_id, year, mine)
    states = [row["state"] for row in rows]
    return {
        "school_year": year, "learners": rows,
        "counts": {"total": len(rows), "reviewed": states.count("reviewed"), "ready": states.count("ready"),
                   "missing": states.count("missing"), "waiting": states.count("waiting")},
        "exportable": len(_reviewed_records(db, org_id, year, {row["user_id"] for row in rows})),
        # The yearly plan the school assigns, once it has one; staff who build plans can set it up from here.
        "plan": content.installed(db, org_id), "can_set_up": is_org_admin(current_user.id, org_id, db, "build_plans"),
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


# ---------------------------------------------------------------- Insights: every learner's EPP (PL-7)

def _complete(row: dict) -> bool:
    """Every part of the plan and profile done, the yearly review included."""
    marks = row.get("components") or {}
    return bool(marks) and all(marks.get(key) in ("complete", "reviewed") for key in COMPONENTS)


def _groups(db: Session, org_id: int, current_user: PublicUser, see_reports: bool) -> list[UserGroup]:
    """The groups the viewer can filter by: every group with See reports, otherwise the ones they're staff on."""
    query = select(UserGroup).where(UserGroup.org_id == org_id)
    if not see_reports:
        mine = db.exec(select(UserGroupStaff.usergroup_id).where(UserGroupStaff.user_id == current_user.id, UserGroupStaff.org_id == org_id)).all()
        query = query.where(col(UserGroup.id).in_(list(mine) or [0]))
    return list(db.exec(query.order_by(col(UserGroup.name))).all())


def overview(db: Session, current_user: PublicUser, org_id: int, group: str | None = None, state: str | None = None) -> dict:
    """Every learner's Education Plan and Profile, for Insights: who is complete and who isn't, by group.

    Staff with See reports see every learner the school supports. Staff without it see only the learners in
    groups they're staff on, whatever the page asks for; that is checked here, not in the web.
    """
    from src.services.school.chats import students_of

    if not roles.is_staff(db, org_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the organization's staff can do that")
    see_reports = is_org_admin(current_user.id, org_id, db, "see_reports")
    groups = _groups(db, org_id, current_user, see_reports)
    only: set[int] | None = None if see_reports else students_of(db, org_id, current_user.id)
    picked = None
    if group:
        picked = next((item for item in groups if item.usergroup_uuid == group), None)
        if picked is None:
            raise HTTPException(status_code=404, detail="Group not found")
        members = {int(item) for item in db.exec(select(UserGroupUser.user_id).where(UserGroupUser.usergroup_id == picked.id)).all()}
        only = members if only is None else only & members
    year = report.school_year()
    rows = _rows(db, current_user, org_id, year, only=only)
    ids = [row["user_id"] for row in rows]
    member_of: dict[int, list[str]] = {}
    names = {int(item.id): item.name for item in groups}  # type: ignore[arg-type]
    if ids and names:
        for user_id, group_id in db.exec(select(UserGroupUser.user_id, UserGroupUser.usergroup_id).where(
                col(UserGroupUser.user_id).in_(ids), col(UserGroupUser.usergroup_id).in_(list(names)))).all():
            member_of.setdefault(int(user_id), []).append(names[int(group_id)])
    for row in rows:
        row["complete"] = _complete(row)
        row["groups"] = sorted(member_of.get(row["user_id"], []))
    complete = sum(1 for row in rows if row["complete"])
    if state in ("complete", "incomplete"):
        rows = [row for row in rows if row["complete"] == (state == "complete")]
    return {
        "school_year": year, "learners": rows, "see_reports": see_reports,
        "counts": {"total": len(ids), "complete": complete, "incomplete": len(ids) - complete},
        "groups": [{"usergroup_uuid": item.usergroup_uuid, "name": item.name} for item in groups],
        "group": {"usergroup_uuid": picked.usergroup_uuid, "name": picked.name} if picked else None,
    }


def live_file_name(user: User | None, link: LearnerSupport, year: str) -> str:
    """Last_First_StudentID_EPP_2026-27.pdf, from the learner's legal name."""
    first, last = (user.first_name or "", user.last_name or "") if user else ("", "")
    parts = [_part(last), _part(first), _part(link.student_id or ""), "EPP", year]
    return "_".join(part for part in parts if part) + ".pdf"


def export_selected(db: Session, current_user: PublicUser, org_id: int, user_ids: list[int]) -> tuple[str, bytes]:
    """A zip with each chosen learner's Education Plan and Profile as it stands now, one PDF each.

    Only learners the viewer can see in the Insights view, and who have said yes to sharing, are included; the
    report carries the legal name and never staff notes (report.build leaves them out).
    """
    if not user_ids:
        raise HTTPException(status_code=422, detail="Pick at least one learner")
    if len(user_ids) > EXPORT_LIMIT:
        raise HTTPException(status_code=422, detail=f"Export up to {EXPORT_LIMIT} at a time")
    listed = overview(db, current_user, org_id)
    allowed = {row["user_id"] for row in listed["learners"] if row["state"] != "waiting"}
    wanted = [user_id for user_id in dict.fromkeys(user_ids) if user_id in allowed]
    if not wanted:
        raise HTTPException(status_code=404, detail="None of those learners' plans are shared with you")
    year = listed["school_year"]
    buffer, used = io.BytesIO(), set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for user_id in wanted:
            link = db.exec(select(LearnerSupport).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == user_id)).one()
            name = live_file_name(db.get(User, user_id), link, year)
            stem, count = name[:-4], 2
            while name in used:
                name, count = f"{stem}-{count}.pdf", count + 1
            used.add(name)
            archive.writestr(name, pdf.render(report.build(db, org_id, user_id)))
    return f"EPP_{year}_{len(wanted)}_learners.zip", buffer.getvalue()

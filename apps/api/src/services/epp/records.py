"""Reviewing and freezing a learner's Education Plan and Profile.

Staff review the live report with a supported learner and save it: the report JSON is frozen into an
`EppRecord` with the outcome and comments. Records are never edited; a correction is a new version
pointing at the one it replaces. Records belong to the school, so any of its staff can open them, even
after the support link ends or the learner deletes their account. When a supported learner leaves the
organization or deletes their account, `freeze_exits` saves an exit record first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, col, select

from src.db.epp_records import RECORD_KINDS, EppRecord, EppRecordCorrection, EppRecordCreate
from src.db.learner_support import LearnerSupport
from src.db.users import PublicUser, User
from src.services.epp import report
from src.services.portfolio_identity import shown_name
from src.services.school import roles, support


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_staff(db: Session, current_user: PublicUser, org_id: int) -> None:
    if not roles.is_staff(db, org_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the organization's staff can do that")


def superseded_ids(db: Session, org_id: int) -> set[int]:
    return {int(row) for row in db.exec(select(EppRecord.supersedes_id).where(EppRecord.org_id == org_id, col(EppRecord.supersedes_id).is_not(None))).all()}


def current(db: Session, org_id: int, user_id: int) -> list[EppRecord]:
    """A learner's records with this school, newest first, without the versions that were corrected."""
    rows = db.exec(select(EppRecord).where(EppRecord.org_id == org_id, EppRecord.user_id == user_id).order_by(col(EppRecord.reviewed_at).desc(), col(EppRecord.id).desc())).all()
    replaced = superseded_ids(db, org_id)
    return [row for row in rows if row.id not in replaced]


def history(db: Session, org_id: int, user_id: int) -> list[dict]:
    """The review history a report shows: date, who, and the outcome."""
    return [{"date": row.reviewed_at, "reviewer": row.reviewed_by_name, "outcome": row.outcome, "kind": row.kind, "school_year": row.school_year}
            for row in current(db, org_id, user_id) if row.kind != "exit"]


def summary(row: EppRecord, superseded: bool = False) -> dict:
    return {
        "record_uuid": row.record_uuid, "kind": row.kind, "version": row.version, "school_year": row.school_year,
        "learner_name": row.learner_name, "student_id": row.student_id, "user_id": row.user_id, "outcome": row.outcome,
        "reviewed_by": row.reviewed_by_name, "reviewed_at": row.reviewed_at, "superseded": superseded,
        "record_id": f"EPP-{row.student_id or row.id}-{row.school_year}-v{row.version}",
    }


def record_dto(db: Session, row: EppRecord) -> dict:
    older = db.get(EppRecord, row.supersedes_id) if row.supersedes_id else None
    return {
        **summary(row, row.id in superseded_ids(db, row.org_id)),
        "staff_comment": row.staff_comment, "learner_comment": row.learner_comment, "report": row.data,
        "corrects": older.record_uuid if older else None, "correction_reason": (row.data.get("review") or {}).get("correction_reason"),
    }


def _freeze(db: Session, org_id: int, user_id: int, kind: str, by: User | None, outcome: str = "", staff_comment: str = "", learner_comment: str = "") -> EppRecord:
    data = report.build(db, org_id, user_id)
    learner = db.get(User, user_id)
    now = _now()
    reviewer = shown_name(by) if by else ""
    data["review"] = {"kind": kind, "version": 1, "date": now, "reviewer": reviewer, "outcome": outcome,
                      "staff_comment": staff_comment, "learner_comment": learner_comment}
    if kind != "exit":
        data["reviews"] = [{"date": now, "reviewer": reviewer, "outcome": outcome, "kind": kind, "school_year": data["school_year"]}, *data.get("reviews", [])]
        progress = next((item for item in data["components"] if item["key"] == "progress"), None)
        if progress:
            progress.update(status="reviewed", detail="Reviewed this year")
    row = EppRecord(record_uuid=f"epprecord_{uuid4().hex}", org_id=org_id, user_id=user_id, learner_name=shown_name(learner) if learner else data["learner"]["name"],
                    student_id=data["learner"].get("student_id"), school_year=data["school_year"], kind=kind, schema_version=data["schema_version"], data=data,
                    outcome=outcome, staff_comment=staff_comment, learner_comment=learner_comment, reviewed_by_user_id=by.id if by else None,
                    reviewed_by_name=reviewer, reviewed_at=now, creation_date=now, update_date=now)
    db.add(row)
    return row


def review(db: Session, current_user: PublicUser, org_id: int, user_id: int, payload: EppRecordCreate) -> dict:
    """Staff save the live report as reviewed with the learner."""
    support.require_support(db, org_id, current_user.id, user_id)
    if payload.kind not in RECORD_KINDS or payload.kind == "exit":
        raise HTTPException(status_code=422, detail="A review is annual, final or for a transfer")
    row = _freeze(db, org_id, user_id, payload.kind, db.get(User, current_user.id), payload.outcome.strip(), payload.staff_comment.strip(), payload.learner_comment.strip())
    db.commit()
    return record_dto(db, row)


def get_record(db: Session, current_user: PublicUser, org_id: int, record_uuid: str) -> EppRecord:
    _require_staff(db, current_user, org_id)
    row = db.exec(select(EppRecord).where(EppRecord.record_uuid == record_uuid, EppRecord.org_id == org_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    return row


def correct(db: Session, current_user: PublicUser, org_id: int, record_uuid: str, payload: EppRecordCorrection) -> dict:
    """A new version of a record with the outcome, comments or student ID fixed. The old one stays."""
    old = get_record(db, current_user, org_id, record_uuid)
    if old.id in superseded_ids(db, org_id):
        raise HTTPException(status_code=409, detail="A newer version of this record exists. Correct that one.")
    by = db.get(User, current_user.id)
    now = _now()
    values = {key: value.strip() if isinstance(value, str) else value for key, value in payload.model_dump(exclude_unset=True).items()}
    data = dict(old.data)
    data["learner"] = {**data.get("learner", {}), **({"student_id": values["student_id"] or None} if "student_id" in values else {})}
    row = EppRecord(record_uuid=f"epprecord_{uuid4().hex}", org_id=org_id, user_id=old.user_id, learner_name=old.learner_name,
                    student_id=data["learner"].get("student_id"), school_year=old.school_year, kind=old.kind, version=old.version + 1, supersedes_id=old.id,
                    schema_version=old.schema_version, outcome=values.get("outcome", old.outcome), staff_comment=values.get("staff_comment", old.staff_comment),
                    learner_comment=values.get("learner_comment", old.learner_comment), reviewed_by_user_id=old.reviewed_by_user_id,
                    reviewed_by_name=old.reviewed_by_name, reviewed_at=old.reviewed_at, data={}, creation_date=now, update_date=now)
    data["review"] = {**(data.get("review") or {}), "version": row.version, "outcome": row.outcome, "staff_comment": row.staff_comment,
                      "learner_comment": row.learner_comment, "correction_reason": values["reason"], "corrected_by": shown_name(by) if by else "", "corrected_at": now}
    if data.get("reviews") and old.kind != "exit":
        data["reviews"] = [{**data["reviews"][0], "outcome": row.outcome}, *data["reviews"][1:]]
    row.data = data
    db.add(row)
    db.commit()
    return record_dto(db, row)


def open_record(db: Session, current_user: PublicUser, org_id: int, record_uuid: str) -> dict:
    return record_dto(db, get_record(db, current_user, org_id, record_uuid))


def list_records(db: Session, current_user: PublicUser, org_id: int, user_id: int | None = None, include_superseded: bool = False) -> dict:
    """The school's records, newest first: one learner's, or all of them."""
    _require_staff(db, current_user, org_id)
    query = select(EppRecord).where(EppRecord.org_id == org_id)
    if user_id is not None:
        query = query.where(EppRecord.user_id == user_id)
    rows = db.exec(query.order_by(col(EppRecord.reviewed_at).desc(), col(EppRecord.id).desc())).all()
    replaced = superseded_ids(db, org_id)
    return {"records": [summary(row, row.id in replaced) for row in rows if include_superseded or row.id not in replaced]}


def my_records(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """A learner's own reviewed records with a school."""
    replaced = superseded_ids(db, org_id)
    rows = db.exec(select(EppRecord).where(EppRecord.org_id == org_id, EppRecord.user_id == current_user.id).order_by(col(EppRecord.reviewed_at).desc())).all()
    return {"records": [record_dto(db, row) for row in rows if row.id not in replaced]}


def freeze_exits(db: Session, user_id: int, org_id: int | None = None) -> int:
    """Before a learner leaves an organization (or every organization, when their account goes), save an
    exit record wherever a school supports them, and end the link. Doesn't commit."""
    bind = db.get_bind()
    # Some deployments' tests run without these tables; nothing can be supported there.
    if bind is None or not inspect(bind).has_table("learnersupport") or not inspect(bind).has_table("epprecord"):
        return 0
    query = select(LearnerSupport).where(LearnerSupport.user_id == user_id, LearnerSupport.status == "active")
    if org_id is not None:
        query = query.where(LearnerSupport.org_id == org_id)
    made = 0
    for link in db.exec(query).all():
        _freeze(db, link.org_id, user_id, "exit", None, "Left the organization")
        link.status, link.ended_at, link.update_date = "ended", _now(), _now()
        db.add(link)
        made += 1
    if made:
        db.flush()
    return made

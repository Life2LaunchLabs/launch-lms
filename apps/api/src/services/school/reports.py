"""Chat reports, for an organization's admins to review from Users.

An admin sees a report when the chat belongs to their organization, or when the person who
reported or the person reported is one of its members. Each report shows the few messages
before what was reported, so the admin can judge it without opening the chat.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, col, func, select

from src.db.conversations import Conversation, ConversationMessage, ConversationReport
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser
from src.security.org_auth import is_org_admin
from src.services.connect import people, workspace
from src.services.goals.sharing_roles import _stamp

CONTEXT = 6
STATUSES = ("open", "resolved", "dismissed")


def _require_admin(db: Session, current_user: PublicUser, org_id: int) -> None:
    if not is_org_admin(current_user.id, org_id, db):
        raise HTTPException(status_code=403, detail="Only admins can review reports")


def _visible(org_id: int):
    members = select(UserOrganization.user_id).where(UserOrganization.org_id == org_id)
    return (
        select(ConversationReport)
        .outerjoin(Conversation, col(Conversation.id) == ConversationReport.conversation_id)
        .where(or_(Conversation.org_id == org_id, col(ConversationReport.reporter_user_id).in_(members), col(ConversationReport.reported_user_id).in_(members)))
    )


def _context(db: Session, report: ConversationReport) -> list[dict]:
    if not report.conversation_id:
        return []
    statement = select(ConversationMessage).where(ConversationMessage.conversation_id == report.conversation_id)
    if report.message_id:
        statement = statement.where(col(ConversationMessage.id) <= report.message_id)
    else:
        statement = statement.where(ConversationMessage.creation_date <= report.creation_date)
    rows = list(reversed(db.exec(statement.order_by(col(ConversationMessage.id).desc()).limit(CONTEXT)).all()))
    return [{
        "message_uuid": row.message_uuid, "sender": people.person(db, row.sender_user_id), "kind": row.kind,
        "body": workspace.plain(db, row.body, row.refs) if row.refs else row.body,
        "creation_date": row.creation_date, "reported": row.id == report.message_id,
    } for row in rows]


def _member_ids(db: Session, org_id: int, user_ids: set[int]) -> set[int]:
    if not user_ids:
        return set()
    return set(db.exec(select(UserOrganization.user_id).where(UserOrganization.org_id == org_id, col(UserOrganization.user_id).in_(user_ids))).all())


def _report_dict(db: Session, report: ConversationReport, members: set[int]) -> dict:
    conversation = db.get(Conversation, report.conversation_id) if report.conversation_id else None
    message = db.get(ConversationMessage, report.message_id) if report.message_id else None
    return {
        "report_uuid": report.report_uuid, "reason": report.reason, "status": report.status, "creation_date": report.creation_date,
        "reporter": people.person(db, report.reporter_user_id), "reported": people.person(db, report.reported_user_id),
        "reporter_in_org": report.reporter_user_id in members, "reported_in_org": report.reported_user_id in members,
        "chat": {"kind": conversation.kind, "title": conversation.title} if conversation else None,
        # The copy kept at report time, in case the message was deleted since.
        "excerpt": None if message else report.excerpt,
        "messages": _context(db, report),
        "reviewed_by": people.person(db, report.reviewed_by_user_id), "review_date": report.review_date,
    }


def list_reports(db: Session, current_user: PublicUser, org_id: int, status: str = "open") -> dict:
    _require_admin(db, current_user, org_id)
    if status not in STATUSES:
        raise HTTPException(status_code=422, detail="Unknown report status")
    rows = list(db.exec(_visible(org_id).where(ConversationReport.status == status).order_by(col(ConversationReport.id).desc())).all())
    open_count = db.exec(select(func.count()).select_from(_visible(org_id).where(ConversationReport.status == "open").subquery())).one()
    total = db.exec(select(func.count()).select_from(_visible(org_id).subquery())).one()
    involved = {user_id for row in rows for user_id in (row.reporter_user_id, row.reported_user_id) if user_id}
    members = _member_ids(db, org_id, involved)
    return {"status": status, "open": open_count, "total": total, "reports": [_report_dict(db, row, members) for row in rows]}


def review(db: Session, current_user: PublicUser, org_id: int, report_uuid: str, status: str) -> dict:
    """Resolve, dismiss or reopen a report. It changes for every organization that can see it."""
    _require_admin(db, current_user, org_id)
    report = db.exec(_visible(org_id).where(ConversationReport.report_uuid == report_uuid)).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = status
    report.reviewed_by_user_id = None if status == "open" else current_user.id
    report.review_date = None if status == "open" else _stamp()
    db.add(report)
    db.commit()
    db.refresh(report)
    return _report_dict(db, report, _member_ids(db, org_id, {item for item in (report.reporter_user_id, report.reported_user_id) if item}))

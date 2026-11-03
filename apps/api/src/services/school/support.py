"""School support: a school asks to support a learner, the learner accepts a consent card, and staff can open them.

The one access check is `require_support`: staff of the organization, an active link, and the learner still
a learner there. Anything the school sees about a learner for their Education Plan and Profile goes through
it, so ending the link (by the learner or by staff) stops access at once. Superadmins get no way around it.

For the pilot any staff member of the organization may ask, open, edit and end; narrowing that to a
learner's counselor or teachers can come later. Learners accept even when the school set up their account.
The consent wording below needs a privacy review before a real school uses it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.learner_support import DIPLOMA_TRACKS, LearnerSupport, LearnerSupportUpdate
from src.db.organizations import Organization
from src.db.portfolio import Portfolio, PortfolioModerationStatus
from src.db.users import PublicUser, User
from src.services.connect import chats, people
from src.services.school import chats as school_chats, roles

SUPPORT_REQUEST = "support_request"
# Bump when the wording changes, so each link records which version the learner agreed to.
CONSENT_VERSION = "2026-11-pilot"
CONSENT_TEXT = (
    "{org} would like to support your Education Plan and Profile. If you say yes, its staff can see what your "
    "portfolio shares, your plans with them, and your school record (student ID, diploma track and graduation year). "
    "They can't see anything you marked private, or your budget. You can stop this any time."
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _org(db: Session, org_id: int) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _row(db: Session, org_id: int, user_id: int) -> LearnerSupport | None:
    return db.exec(select(LearnerSupport).where(LearnerSupport.org_id == org_id, LearnerSupport.user_id == user_id)).first()


def _is_learner(db: Session, org_id: int, user_id: int) -> bool:
    return roles.org_role(db, org_id, user_id) == "learner"


def _require_staff(db: Session, current_user: PublicUser, org_id: int) -> None:
    # Not roles.require_staff: that lets superadmins in, and a school record is for the school's own staff.
    if not roles.is_staff(db, org_id, current_user.id):
        raise HTTPException(status_code=403, detail="Only the organization's staff can do that")


def _learner(db: Session, org_id: int, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user or not _is_learner(db, org_id, user_id):
        raise HTTPException(status_code=404, detail="They're not a learner here")
    return user


def is_supported(db: Session, org_id: int, staff_user_id: int, learner_id: int) -> bool:
    """Whether this staff member may open this learner's school record right now."""
    if staff_user_id == learner_id or not roles.is_staff(db, org_id, staff_user_id):
        return False
    row = _row(db, org_id, learner_id)
    return bool(row and row.status == "active" and _is_learner(db, org_id, learner_id))


def require_support(db: Session, org_id: int, staff_user_id: int, learner_id: int) -> LearnerSupport:
    """The one access check for a learner's school record. 404 so nobody learns more than "not here"."""
    if not is_supported(db, org_id, staff_user_id, learner_id):
        raise HTTPException(status_code=404, detail="You don't support this learner yet")
    return _row(db, org_id, learner_id)  # type: ignore[return-value]


def _person(db: Session, user_id: int | None) -> dict | None:
    return people.person(db, user_id) if user_id else None


def status_dto(row: LearnerSupport | None) -> dict:
    """What any staff member may know without a link: whether one exists and where it stands."""
    if not row:
        return {"status": "none", "support_uuid": None, "requested_at": None, "consent_at": None, "ended_at": None}
    return {"status": row.status, "support_uuid": row.support_uuid, "requested_at": row.requested_at, "consent_at": row.consent_at, "ended_at": row.ended_at}


def record_dto(db: Session, row: LearnerSupport) -> dict:
    return {
        **status_dto(row), "consent_version": row.consent_version,
        "student_id": row.student_id, "diploma_track": row.diploma_track, "graduation_year": row.graduation_year,
        "counselor": _person(db, row.counselor_user_id), "requested_by": _person(db, row.requested_by_user_id),
    }


def _consent_card(org: Organization, row: LearnerSupport) -> dict:
    return {"type": SUPPORT_REQUEST, "support_uuid": row.support_uuid, "request_uuid": row.request_uuid, "org_id": org.id, "org_name": org.name,
            "org_slug": org.slug, "recipient_user_id": row.user_id, "consent_version": CONSENT_VERSION, "text": CONSENT_TEXT.format(org=org.name)}


def status(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    _require_staff(db, current_user, org_id)
    _learner(db, org_id, user_id)
    return {**status_dto(_row(db, org_id, user_id)), "diploma_tracks": list(DIPLOMA_TRACKS)}


def request(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    """Ask a learner to let the school support them: a consent card in their chat with the organization."""
    _require_staff(db, current_user, org_id)
    _learner(db, org_id, user_id)
    org = _org(db, org_id)
    row = _row(db, org_id, user_id)
    if row and row.status in ("requested", "active"):
        return status_dto(row)
    now = _now()
    if not row:
        row = LearnerSupport(support_uuid=f"support_{uuid4().hex}", org_id=org_id, user_id=user_id, request_uuid="", creation_date=now)
    row.status, row.request_uuid, row.requested_by_user_id, row.requested_at = "requested", f"request_{uuid4().hex}", current_user.id, now
    row.consent_at = row.consent_version = row.ended_at = row.ended_by_user_id = None
    row.update_date = now
    db.add(row)
    db.flush()
    conversation = school_chats.school_chat(db, org_id, user_id)
    chats.post(db, conversation, current_user.id, f"{org.name} would like to support your Education Plan and Profile", kind="card", card=_consent_card(org, row))
    db.commit()
    return status_dto(row)


def _mine(db: Session, current_user: PublicUser, support_uuid: str) -> LearnerSupport:
    row = db.exec(select(LearnerSupport).where(LearnerSupport.support_uuid == support_uuid)).first()
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return row


def answer(db: Session, current_user: PublicUser, support_uuid: str, accept: bool, request_uuid: str | None = None) -> dict:
    """The learner says yes or no to the school's ask."""
    row = _mine(db, current_user, support_uuid)
    if row.status != "requested" or (request_uuid and request_uuid != row.request_uuid):
        raise HTTPException(status_code=409, detail="That ask is no longer open")
    now = _now()
    row.status = "active" if accept else "declined"
    if accept:
        row.consent_at, row.consent_version = now, CONSENT_VERSION
    row.update_date = now
    db.add(row)
    db.commit()
    return learner_dto(db, row)


def end(db: Session, current_user: PublicUser, support_uuid: str) -> dict:
    """The learner stops the school's access. The school can ask again; it doesn't come back on its own."""
    row = _mine(db, current_user, support_uuid)
    return learner_dto(db, _end(db, row, current_user.id))


def _end(db: Session, row: LearnerSupport, by: int) -> LearnerSupport:
    if row.status in ("requested", "active"):
        now = _now()
        row.status, row.ended_at, row.ended_by_user_id, row.update_date = "ended", now, by, now
        db.add(row)
        db.commit()
    return row


def staff_end(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    _require_staff(db, current_user, org_id)
    row = _row(db, org_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return status_dto(_end(db, row, current_user.id))


def update(db: Session, current_user: PublicUser, org_id: int, user_id: int, payload: LearnerSupportUpdate) -> dict:
    """Staff set the school's facts about a learner they support."""
    row = require_support(db, org_id, current_user.id, user_id)
    fields = payload.model_dump(exclude_unset=True)
    if fields.get("diploma_track") and fields["diploma_track"] not in DIPLOMA_TRACKS:
        raise HTTPException(status_code=422, detail="Unknown diploma track")
    if fields.get("counselor_user_id") and not roles.is_staff(db, org_id, int(fields["counselor_user_id"])):
        raise HTTPException(status_code=422, detail="The counselor has to be on the organization's staff")
    if "student_id" in fields:
        fields["student_id"] = (fields["student_id"] or "").strip() or None
    for key, value in fields.items():
        setattr(row, key, value)
    row.update_date = _now()
    db.add(row)
    db.commit()
    return record_dto(db, row)


def open_learner(db: Session, current_user: PublicUser, org_id: int, user_id: int) -> dict:
    """A supported learner, as the school sees them: their school record and what their portfolio shares."""
    from src.services import portfolio as portfolio_service

    row = require_support(db, org_id, current_user.id, user_id)
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    shell = None
    if portfolio and portfolio_service._enum_value(portfolio.moderation_status) == PortfolioModerationStatus.CLEAR.value:
        shell = portfolio_service.portfolio_shell(portfolio, db, public_only=True)
    return {"learner": _person(db, user_id), "record": record_dto(db, row), "portfolio": shell}


def learner_dto(db: Session, row: LearnerSupport) -> dict:
    org = db.get(Organization, row.org_id)
    return {**status_dto(row), "org": {"id": org.id, "name": org.name, "slug": org.slug, "org_uuid": org.org_uuid} if org else None}


def mine(db: Session, current_user: PublicUser) -> dict:
    """The schools supporting this learner, or asking to."""
    rows = db.exec(select(LearnerSupport).where(LearnerSupport.user_id == current_user.id)).all()
    return {"supports": [learner_dto(db, row) for row in rows if row.status in ("requested", "active")]}


def live(db: Session, card: dict | None, viewer_id: int) -> dict | None:
    """A consent card as it stands now: waiting, accepted, declined, ended, or replaced by a later ask."""
    if not card or card.get("type") != SUPPORT_REQUEST:
        return card
    row = db.exec(select(LearnerSupport).where(LearnerSupport.support_uuid == card.get("support_uuid"))).first()
    if not row or row.request_uuid != card.get("request_uuid"):
        state = "expired"
    else:
        state = {"requested": "pending", "active": "accepted"}.get(row.status, row.status)
    return {**card, "state": state, "for_me": card.get("recipient_user_id") == viewer_id}


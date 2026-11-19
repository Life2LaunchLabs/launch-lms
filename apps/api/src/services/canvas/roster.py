"""A Canvas course's class list, pulled into its group as invitations (DEV-193).

Canvas offers the class list through LTI Names and Role Provisioning Services when the school's developer key
has the read-only membership scope; a launch from the course names the list's address. We ask Canvas for a
short token (a client credentials grant signed with Life2Launch's LTI key) and read the course's active students.

Organizations don't own learners, so a pull never makes accounts or memberships for people outside the school:
- a student already in the school joins the course group, as when staff add someone to a group, and a teacher
  already on the school's staff joins its staff;
- anyone else gets a pending invitation to the school and the course group (students as learners, teachers as
  staff), with no email, carrying the names Canvas shared. It fills the usual ways: an existing account accepts
  it, the person signs up from it, or they open Life2Launch from Canvas;
- someone who left the course has their pending invitation withdrawn (members stay: that's the school's call);
- anyone the school removed is left alone.

Class list invitations hold seats like any invitation (security/access CLASS_LIST_INVITATION_SOURCE), so the
school sees its classes against its limits. A pull still invites everyone when that goes over; those people can
join once a seat is free (or the school moves to Full), and the group page says so. A pull runs when a teacher
opens Life2Launch from the course (at most every PULL_INTERVAL_SECONDS) and when staff who manage learners press
Update from Canvas.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.canvas import CanvasConnection, CanvasCourseGroup, CanvasUserLink
from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.db.users import User
from src.security.access.access import CLASS_LIST_INVITATION_SOURCE
from src.services.canvas.nrps import (  # noqa: F401  (callers and tests read these from roster)
    MAX_MEMBERS, NO_SCOPE, NOT_OFFERED, NRPS_SCOPE, TIMEOUT, UNREACHABLE, RosterError, _same_host, access_token, fetch_members, token_url,
)

logger = logging.getLogger(__name__)

LEARNER_ROLE_ID = 4
STAFF_ROLE_ID = 2
PULL_INTERVAL_SECONDS = 600  # after a teacher's launch
BUTTON_INTERVAL_SECONDS = 30  # between presses of Update from Canvas
INVITATION_DAYS = 180  # a school term and then some; every pull moves it on


@dataclass
class PullResult:
    invited: int = 0  # new invitations (students and teachers)
    still_invited: int = 0  # invitations already waiting (moved on)
    joined: int = 0  # school members added to the group (or its staff)
    already_in: int = 0  # school members already in the group
    withdrawn: int = 0  # invitations of students no longer in the course
    no_email: int = 0  # students Canvas shared no email for
    removed: int = 0  # people the school removed, left alone


def _now() -> str:
    return str(datetime.now())


def _role_of(member: dict) -> int | None:
    """STAFF_ROLE_ID for a course's teachers, LEARNER_ROLE_ID for its students, None for anyone else (observers,
    people no longer active)."""
    from src.services.canvas.people import is_staff_launch

    roles = [str(role) for role in member.get("roles") or []]
    if (member.get("status") or "Active") != "Active":
        return None
    if is_staff_launch(roles):
        return STAFF_ROLE_ID
    if any(role.endswith("membership#Learner") or role == "Learner" for role in roles):
        return LEARNER_ROLE_ID
    return None


def _email(member: dict) -> str | None:
    from src.services.orgs.users import normalize_email

    raw = (member.get("email") or "").strip()
    if not raw:
        return None
    try:
        return normalize_email(validate_email(raw, check_deliverability=False).normalized)
    except EmailNotValidError:
        return None


def _details(member: dict) -> dict:
    """The names Canvas shared, kept for the group page and for the sign-up form."""
    given, family = (str(member.get("given_name") or "").strip()[:100], str(member.get("family_name") or "").strip()[:100])
    name = (str(member.get("name") or "").strip() or " ".join(filter(None, [given, family])))[:200]
    return {"name": name, "given_name": given, "family_name": family}


def invited_details(link: CanvasCourseGroup | None, email: str) -> dict:
    """What a class list knows about someone it invited (older pulls kept just a name)."""
    value = (link.invited_names or {}).get(email) if link is not None else None
    if isinstance(value, dict):
        return {"name": str(value.get("name") or ""), "given_name": str(value.get("given_name") or ""),
                "family_name": str(value.get("family_name") or "")}
    return {"name": str(value or ""), "given_name": "", "family_name": ""}


def _resolve_inbox(db: Session, invitation: OrganizationInvitation, accepted: bool) -> None:
    from src.services.messages import resolve_action_by_dedupe

    resolve_action_by_dedupe(db, f"organization_invitation:{invitation.invitation_uuid}", accepted=accepted)


def _pending(db: Session, org_id: int, group_id: int) -> list[OrganizationInvitation]:
    return list(db.exec(select(OrganizationInvitation).where(
        OrganizationInvitation.org_id == org_id,
        OrganizationInvitation.usergroup_id == group_id,
        OrganizationInvitation.source == CLASS_LIST_INVITATION_SOURCE,
        OrganizationInvitation.status == "pending",
    )).all())


def apply_roster(db: Session, link: CanvasCourseGroup, members: list[dict], actor_id: int | None) -> PullResult:
    """Bring the course group in line with the class list. Commits."""
    from src.services.canvas.courses import add_member, add_staff
    from src.services.messages import create_inbox_message
    from src.services.orgs import removals

    connection = db.get(CanvasConnection, link.connection_id)
    group = db.get(UserGroup, link.usergroup_id)
    if connection is None or group is None:
        raise RosterError("This course's group is gone.")
    org_id = int(connection.org_id)
    org = db.get(Organization, org_id)
    result = PullResult()
    now = datetime.utcnow()
    expires_at = now + timedelta(days=INVITATION_DAYS)
    pending = {invitation.email_normalized: invitation for invitation in _pending(db, org_id, int(group.id))}  # type: ignore[arg-type]
    on_list: set[str] = set()
    details: dict[str, dict] = {}

    for member in members:
        role_id = _role_of(member)
        if role_id is None:
            continue
        email = _email(member)
        user = None
        canvas_user_id = str(member.get("user_id") or "")[:255]
        if canvas_user_id:
            linked = db.exec(select(CanvasUserLink.user_id).where(CanvasUserLink.connection_id == connection.id,
                                                                   CanvasUserLink.canvas_user_id == canvas_user_id)).first()
            user = db.get(User, linked) if linked else None
        if user is None and email:
            user = db.exec(select(User).where(func.lower(User.email) == email)).first()
        school_role = db.exec(select(UserOrganization.role_id).where(
            UserOrganization.org_id == org_id, UserOrganization.user_id == user.id,
        )).first() if user is not None else None
        if school_role is not None:
            if email:
                on_list.add(email)
            # Teachers join the group's staff if they're on the school's; the school decides who its staff are.
            if role_id == STAFF_ROLE_ID and school_role != LEARNER_ROLE_ID:
                added = add_staff(db, group, int(user.id))  # type: ignore[arg-type,union-attr]
            elif role_id == LEARNER_ROLE_ID:
                added = add_member(db, group, int(user.id))  # type: ignore[arg-type,union-attr]
            else:
                continue
            if added:
                result.joined += 1
            else:
                result.already_in += 1
            continue
        if not email:
            result.no_email += 1
            continue
        if user is not None and removals.is_removed(db, org_id, user.id):
            result.removed += 1
            continue
        on_list.add(email)
        details[email] = _details(member)
        invitation = pending.get(email)
        if invitation is not None:
            if invitation.expires_at < expires_at or invitation.role_id != role_id:
                invitation.expires_at = max(invitation.expires_at, expires_at)
                invitation.role_id = role_id  # a student made a TA, or the other way round
                invitation.updated_at = now
                db.add(invitation)
            result.still_invited += 1
            continue
        invitation = OrganizationInvitation(
            invitation_uuid=f"org_invitation_{uuid4()}",
            org_id=org_id,
            email=email,
            email_normalized=email,
            role_id=role_id,
            usergroup_id=int(group.id),  # type: ignore[arg-type]
            target_user_id=int(user.id) if user is not None else None,  # type: ignore[arg-type]
            # Canvas names a course's teachers, not the person pulling: a staff invitation must not lean on whether
            # the puller may grant staff roles (invitation_security checks a creator's authority at acceptance).
            created_by_user_id=actor_id if role_id == LEARNER_ROLE_ID else None,
            source=CLASS_LIST_INVITATION_SOURCE,
            delivery_status="not_sent",
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )
        db.add(invitation)
        db.flush()
        pending[email] = invitation
        school = org.name if org else "your school"
        create_inbox_message(
            db,
            recipient_user_id=int(user.id) if user is not None else None,  # type: ignore[arg-type]
            recipient_email=email,
            sender_org_id=org_id,
            sender_user_id=actor_id,
            message_type="invitation",
            subject=f"Invitation to join {school}",
            body=f"{school} invited you to {group.name} on Life2Launch, from your Canvas course.",
            action_kind="organization_invitation",
            action_data={"invitation_uuid": invitation.invitation_uuid},
            dedupe_key=f"organization_invitation:{invitation.invitation_uuid}",
        )
        result.invited += 1

    for email, invitation in pending.items():
        if email in on_list:
            continue
        invitation.status = "revoked"
        invitation.revoked_at = now
        invitation.updated_at = now
        db.add(invitation)
        _resolve_inbox(db, invitation, accepted=False)
        result.withdrawn += 1

    link.invited_names = {email: details[email] for email in pending if email in details}
    link.roster_pulled_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    link.roster_error = None
    link.update_date = _now()
    db.add(link)
    db.commit()
    return result


def _claim(link_id: int, seconds: int, kind: str) -> bool:
    """Not more than one pull of this kind (``launch`` or ``button``) per course every ``seconds``; True when this
    caller may pull. A pull applied twice changes nothing, so the two kinds don't wait for each other."""
    from src.services.canvas.launch import _redis

    try:
        return bool(_redis().set(f"lti:roster:{kind}:{link_id}", "1", ex=seconds, nx=True))
    except Exception as error:  # Redis down: the pull still runs; applying a class list twice changes nothing.
        logger.info("Class list pull lock unavailable: %s", error)
        return True


def pull(db: Session, link: CanvasCourseGroup, actor_id: int | None, client: httpx.Client | None = None) -> PullResult:
    """Read the course's class list from Canvas and apply it. Raises RosterError (and records it on the link)."""
    connection = db.get(CanvasConnection, link.connection_id)
    try:
        if connection is None or not connection.enabled:
            raise RosterError("Your school's Canvas connection is switched off.")
        if not link.memberships_url:
            raise RosterError(NOT_OFFERED)
        if not _same_host(link.memberships_url, connection):
            raise RosterError(NOT_OFFERED)
        own_client = client is None
        client = client or httpx.Client(timeout=TIMEOUT, follow_redirects=False)
        try:
            token = access_token(db, connection, client)
            members = fetch_members(connection, link.memberships_url, token, client)
        finally:
            if own_client:
                client.close()
        result = apply_roster(db, link, members, actor_id)
    except RosterError as error:
        db.rollback()
        link = db.get(CanvasCourseGroup, link.id) or link
        link.roster_error = error.message
        link.update_date = _now()
        db.add(link)
        db.commit()
        raise
    _audit(db, link, actor_id, result)
    return result


def _audit(db: Session, link: CanvasCourseGroup, actor_id: int | None, result: PullResult) -> None:
    from src.services.audit_logs import record_audit_log

    connection = db.get(CanvasConnection, link.connection_id)
    try:
        record_audit_log(db, action="canvas.class_list_pull", resource="usergroup", status_code=200,
                         resource_id=str(link.usergroup_id), org_id=connection.org_id if connection else None,
                         user_id=actor_id, request_metadata=asdict(result))
    except Exception:  # an audit hiccup never undoes the pull
        logger.exception("Couldn't record the class list pull")


def pull_after_launch(link_id: int, teacher_id: int) -> None:
    """Background task after a teacher's launch: pull unless one ran in the last PULL_INTERVAL_SECONDS."""
    from src.core.events.database import engine

    if not _claim(link_id, PULL_INTERVAL_SECONDS, "launch"):
        return
    with Session(engine) as db:
        link = db.get(CanvasCourseGroup, link_id)
        if link is None or not link.memberships_url:
            return
        try:
            pull(db, link, teacher_id)
        except RosterError as error:
            logger.info("Class list pull for course group %s: %s", link_id, error.message)
        except Exception:
            logger.exception("Class list pull for course group %s failed", link_id)


def pull_now(db: Session, user_id: int, org_id: int, group_id: int) -> dict:
    """Update from Canvas: staff who can change the group's people pull its class list now."""
    from src.security.org_auth import is_org_admin

    link = _link_for(db, org_id, group_id)
    if link is None:
        raise HTTPException(status_code=404, detail="This group isn't a Canvas course.")
    if not is_org_admin(user_id, org_id, db, "manage_learners"):
        raise HTTPException(status_code=403, detail="You can't change this group's people.")
    if not _claim(int(link.id), BUTTON_INTERVAL_SECONDS, "button"):  # type: ignore[arg-type]
        raise HTTPException(status_code=429, detail="Canvas was just asked. Try again in a moment.")
    try:
        result = pull(db, link, user_id)
    except RosterError as error:
        raise HTTPException(status_code=409, detail=error.message) from error
    return {**asdict(result), "canvas": summary(db, link, user_id)}


def _link_for(db: Session, org_id: int, group_id: int) -> CanvasCourseGroup | None:
    return db.exec(select(CanvasCourseGroup).join(CanvasConnection, CanvasConnection.id == CanvasCourseGroup.connection_id).where(
        CanvasCourseGroup.usergroup_id == group_id, CanvasConnection.org_id == org_id)).first()


def summary(db: Session, link: CanvasCourseGroup, viewer_id: int) -> dict:
    """What a course group's page shows about its class list: who is still invited, the last pull, what staff can do."""
    from src.security.org_auth import is_org_admin

    connection = db.get(CanvasConnection, link.connection_id)
    group_id = int(link.usergroup_id)
    now = datetime.utcnow()
    invitations = [invitation for invitation in _pending(db, int(connection.org_id), group_id) if invitation.expires_at > now] if connection else []
    names = {invitation.email_normalized: invited_details(link, invitation.email_normalized)["name"] for invitation in invitations}
    # Teachers first, then by name.
    invitations.sort(key=lambda invitation: (invitation.role_id == LEARNER_ROLE_ID, (names[invitation.email_normalized] or invitation.email).casefold()))
    return {
        "invited": [{"invitation_uuid": invitation.invitation_uuid, "email": invitation.email,
                     "name": names[invitation.email_normalized], "invited_at": invitation.created_at.isoformat(),
                     "role": "learner" if invitation.role_id == LEARNER_ROLE_ID else "staff"}
                    for invitation in invitations],
        "seats": _seats(db, int(connection.org_id)) if connection else {},
        "pulled_at": link.roster_pulled_at,
        "error": link.roster_error,
        "offered": bool(link.memberships_url),
        "can_pull": bool(connection and connection.enabled) and is_org_admin(viewer_id, int(connection.org_id), db, "manage_learners") if connection else False,
    }


def _seats(db: Session, org_id: int) -> dict:
    """The school's learners and staff seats against its limits, class list invitations included, so a class that
    goes over shows it. ``limit`` 0 is unlimited."""
    from src.security.access.access import count_usage, org_access

    access = org_access(org_id, db)
    seats = {}
    for name in ("learners", "staff_seats"):
        limit, used = access.limit(name), count_usage(name, org_id, db)
        seats[name] = {"limit": limit, "used": used, "over": max(0, used - limit) if limit else 0}
    return seats


def summary_for_group(db: Session, org_id: int, group_id: int, viewer_id: int) -> dict | None:
    link = _link_for(db, org_id, group_id)
    return summary(db, link, viewer_id) if link else None


def _join_invited_group(db: Session, org_id: int, invitation: OrganizationInvitation, user_id: int) -> None:
    """A class list invitation's course group: teachers join its staff (if the school made them staff), students
    its members."""
    from src.services.canvas.courses import add_member, add_staff

    group = db.get(UserGroup, invitation.usergroup_id) if invitation.usergroup_id else None
    if group is None or group.org_id != org_id:
        return
    school_role = db.exec(select(UserOrganization.role_id).where(
        UserOrganization.org_id == org_id, UserOrganization.user_id == user_id)).first()
    if invitation.role_id != LEARNER_ROLE_ID and school_role not in (None, LEARNER_ROLE_ID):
        add_staff(db, group, user_id)
    elif invitation.role_id == LEARNER_ROLE_ID:
        add_member(db, group, user_id)


def is_class_list(invitation: OrganizationInvitation | None) -> bool:
    return invitation is not None and invitation.source == CLASS_LIST_INVITATION_SOURCE


def settle_for_member(db: Session, org_id: int, user, accepted: OrganizationInvitation | None = None) -> int:
    """Someone (a User or UserRead) joined the school (from Canvas, an invitation or a link): their class list invitations there
    are accepted and they join those course groups, a teacher as the group's staff. ``accepted`` is the invitation they
    just accepted, when it's a class list one: the accept paths leave its group to this. Commits; returns how many it settled."""
    from src.services.orgs.users import normalize_email

    if user is None or not getattr(user, "email", None) or not getattr(user, "id", None):
        return 0
    if is_class_list(accepted) and accepted.org_id == org_id:  # type: ignore[union-attr]
        _join_invited_group(db, org_id, accepted, int(user.id))  # type: ignore[arg-type]
        db.commit()
    invitations = db.exec(select(OrganizationInvitation).where(
        OrganizationInvitation.org_id == org_id,
        OrganizationInvitation.email_normalized == normalize_email(str(user.email)),
        OrganizationInvitation.source == CLASS_LIST_INVITATION_SOURCE,
        OrganizationInvitation.status == "pending",
    )).all()
    now = datetime.utcnow()
    settled = 0
    for invitation in invitations:
        _join_invited_group(db, org_id, invitation, int(user.id))
        invitation.status = "accepted"
        invitation.target_user_id = user.id
        invitation.accepted_at = now
        invitation.updated_at = now
        db.add(invitation)
        _resolve_inbox(db, invitation, accepted=True)
        link = db.exec(select(CanvasCourseGroup).where(CanvasCourseGroup.usergroup_id == invitation.usergroup_id)).first() if invitation.usergroup_id else None
        if link is not None and invitation.email_normalized in (link.invited_names or {}):
            link.invited_names = {k: v for k, v in link.invited_names.items() if k != invitation.email_normalized}
            db.add(link)
        settled += 1
    if settled:
        db.commit()
    return settled

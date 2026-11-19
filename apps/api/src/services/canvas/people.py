"""Who a Canvas launch is: find or make their account, keep them in the school's organization with the right role.

Canvas Instructor, Teaching Assistant and Designer become Staff with the default staff permissions;
Learner becomes Learner; Canvas account admins become Staff, never Admin (Admin stays something the school
gives inside Life2Launch). An email alone never hands over an account outside the school's organization.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.canvas import CanvasUserLink
from src.services.users.account_emails import find_user
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.security.access.access import require_role_capacity
from src.services.auth.usernames import generate_username
from src.services.orgs.owner import ensure_owner_membership
from src.services.canvas.launch import Launch, LaunchError
from src.security.security import security_hash_password

logger = logging.getLogger(__name__)

ADMIN_ROLE_ID = 1
STAFF_ROLE_ID = 2
LEARNER_ROLE_ID = 4

_STAFF_ROLES = (
    "membership#Instructor",
    "membership/Instructor#",  # Instructor sub-roles, e.g. #TeachingAssistant
    "membership#TeachingAssistant",
    "membership#ContentDeveloper",  # Canvas Designer
    "membership#Administrator",
    "institution/person#Administrator",  # Canvas account admin
    "system/person#SysAdmin",
    "system/person#Administrator",
)


def is_staff_launch(roles: list[str]) -> bool:
    return any(marker in role for role in roles for marker in _STAFF_ROLES)


class NeedsAccountLink(LaunchError):
    """The email belongs to an account outside this organization: the person signs in once to link it."""

    def __init__(self):
        super().__init__(
            "There's already a Life2Launch account with your email. Sign in to it once to link it to your school's Canvas.",
            409,
        )


class ChooseAccount(LaunchError):
    """No account has this Canvas email yet: the person says they're new, or signs in to the account they have (DEV-199)."""

    def __init__(self):
        super().__init__("New to Life2Launch, or already on it?", 409)


class SchoolFull(LaunchError):
    """The school has no seat left for this person: a plain message for them, a notice for the school's admins."""

    def __init__(self, staff: bool):
        super().__init__(
            "Your school has used all its staff places on Life2Launch. Your school's Life2Launch admin has been told."
            if staff else
            "Your school has reached the number of students who can use Life2Launch right now. "
            "Your school's Life2Launch admin has been told, so try again later.",
            403,
        )


def _now() -> str:
    return str(datetime.now())


def _membership(db: Session, user_id: int, org_id: int) -> UserOrganization | None:
    return db.exec(
        select(UserOrganization).where(UserOrganization.user_id == user_id, UserOrganization.org_id == org_id)
    ).first()


def _tell_admins_school_is_full(db: Session, launch: Launch, staff: bool) -> None:
    """One notice a day per organization and kind of seat, to each of its admins (sent by the outbox worker)."""
    from src.services.notifications.outbox import notify

    org_id = launch.connection.org_id
    seat = "staff_seats" if staff else "learners"
    admins = db.exec(select(UserOrganization.user_id).where(
        UserOrganization.org_id == org_id, UserOrganization.role_id == ADMIN_ROLE_ID,
    )).all()
    day = datetime.now().date().isoformat()
    for admin_id in admins:
        notify(db, "seat_limit_reached", admin_id, org_id=org_id, dedupe_key=f"seat_limit_reached:{org_id}:{seat}:{day}:{admin_id}",
               data={"seat": seat, "person_name": launch.name or " ".join(filter(None, [launch.given_name, launch.family_name])),
                     "course_title": launch.course_title or ""})
    db.commit()


def _require_seat(db: Session, launch: Launch, role_id: int) -> None:
    staff = role_id != LEARNER_ROLE_ID
    try:
        # Class lists may invite more people than the school has seats for; someone arriving from Canvas needs a
        # seat free of them (they may be on one), as accepting a class list invitation does (DEV-193).
        require_role_capacity(db.get(Role, role_id), launch.connection.org_id, db, class_lists=False)
    except HTTPException as error:
        if error.status_code != 403:
            raise
        db.rollback()
        _tell_admins_school_is_full(db, launch, staff)
        raise SchoolFull(staff) from error


def _ensure_member(db: Session, launch: Launch, user: User, staff: bool) -> UserOrganization:
    org_id = launch.connection.org_id
    membership = _membership(db, int(user.id), org_id)
    wanted = STAFF_ROLE_ID if staff else LEARNER_ROLE_ID
    if membership is None:
        _require_seat(db, launch, wanted)
        membership = UserOrganization(user_id=user.id, org_id=org_id, role_id=wanted,
                                      creation_date=_now(), update_date=_now())
        db.add(membership)
    elif staff and membership.role_id == LEARNER_ROLE_ID:
        # A learner Canvas now says teaches here becomes staff (never the other way: that's the school's call).
        _require_seat(db, launch, STAFF_ROLE_ID)
        membership.role_id = STAFF_ROLE_ID
        membership.update_date = _now()
        db.add(membership)
    return membership


def _link(db: Session, launch: Launch, user: User) -> None:
    db.add(CanvasUserLink(connection_id=launch.connection.id, user_id=user.id,
                          canvas_user_id=launch.canvas_user_id, creation_date=_now()))


def _create_user(db: Session, launch: Launch) -> User:
    first = launch.given_name or (launch.name.split(" ")[0] if launch.name else "")
    last = launch.family_name or (" ".join(launch.name.split(" ")[1:]) if launch.name else "")
    user = User(
        email=launch.email,
        username=generate_username(launch.email, db),
        first_name=first[:100],
        last_name=last[:100],
        password=security_hash_password(secrets.token_urlsafe(32)),
        user_uuid=f"user_{uuid4()}",
        email_verified=True,  # Canvas vouches for it, like a school SSO
        creation_date=_now(),
        update_date=_now(),
    )
    db.add(user)
    db.flush()
    return user


def resolve_person(db: Session, launch: Launch, new_ok: bool = False) -> tuple[User, UserOrganization, bool]:
    """The account this launch signs in, its membership, and whether the account is new. Without ``new_ok`` (the
    person said they're new), an email no account has asks first, so someone already on Life2Launch can sign in."""
    org_id = launch.connection.org_id
    staff = is_staff_launch(launch.roles)
    created = False
    link = db.exec(select(CanvasUserLink).where(
        CanvasUserLink.connection_id == launch.connection.id,
        CanvasUserLink.canvas_user_id == launch.canvas_user_id,
    )).first()
    user = db.get(User, link.user_id) if link else None
    if user is None:
        user = find_user(db, launch.email)  # main or spare email (DEV-197)
        if user is not None:
            if _membership(db, int(user.id), org_id) is None:
                raise NeedsAccountLink()
        elif not new_ok:
            raise ChooseAccount()
        else:
            # Check the seat before making an account, so a full school doesn't collect empty accounts.
            _require_seat(db, launch, STAFF_ROLE_ID if staff else LEARNER_ROLE_ID)
            user = _create_user(db, launch)
            created = True
        _link(db, launch, user)
    membership = _finish(db, launch, user, staff)
    if created:
        from src.services.messages import create_welcome_message_safely

        create_welcome_message_safely(db, int(user.id or 0))
    return user, membership, created


def _finish(db: Session, launch: Launch, user: User, staff: bool) -> UserOrganization:
    from src.services.canvas.courses import join_course_group

    membership = _ensure_member(db, launch, user, staff)
    # Every account also belongs to Life2Launch itself, or the main site greets them with a join banner.
    ensure_owner_membership(db, int(user.id))
    db.flush()
    # The Canvas course's group: staff of the school join it as staff, whatever Canvas calls them in this course.
    join_course_group(db, launch, user, staff or membership.role_id in (ADMIN_ROLE_ID, STAFF_ROLE_ID))
    db.commit()
    # Their class list invitations, from this course or others at the school, are taken up now (DEV-193).
    from src.services.canvas.roster import settle_for_member

    settle_for_member(db, launch.connection.org_id, user)
    db.refresh(user)
    db.refresh(membership)
    return membership


def emails_match(a: str | None, b: str | None) -> bool:
    return bool(a and b and a.strip().lower() == b.strip().lower())


def can_link(db: Session, user, canvas_email: str | None) -> bool:
    """Whether this signed-in account may take this Canvas identity: the Canvas email is one of its emails, or no
    account has it yet (it's then added to this one, DEV-199)."""
    from src.services.users import account_emails

    owner = account_emails.find_user(db, canvas_email)
    return owner is None or owner.id == user.id


def link_signed_in_person(db: Session, launch: Launch, user: User) -> UserOrganization:
    """Sign in once to link: this Canvas identity now opens the account, the Canvas email joins its emails if it
    wasn't one (Canvas vouches for it), and they join the school with their Canvas role."""
    from src.services.users import account_emails

    if not can_link(db, user, launch.email):
        raise LaunchError("Sign in with the account that uses your school email to link it.", 403)
    account_emails.add_verified(db, user, launch.email, source="canvas")
    existing = db.exec(select(CanvasUserLink).where(
        CanvasUserLink.connection_id == launch.connection.id,
        CanvasUserLink.canvas_user_id == launch.canvas_user_id,
    )).first()
    if existing is None:
        _link(db, launch, user)
    elif existing.user_id != user.id:
        raise LaunchError("This Canvas account is already linked to another Life2Launch account.", 409)
    return _finish(db, launch, user, is_staff_launch(launch.roles))

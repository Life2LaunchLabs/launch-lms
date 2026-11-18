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

from sqlmodel import Session, select

from src.db.canvas import CanvasUserLink
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


def _now() -> str:
    return str(datetime.now())


def _membership(db: Session, user_id: int, org_id: int) -> UserOrganization | None:
    return db.exec(
        select(UserOrganization).where(UserOrganization.user_id == user_id, UserOrganization.org_id == org_id)
    ).first()


def _ensure_member(db: Session, user: User, org_id: int, staff: bool) -> UserOrganization:
    membership = _membership(db, int(user.id), org_id)
    wanted = STAFF_ROLE_ID if staff else LEARNER_ROLE_ID
    if membership is None:
        require_role_capacity(db.get(Role, wanted), org_id, db)
        membership = UserOrganization(user_id=user.id, org_id=org_id, role_id=wanted,
                                      creation_date=_now(), update_date=_now())
        db.add(membership)
    elif staff and membership.role_id == LEARNER_ROLE_ID:
        # A learner Canvas now says teaches here becomes staff (never the other way: that's the school's call).
        require_role_capacity(db.get(Role, STAFF_ROLE_ID), org_id, db)
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


def resolve_person(db: Session, launch: Launch) -> tuple[User, UserOrganization, bool]:
    """The account this launch signs in, its membership, and whether the account is new."""
    org_id = launch.connection.org_id
    staff = is_staff_launch(launch.roles)
    created = False
    link = db.exec(select(CanvasUserLink).where(
        CanvasUserLink.connection_id == launch.connection.id,
        CanvasUserLink.canvas_user_id == launch.canvas_user_id,
    )).first()
    user = db.get(User, link.user_id) if link else None
    if user is None:
        user = db.exec(select(User).where(User.email == launch.email)).first()
        if user is not None:
            if _membership(db, int(user.id), org_id) is None:
                raise NeedsAccountLink()
        else:
            # Check the seat before making an account, so a full school doesn't collect empty accounts.
            require_role_capacity(db.get(Role, STAFF_ROLE_ID if staff else LEARNER_ROLE_ID), org_id, db)
            user = _create_user(db, launch)
            created = True
        _link(db, launch, user)
    membership = _ensure_member(db, user, org_id, staff)
    # Every account also belongs to Life2Launch itself, or the main site greets them with a join banner.
    ensure_owner_membership(db, int(user.id))
    db.commit()
    db.refresh(user)
    db.refresh(membership)
    from src.routers.users import _invalidate_session_cache

    _invalidate_session_cache(user.id)
    if created:
        from src.services.messages import create_welcome_message_safely

        create_welcome_message_safely(db, int(user.id or 0))
    return user, membership, created

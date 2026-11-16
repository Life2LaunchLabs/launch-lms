"""The email that goes with an invitation to a plan: to start it as its learner, or to help on it.

The invitation itself is a card in the person's chats (services/connect/inbox.py), which they see
once they sign in with the invited address; the email is how they hear about it. The link opens
that invitation (web: connect/invitation/<uuid>, which finds its chat), or, for an address with no
account yet, signup with it filled in and the invitation as where to go once they've set up.
"""

import html
import logging
from urllib.parse import quote, urlencode

from sqlmodel import Session, func, select

from src.db.goal_sharing import PlanInvitation, PlanInvitationKind, PlanRole
from src.db.goals import Goal
from src.db.organizations import Organization
from src.db.users import User
from src.services.email.utils import send_email
from src.services.oauth.config import frontend_url
from src.services.orgs.owner import owner_org

logger = logging.getLogger(__name__)


def invitation_path(org: Organization | None, invitation: PlanInvitation) -> str:
    """Where one invitation opens on the site: its card, in the chat it waits in."""
    return f"{'/orgs/' + org.slug if org else ''}/connect/invitation/{quote(invitation.invitation_uuid, safe='')}"


# What each sharing role lets someone do, in words an 11-year-old would follow (FEED-134/140).
ROLE_MEANS = {
    "viewer": "you can see the plan and how it's going",
    "commenter": "you can see the plan and leave comments on it",
    "editor": "you can check off steps, add new ones and change the plan",
    "plan_admin": "you can change the plan and choose who else works on it",
}


def goes_by(user: User | None) -> str:
    """The name someone goes by, never their email address."""
    if not user:
        return ""
    return (user.preferred_name or "").strip() or " ".join(part for part in (user.first_name, user.last_name) if part) or f"@{user.username}"


def _first_name(user: User | None) -> str:
    if not user:
        return ""
    return ((user.preferred_name or "").strip() or (user.first_name or "").strip()).split(" ")[0]


def _value(item) -> str:
    return getattr(item, "value", item) or ""


def inviter_label(db: Session, goal: Goal, invitation: PlanInvitation) -> str:
    """Who sent it: the person by name, with their organization when the plan is the organization's."""
    inviter = db.get(User, invitation.invited_by_user_id) if invitation.invited_by_user_id else None
    who = goes_by(inviter)
    org = db.get(Organization, goal.org_id) if goal.org_id and _value(goal.ownership) == "external" else None
    if who and org:
        return f"{who} at {org.name}"
    return who or (org.name if org else "Someone on Life2Launch")


def invitation_text(db: Session, goal: Goal, invitation: PlanInvitation, role: PlanRole | None = None) -> str:
    """One sentence: who invited you, to what, and in plain words what you'll be able to do."""
    role = role or (db.get(PlanRole, invitation.role_id) if invitation.role_id else None)
    sender = inviter_label(db, goal, invitation)
    if _value(invitation.kind) == PlanInvitationKind.SUBJECT.value:
        return f"{sender} invited you to start {goal.title}. It's your plan to work through, one step at a time."
    means = ROLE_MEANS.get(role.key if role else "")
    if role and means:
        article = "an" if role.name[:1].lower() in "aeiou" else "a"
        return f"{sender} invited you to work on {goal.title} with them as {article} {role.name}, which means {means}."
    return f"{sender} invited you to work on {goal.title}" + (f" as {role.name}." if role else ".")


def _greeting(db: Session, invitation: PlanInvitation) -> str:
    target = db.get(User, invitation.target_user_id) if invitation.target_user_id else db.exec(
        select(User).where(func.lower(User.email) == str(invitation.email).strip().lower())).first()
    name = _first_name(target)
    return f"Hi {name}," if name else "Hi there,"


def send_plan_invitation(db: Session, goal: Goal, invitation: PlanInvitation, role_name: str = "") -> bool:
    """Email the invited address; a failed delivery is logged, never raised, so the invitation still stands."""
    org = db.get(Organization, goal.org_id) if goal.org_id else owner_org(db)
    path = invitation_path(org, invitation)
    link = f"{frontend_url()}{path}"
    has_account = bool(db.exec(select(User.id).where(func.lower(User.email) == str(invitation.email).strip().lower())).first())
    if not has_account:
        link = f"{frontend_url()}/signup?{urlencode({'email': invitation.email, 'next': path})}"  # no account yet: signup, then the invitation
    text = html.escape(invitation_text(db, goal, invitation))
    title = html.escape(goal.title)
    text = text.replace(title, f"<b>{title}</b>", 1)
    try:
        send_email(
            to=invitation.email,
            subject=f"{inviter_label(db, goal, invitation)} invited you to {goal.title}",
            body=f"""
<html>
    <body>
        <p>{html.escape(_greeting(db, invitation))}</p>
        <p>{text}</p>
        <p><a href="{link}">See the invitation</a></p>
        {"" if has_account else "<p>New to Life2Launch? Sign up with this email address and the invitation will be waiting for you.</p>"}
    </body>
</html>
""",
        )
        return True
    except Exception:
        logger.exception("Failed to send the plan invitation to %s", invitation.email)
        return False

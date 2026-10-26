"""The email that goes with an invitation to a plan: to start it as its learner, or to help on it.

The invitation itself is a card in the person's chats (services/connect/inbox.py), which they see
once they sign in with the invited address; the email is how they hear about it. The link opens
those chats on the organization's site, or, for an address with no account yet, signup with it filled in.
"""

import html
import logging
from urllib.parse import urlencode

from sqlmodel import Session, func, select

from src.db.goal_sharing import PlanInvitation
from src.db.goals import Goal
from src.db.organizations import Organization
from src.db.users import User
from src.services.email.utils import send_email
from src.services.oauth.config import frontend_url
from src.services.orgs.owner import owner_org

logger = logging.getLogger(__name__)


def send_plan_invitation(db: Session, goal: Goal, invitation: PlanInvitation, role_name: str) -> bool:
    """Email the invited address; a failed delivery is logged, never raised, so the invitation still stands."""
    org = db.get(Organization, goal.org_id) if goal.org_id else owner_org(db)
    inviter = db.get(User, invitation.invited_by_user_id) if invitation.invited_by_user_id else None
    who = (" ".join(part for part in (inviter.first_name, inviter.last_name) if part) or f"@{inviter.username}") if inviter else ""
    if who and org:
        sender = f"{who} at {org.name}"
    else:
        sender = who or (org.name if org else "Someone on Launch LMS")
    link = f"{frontend_url()}/orgs/{org.slug}/connect" if org else f"{frontend_url()}/connect"
    if not db.exec(select(User.id).where(func.lower(User.email) == str(invitation.email).strip().lower())).first():
        link = f"{frontend_url()}/signup?{urlencode({'email': invitation.email})}"  # no account yet: signup, with the address filled in
    title, role, email = html.escape(goal.title), html.escape(role_name), html.escape(str(invitation.email))
    try:
        send_email(
            to=invitation.email,
            subject=f"Invitation to {goal.title}",
            body=f"""
<html>
    <body>
        <p>Hello {email}</p>
        <p>{html.escape(sender)} invited you to work on <b>{title}</b> as {role}.</p>
        <p><a href="{link}">See the invitation</a></p>
        <p>New to Launch LMS? Sign up with this email address and the invitation will be waiting for you.</p>
    </body>
</html>
""",
        )
        return True
    except Exception:
        logger.exception("Failed to send the plan invitation to %s", invitation.email)
        return False

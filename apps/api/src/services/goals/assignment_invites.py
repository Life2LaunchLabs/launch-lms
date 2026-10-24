"""Email invitations on an assignment: someone without an account, asked to start the plan.

Inviting happens when the assignment is made (services/goals/assignments._invite_subject); here
staff send a waiting invitation again.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, col, select

from src.db.goal_sharing import PlanInvitation, PlanInvitationKind, PlanInvitationStatus
from src.db.goals import Goal
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.services.goals import access
from src.services.goals.assignment_staff import require_assignment_manager
from src.services.messages import create_inbox_message


def resend(db: Session, current_user: PublicUser, org_id: int, assignment_uuid: str) -> dict:
    """Send each waiting invitation on the assignment again; returns how many went out."""
    assignment = require_assignment_manager(db, current_user, org_id, assignment_uuid)
    goals = {int(goal.id): goal for goal in db.exec(select(Goal).where(Goal.assignment_id == assignment.id, col(Goal.subject_user_id).is_(None))).all()}  # type: ignore[arg-type]
    if not goals:
        return {"sent": 0}
    org = db.get(Organization, org_id)
    sender = org.name if org else "A Launch LMS member"
    now = datetime.now().isoformat()
    sent = 0
    for invitation in db.exec(select(PlanInvitation).where(col(PlanInvitation.goal_id).in_(list(goals)), PlanInvitation.kind == PlanInvitationKind.SUBJECT,
                                                          PlanInvitation.status == PlanInvitationStatus.PENDING)).all():
        goal = goals[int(invitation.goal_id)]
        create_inbox_message(
            db, recipient_user_id=None, recipient_email=invitation.email, sender_org_id=org_id, sender_user_id=int(current_user.id),
            message_type="invitation", subject=f"Invitation to {goal.title}", body=f"{sender} invited you to work on {goal.title}.",
            action_url=f"/goals/{goal.goal_uuid}", action_kind="goal_invitation",
            action_data={"invitation_uuid": invitation.invitation_uuid, "goal_uuid": goal.goal_uuid, "goal_title": goal.title},
            dedupe_key=f"goal_invitation:{invitation.invitation_uuid}:{now}",
        )
        invitation.update_date = now
        db.add(invitation)
        access.log(db, goal, int(current_user.id), "invitation.resent", {"invitation_uuid": invitation.invitation_uuid})
        sent += 1
    db.commit()
    return {"sent": sent}

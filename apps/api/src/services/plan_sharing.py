"""Sharing a plan: taking back an invitation that has not been answered yet.

Invitations, role changes and removals live in planning.py; this holds what the
share dialog needs beyond them."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.messages import InboxMessage
from src.db.planning import PlanInvitation, PlanInvitationStatus
from src.db.users import PublicUser
from src.services.planning import _activity, _now_string, _plan_or_404, _require


def revoke_invitation(db: Session, current_user: PublicUser, identifier: str, invitation_uuid: str) -> dict:
    plan = _plan_or_404(db, identifier)
    _require(db, plan, current_user.id, "manage_collaborators")
    invitation = db.exec(select(PlanInvitation).where(PlanInvitation.plan_id == plan.id, PlanInvitation.invitation_uuid == invitation_uuid)).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status != PlanInvitationStatus.PENDING:
        raise HTTPException(status_code=409, detail="This invitation was already answered")
    invitation.status = PlanInvitationStatus.REVOKED
    invitation.update_date = _now_string()
    db.add(invitation)
    # Take the invitation out of the recipient's inbox too.
    message = db.exec(select(InboxMessage).where(InboxMessage.dedupe_key == f"plan_invitation:{invitation.invitation_uuid}")).first()
    if message and message.action_status == "pending":
        message.action_status = "revoked"
        message.resolved_at = datetime.utcnow()
        db.add(message)
    _activity(db, plan, current_user.id, "invitation.revoked", {"invitation_uuid": invitation.invitation_uuid})
    db.commit()
    return {"invitation_uuid": invitation.invitation_uuid, "status": "revoked"}

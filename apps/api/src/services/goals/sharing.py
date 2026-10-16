"""Sharing a goal: invitations, collaborator requests and members.

Ported from ``services/planning.py`` and ``services/plan_sharing.py``, keyed by
``goal_id`` on the shared plan collaboration tables. People and roles live in
``sharing_roles``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalStatus
from src.db.messages import InboxMessage
from src.db.organizations import Organization
from src.db.goal_sharing import (
    PlanCollaborator,
    PlanCollaboratorRequest,
    PlanCollaboratorRequestCreate,
    PlanCollaboratorRequestStatus,
    PlanCollaboratorUpdate,
    PlanInvitation,
    PlanInvitationCreate,
    PlanInvitationKind,
    PlanInvitationStatus,
    PlanOwnershipTransfer,
    PlanRole,
)
from src.db.users import PublicUser, User
from src.services.goals import access
from src.services.goals.sharing_roles import (
    _aware,
    _now,
    _require_grantable,
    _role,
    _stamp,
    _value,
    org_summary,
    people,
    require_individual,
    user_summary,
)
from src.services.messages import create_inbox_message, resolve_action_by_dedupe


# Invitations ---------------------------------------------------------------------------

def _dedupe(invitation: PlanInvitation) -> str:
    return f"goal_invitation:{invitation.invitation_uuid}"


def _invitation_message(db: Session, goal: Goal, invitation: PlanInvitation, role_name: str) -> None:
    organization = db.get(Organization, goal.org_id) if goal.org_id and _value(goal.ownership) == "external" else None
    sender = organization.name if organization else "A Launch LMS member"
    create_inbox_message(
        db, recipient_user_id=invitation.target_user_id, recipient_email=invitation.email,
        sender_org_id=int(organization.id) if organization and organization.id else None, sender_user_id=invitation.invited_by_user_id,
        message_type="invitation", subject=f"Invitation to {goal.title}",
        body=f"{sender} invited you to work on {goal.title} as {role_name}.",
        action_url=f"/goals/{goal.goal_uuid}", action_kind="goal_invitation",
        action_data={"invitation_uuid": invitation.invitation_uuid, "goal_uuid": goal.goal_uuid, "goal_title": goal.title, "role_name": role_name},
        dedupe_key=_dedupe(invitation),
    )


def create_invitation(db: Session, current_user: PublicUser, goal_uuid: str, payload: PlanInvitationCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "manage_collaborators")
    if payload.kind == PlanInvitationKind.SUBJECT and goal.subject_user_id:
        raise HTTPException(status_code=409, detail="The goal's learner cannot be changed once assigned")
    role = _role(db, goal, payload.role_key)
    if not role:
        raise HTTPException(status_code=404, detail="Goal role not found")
    _require_grantable(db, goal, current_user.id, role)
    email = payload.email.strip()
    normalized = email.lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="A valid email is required")
    target = db.exec(select(User).where(User.email == email)).first() or db.exec(select(User).where(User.email == normalized)).first()
    if target and (target.id == goal.owner_user_id or access.membership(db, goal, int(target.id))):  # type: ignore[arg-type]
        raise HTTPException(status_code=409, detail="This person is already a collaborator")
    if db.exec(select(PlanInvitation).where(PlanInvitation.goal_id == goal.id, PlanInvitation.email_normalized == normalized, PlanInvitation.status == PlanInvitationStatus.PENDING)).first():
        raise HTTPException(status_code=409, detail="This person already has an invitation waiting")
    now = _stamp()
    invitation = PlanInvitation(
        invitation_uuid=f"plan_invitation_{uuid4()}", goal_id=goal.id, kind=payload.kind, email=email, email_normalized=normalized,
        target_user_id=target.id if target else None, role_id=int(role.id), invited_by_user_id=current_user.id,  # type: ignore[arg-type]
        expires_at=_now() + timedelta(days=30), creation_date=now, update_date=now,
    )
    db.add(invitation)
    _invitation_message(db, goal, invitation, role.name)
    access.log(db, goal, current_user.id, "invitation.created", {"kind": _value(payload.kind), "role_key": role.key})
    db.commit()
    return {"invitation_uuid": invitation.invitation_uuid, "status": "pending", "email": email, "kind": _value(payload.kind), "role": role.name}


def _resolve_messages(db: Session, invitation: PlanInvitation, status: str) -> None:
    # Migrated invitations still carry the plan dedupe key.
    for key in (_dedupe(invitation), f"plan_invitation:{invitation.invitation_uuid}"):
        if status == "revoked":
            message = db.exec(select(InboxMessage).where(InboxMessage.dedupe_key == key)).first()
            if message and message.action_status == "pending":
                message.action_status, message.resolved_at = "revoked", datetime.utcnow()
                db.add(message)
        else:
            resolve_action_by_dedupe(db, key, accepted=status == "accepted")


def revoke_invitation(db: Session, current_user: PublicUser, goal_uuid: str, invitation_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "manage_collaborators")
    invitation = db.exec(select(PlanInvitation).where(PlanInvitation.goal_id == goal.id, PlanInvitation.invitation_uuid == invitation_uuid)).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if _value(invitation.status) != PlanInvitationStatus.PENDING.value:
        raise HTTPException(status_code=409, detail="This invitation was already answered")
    invitation.status = PlanInvitationStatus.REVOKED
    invitation.update_date = _stamp()
    db.add(invitation)
    _resolve_messages(db, invitation, "revoked")
    access.log(db, goal, current_user.id, "invitation.revoked", {"invitation_uuid": invitation_uuid})
    db.commit()
    return {"invitation_uuid": invitation_uuid, "status": "revoked"}


def _mine(current_user: PublicUser):
    normalized = str(current_user.email).strip().lower()
    return (PlanInvitation.target_user_id == current_user.id) | (PlanInvitation.email_normalized == normalized)


def list_my_invitations(db: Session, current_user: PublicUser) -> list[dict]:
    rows = db.exec(select(PlanInvitation).where(
        _mine(current_user), PlanInvitation.goal_id.is_not(None), PlanInvitation.status == PlanInvitationStatus.PENDING,  # type: ignore[union-attr]
    ).order_by(PlanInvitation.creation_date.desc())).all()  # type: ignore[attr-defined]
    result = []
    for invitation in rows:
        goal = db.get(Goal, invitation.goal_id)
        role = db.get(PlanRole, invitation.role_id)
        if not goal or not role:
            continue
        result.append({
            "invitation_uuid": invitation.invitation_uuid, "kind": _value(invitation.kind), "status": _value(invitation.status),
            "unread": invitation.viewed_at is None, "expires_at": invitation.expires_at,
            "goal": {"goal_uuid": goal.goal_uuid, "title": goal.title, "description": goal.description},
            "organization": org_summary(db, goal.org_id) if _value(goal.ownership) == "external" else None,
            "subject": user_summary(db, goal.subject_user_id), "invited_by": user_summary(db, invitation.invited_by_user_id),
            "role": {"key": role.key, "name": role.name},
        })
    return result


def respond_to_invitation(db: Session, current_user: PublicUser, invitation_uuid: str, accept: bool) -> dict:
    invitation = db.exec(select(PlanInvitation).where(
        PlanInvitation.invitation_uuid == invitation_uuid, PlanInvitation.goal_id.is_not(None), _mine(current_user),  # type: ignore[union-attr]
        PlanInvitation.status == PlanInvitationStatus.PENDING,
    )).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Goal invitation not found")
    expires_at = _aware(invitation.expires_at)
    if expires_at and expires_at < _now():
        raise HTTPException(status_code=410, detail="Goal invitation expired")
    goal = db.get(Goal, invitation.goal_id)
    role = db.get(PlanRole, invitation.role_id)
    if not goal or not role:
        raise HTTPException(status_code=404, detail="Goal not found")
    subject_kind = _value(invitation.kind) == PlanInvitationKind.SUBJECT.value
    if accept and subject_kind and goal.subject_user_id not in {None, current_user.id}:
        raise HTTPException(status_code=409, detail="The goal's learner cannot be changed once assigned")
    invitation.status = PlanInvitationStatus.ACCEPTED if accept else PlanInvitationStatus.DECLINED
    invitation.target_user_id = current_user.id
    invitation.viewed_at = invitation.viewed_at or _now()
    invitation.responded_at = _now()
    invitation.update_date = _stamp()
    db.add(invitation)
    _resolve_messages(db, invitation, "accepted" if accept else "declined")
    if accept:
        if not access.membership(db, goal, current_user.id) and goal.owner_user_id != current_user.id:
            access.add_member(db, goal, current_user.id, role)
        if subject_kind:
            goal.subject_user_id = current_user.id
            goal.status = GoalStatus.ACTIVE
            db.add(goal)
        access.log(db, goal, current_user.id, "invitation.accepted", {"kind": _value(invitation.kind)})
    db.commit()
    return {"invitation_uuid": invitation_uuid, "status": _value(invitation.status), "goal_uuid": goal.goal_uuid}


# Collaborator requests -------------------------------------------------------------------

def _request_dict(db: Session, item: PlanCollaboratorRequest) -> dict:
    return {
        "request_uuid": item.request_uuid, "email": item.email, "role_key": item.role_key, "message": item.message,
        "status": _value(item.status), "requested_by": user_summary(db, item.requested_by_user_id),
        "resolved_by": user_summary(db, item.resolved_by_user_id), "creation_date": item.creation_date, "responded_at": item.responded_at,
    }


def create_collaborator_request(db: Session, current_user: PublicUser, goal_uuid: str, payload: PlanCollaboratorRequestCreate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "request_collaborators")
    role = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == payload.role_key)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Goal role not found")
    email = payload.email.strip()
    normalized = email.lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="A valid email is required")
    if db.exec(select(PlanCollaboratorRequest).where(
        PlanCollaboratorRequest.goal_id == goal.id, PlanCollaboratorRequest.email_normalized == normalized,
        PlanCollaboratorRequest.status == PlanCollaboratorRequestStatus.PENDING,
    )).first():
        raise HTTPException(status_code=409, detail="A request for this person is already pending")
    now = _stamp()
    item = PlanCollaboratorRequest(
        request_uuid=f"plan_collaborator_request_{uuid4()}", goal_id=goal.id, requested_by_user_id=current_user.id,
        email=email, email_normalized=normalized, role_key=role.key, message=payload.message.strip(), creation_date=now, update_date=now,
    )
    db.add(item)
    access.log(db, goal, current_user.id, "collaborator.requested", {"request_uuid": item.request_uuid, "role_key": role.key})
    db.commit()
    return _request_dict(db, item)


def list_collaborator_requests(db: Session, current_user: PublicUser, goal_uuid: str) -> list[dict]:
    goal = access.goal_or_404(db, goal_uuid)
    granted = access.require(db, goal, current_user.id, "view_plan")
    statement = select(PlanCollaboratorRequest).where(PlanCollaboratorRequest.goal_id == goal.id)
    if "manage_collaborators" not in granted:
        statement = statement.where(PlanCollaboratorRequest.requested_by_user_id == current_user.id)
    return [_request_dict(db, item) for item in db.exec(statement.order_by(PlanCollaboratorRequest.id.desc())).all()]  # type: ignore[union-attr]


def respond_to_collaborator_request(db: Session, current_user: PublicUser, goal_uuid: str, request_uuid: str, approve: bool) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "manage_collaborators")
    item = db.exec(select(PlanCollaboratorRequest).where(
        PlanCollaboratorRequest.goal_id == goal.id, PlanCollaboratorRequest.request_uuid == request_uuid,
        PlanCollaboratorRequest.status == PlanCollaboratorRequestStatus.PENDING,
    )).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pending collaborator request not found")
    invitation = create_invitation(db, current_user, goal_uuid, PlanInvitationCreate(email=item.email, role_key=item.role_key)) if approve else None
    item.status = PlanCollaboratorRequestStatus.APPROVED if approve else PlanCollaboratorRequestStatus.DECLINED
    item.resolved_by_user_id = current_user.id
    item.responded_at = _now()
    item.update_date = _stamp()
    db.add(item)
    access.log(db, goal, current_user.id, "collaborator.request_resolved", {"request_uuid": request_uuid, "approved": approve})
    db.commit()
    return {**_request_dict(db, item), "invitation": invitation}


# Members --------------------------------------------------------------------------------------

def _collaborator(db: Session, goal: Goal, collaborator_uuid: str) -> PlanCollaborator:
    row = db.exec(select(PlanCollaborator).where(PlanCollaborator.goal_id == goal.id, PlanCollaborator.collaborator_uuid == collaborator_uuid)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    return row


def update_collaborator(db: Session, current_user: PublicUser, goal_uuid: str, collaborator_uuid: str, payload: PlanCollaboratorUpdate) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    require_individual(db, goal)
    access.require(db, goal, current_user.id, "manage_collaborators")
    collaborator = _collaborator(db, goal, collaborator_uuid)
    if collaborator.user_id == goal.owner_user_id:
        raise HTTPException(status_code=422, detail="Transfer ownership before changing the owner's role")
    role = _role(db, goal, payload.role_key)
    if not role:
        raise HTTPException(status_code=404, detail="Goal role not found")
    _require_grantable(db, goal, current_user.id, role)
    collaborator.role_id = int(role.id)  # type: ignore[arg-type]
    collaborator.update_date = _stamp()
    db.add(collaborator)
    access.log(db, goal, current_user.id, "collaborator.role_changed", {"collaborator_uuid": collaborator_uuid, "role_key": role.key})
    db.commit()
    return people(db, current_user, goal_uuid)


def remove_collaborator(db: Session, current_user: PublicUser, goal_uuid: str, collaborator_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    require_individual(db, goal)
    access.require(db, goal, current_user.id, "manage_collaborators")
    collaborator = _collaborator(db, goal, collaborator_uuid)
    if collaborator.user_id == goal.owner_user_id:
        raise HTTPException(status_code=422, detail="Transfer ownership before removing the owner")
    if collaborator.user_id == goal.subject_user_id:
        raise HTTPException(status_code=422, detail="The goal's learner cannot be removed or changed")
    collaborator.active = False
    collaborator.update_date = _stamp()
    db.add(collaborator)
    access.log(db, goal, current_user.id, "collaborator.removed", {"collaborator_uuid": collaborator_uuid})
    db.commit()
    return {"removed": True, "collaborator_uuid": collaborator_uuid}


def leave(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    if goal.owner_user_id == current_user.id:
        raise HTTPException(status_code=422, detail="Transfer ownership before leaving this goal")
    row = access.membership(db, goal, current_user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Goal not found")
    if current_user.id == goal.subject_user_id:
        raise HTTPException(status_code=422, detail="The goal's learner can't leave it")
    row[0].active = False
    row[0].update_date = _stamp()
    db.add(row[0])
    access.log(db, goal, current_user.id, "collaborator.left", {"collaborator_uuid": row[0].collaborator_uuid})
    db.commit()
    return {"left": True, "goal_uuid": goal.goal_uuid}


def transfer_ownership(db: Session, current_user: PublicUser, goal_uuid: str, payload: PlanOwnershipTransfer) -> dict:
    goal = access.goal_or_404(db, goal_uuid)
    require_individual(db, goal)
    if goal.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can transfer ownership")
    if not access.membership(db, goal, payload.user_id):
        raise HTTPException(status_code=422, detail="The new owner must be an active collaborator")
    # The previous owner stays on as a goal admin.
    admin = db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key == "plan_admin")).first()
    if admin and not access.membership(db, goal, current_user.id):
        access.add_member(db, goal, current_user.id, admin)
    goal.owner_user_id = payload.user_id
    goal.update_date = _stamp()
    db.add(goal)
    access.log(db, goal, current_user.id, "ownership.transferred", {"new_owner_user_id": payload.user_id})
    db.commit()
    return people(db, current_user, goal_uuid)

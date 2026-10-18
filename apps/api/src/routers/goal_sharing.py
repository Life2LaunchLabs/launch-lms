"""Who works on a goal: roles, invitations, collaborators, comments, attachments and the activity log; plus goal lifecycle."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.goal_comments import GoalCommentCreate, GoalCommentUpdate
from src.db.goals import GoalFinish
from src.db.planning import (
    OrganizationPlanRoleCreate,
    OrganizationPlanRoleUpdate,
    PlanAttachmentCreate,
    PlanCollaboratorRequestCreate,
    PlanCollaboratorRequestResponse,
    PlanCollaboratorUpdate,
    PlanInvitationCreate,
    PlanInvitationResponse,
    PlanOwnershipTransfer,
    PlanRoleUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import comments, lifecycle, sharing, sharing_log, sharing_roles

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_current_user)


# Fixed paths first, ahead of /{goal_uuid}/... ---------------------------------------------

@router.get("/invitations")
def api_my_invitations(db: Session = DB, user: PublicUser = USER):
    return sharing.list_my_invitations(db, user)


@router.post("/invitations/{invitation_uuid}/respond")
def api_respond_to_invitation(invitation_uuid: str, payload: PlanInvitationResponse, db: Session = DB, user: PublicUser = USER):
    return sharing.respond_to_invitation(db, user, invitation_uuid, payload.accept)


@router.get("/org-invitations")
def api_org_invitations(db: Session = DB, user: PublicUser = USER):
    return lifecycle.org_invitations(db, user)


@router.post("/org-invitations/viewed")
def api_org_invitations_viewed(db: Session = DB, user: PublicUser = USER):
    return lifecycle.mark_org_invitations_viewed(db, user)


# People and roles ------------------------------------------------------------------------

@router.get("/{goal_uuid}/people")
def api_people(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing_roles.people(db, user, goal_uuid)


@router.patch("/{goal_uuid}/roles/{role_uuid}")
def api_update_role(goal_uuid: str, role_uuid: str, payload: PlanRoleUpdate, db: Session = DB, user: PublicUser = USER):
    return sharing_roles.update_role(db, user, goal_uuid, role_uuid, payload)


@router.post("/{goal_uuid}/organization-roles")
def api_create_organization_role(goal_uuid: str, payload: OrganizationPlanRoleCreate, db: Session = DB, user: PublicUser = USER):
    return sharing_roles.create_organization_role(db, user, goal_uuid, payload)


@router.patch("/{goal_uuid}/organization-roles/{role_uuid}")
def api_update_organization_role(goal_uuid: str, role_uuid: str, payload: OrganizationPlanRoleUpdate, db: Session = DB, user: PublicUser = USER):
    return sharing_roles.update_organization_role(db, user, goal_uuid, role_uuid, payload)


@router.delete("/{goal_uuid}/organization-roles/{role_uuid}")
def api_delete_organization_role(goal_uuid: str, role_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing_roles.delete_organization_role(db, user, goal_uuid, role_uuid)


# Invitations, requests and members -----------------------------------------------------------

@router.post("/{goal_uuid}/invitations")
def api_create_invitation(goal_uuid: str, payload: PlanInvitationCreate, db: Session = DB, user: PublicUser = USER):
    return sharing.create_invitation(db, user, goal_uuid, payload)


@router.delete("/{goal_uuid}/invitations/{invitation_uuid}")
def api_revoke_invitation(goal_uuid: str, invitation_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing.revoke_invitation(db, user, goal_uuid, invitation_uuid)


@router.get("/{goal_uuid}/collaborator-requests")
def api_collaborator_requests(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing.list_collaborator_requests(db, user, goal_uuid)


@router.post("/{goal_uuid}/collaborator-requests")
def api_create_collaborator_request(goal_uuid: str, payload: PlanCollaboratorRequestCreate, db: Session = DB, user: PublicUser = USER):
    return sharing.create_collaborator_request(db, user, goal_uuid, payload)


@router.post("/{goal_uuid}/collaborator-requests/{request_uuid}/respond")
def api_respond_collaborator_request(goal_uuid: str, request_uuid: str, payload: PlanCollaboratorRequestResponse, db: Session = DB, user: PublicUser = USER):
    return sharing.respond_to_collaborator_request(db, user, goal_uuid, request_uuid, payload.approve)


@router.patch("/{goal_uuid}/collaborators/{collaborator_uuid}")
def api_update_collaborator(goal_uuid: str, collaborator_uuid: str, payload: PlanCollaboratorUpdate, db: Session = DB, user: PublicUser = USER):
    return sharing.update_collaborator(db, user, goal_uuid, collaborator_uuid, payload)


@router.delete("/{goal_uuid}/collaborators/{collaborator_uuid}")
def api_remove_collaborator(goal_uuid: str, collaborator_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing.remove_collaborator(db, user, goal_uuid, collaborator_uuid)


@router.post("/{goal_uuid}/leave")
def api_leave(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing.leave(db, user, goal_uuid)


@router.post("/{goal_uuid}/transfer-ownership")
def api_transfer_ownership(goal_uuid: str, payload: PlanOwnershipTransfer, db: Session = DB, user: PublicUser = USER):
    return sharing.transfer_ownership(db, user, goal_uuid, payload)


# Activity log, comments and attachments ---------------------------------------------------------

@router.get("/{goal_uuid}/activity")
def api_activity(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing_log.list_activity(db, user, goal_uuid)


class ThreadResolve(BaseModel):
    resolved: bool = True


@router.get("/{goal_uuid}/comments")
def api_comments(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return comments.list_comments(db, user, goal_uuid)


@router.post("/{goal_uuid}/comments")
def api_add_comment(goal_uuid: str, payload: GoalCommentCreate, db: Session = DB, user: PublicUser = USER):
    return comments.add_comment(db, user, goal_uuid, payload)


@router.patch("/{goal_uuid}/comments/{comment_uuid}")
def api_update_comment(goal_uuid: str, comment_uuid: str, payload: GoalCommentUpdate, db: Session = DB, user: PublicUser = USER):
    return comments.update_comment(db, user, goal_uuid, comment_uuid, payload)


@router.delete("/{goal_uuid}/comments/{comment_uuid}")
def api_delete_comment(goal_uuid: str, comment_uuid: str, db: Session = DB, user: PublicUser = USER):
    return comments.delete_comment(db, user, goal_uuid, comment_uuid)


@router.post("/{goal_uuid}/comments/{comment_uuid}/resolve")
def api_resolve_thread(goal_uuid: str, comment_uuid: str, payload: ThreadResolve, db: Session = DB, user: PublicUser = USER):
    return comments.resolve_thread(db, user, goal_uuid, comment_uuid, payload.resolved)


@router.get("/{goal_uuid}/mention-candidates")
def api_mention_candidates(goal_uuid: str, q: str = "", db: Session = DB, user: PublicUser = USER):
    return comments.mention_candidates(db, user, goal_uuid, q)


@router.get("/{goal_uuid}/attachments")
def api_attachments(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing_log.list_attachments(db, user, goal_uuid)


@router.post("/{goal_uuid}/attachments")
def api_add_attachment(goal_uuid: str, payload: PlanAttachmentCreate, db: Session = DB, user: PublicUser = USER):
    return sharing_log.add_attachment(db, user, goal_uuid, payload)


@router.delete("/{goal_uuid}/attachments/{asset_uuid}")
def api_remove_attachment(goal_uuid: str, asset_uuid: str, db: Session = DB, user: PublicUser = USER):
    return sharing_log.remove_attachment(db, user, goal_uuid, asset_uuid)


# Lifecycle -------------------------------------------------------------------------------------

@router.post("/{goal_uuid}/archive")
def api_archive(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return lifecycle.archive(db, user, goal_uuid)


@router.post("/{goal_uuid}/finish")
def api_finish(goal_uuid: str, payload: GoalFinish | None = None, db: Session = DB, user: PublicUser = USER):
    return lifecycle.finish(db, user, goal_uuid, payload)


@router.post("/{goal_uuid}/reopen")
def api_reopen(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return lifecycle.reopen(db, user, goal_uuid)


@router.post("/{goal_uuid}/celebrated")
def api_celebrated(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return lifecycle.mark_celebrated(db, user, goal_uuid)


@router.delete("/{goal_uuid}")
def api_delete(goal_uuid: str, db: Session = DB, user: PublicUser = USER):
    return lifecycle.delete(db, user, goal_uuid)

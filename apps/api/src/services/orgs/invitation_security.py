from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.organization_invitations import OrganizationInvitation
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.usergroups import UserGroup
from src.security.access.access import count_usage, is_staff_role, org_access
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.security.superadmin import is_user_superadmin


def validate_invitation_acceptance(invitation: OrganizationInvitation, db_session: Session) -> None:
    """Recheck authority, assignments, and any limits changed since creation."""
    role = db_session.exec(select(Role).where(Role.id == invitation.role_id)).first()
    if not role:
        raise HTTPException(status_code=409, detail="The invited role is no longer available")
    if invitation.usergroup_id and not db_session.exec(select(UserGroup).where(
        UserGroup.id == invitation.usergroup_id, UserGroup.org_id == invitation.org_id,
    )).first():
        raise HTTPException(status_code=409, detail="The invited group is no longer available")
    if invitation.created_by_user_id and is_staff_role(role):
        creator = db_session.exec(select(UserOrganization).where(
            UserOrganization.user_id == invitation.created_by_user_id,
            UserOrganization.org_id == invitation.org_id,
        )).first()
        if not is_user_superadmin(invitation.created_by_user_id, db_session) and (
            not creator or creator.role_id != ADMIN_ROLE_ID
        ):
            raise HTTPException(status_code=403, detail="The inviter is no longer authorized to grant this role")

    # The pending invitation already holds its seat, so only a count above the limit means it no longer fits.
    seat = "staff_seats" if is_staff_role(role) else "learners"
    limit = org_access(invitation.org_id, db_session).limit(seat)
    if limit and count_usage(seat, invitation.org_id, db_session) > limit:
        raise HTTPException(status_code=403, detail="The organization no longer has enough seats")


def audit_invitation_acceptance(
    invitation: OrganizationInvitation,
    accepting_user_id: int,
    request: Request,
    db_session: Session,
) -> None:
    from src.services.audit_logs import record_audit_log

    record_audit_log(
        db_session,
        action="invitation.accept",
        resource="organization_invitation",
        status_code=200,
        org_id=invitation.org_id,
        user_id=accepting_user_id,
        ip_address=request.client.host if request.client else None,
        request_metadata={
            "invitation_uuid": invitation.invitation_uuid,
            "role_id": invitation.role_id,
            "usergroup_id": invitation.usergroup_id,
        },
    )

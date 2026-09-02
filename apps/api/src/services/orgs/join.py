from datetime import datetime

from fastapi import HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
from src.db.organizations import Organization
from src.db.organization_invitations import OrganizationInvitation
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, InternalUser, PublicUser, User
from src.security.features_utils.usage import (
    check_limits_with_usage,
    increase_feature_usage,
)
from src.services.orgs.invites import get_invite_code, redeem_join_link
from src.services.orgs.orgs import get_org_join_mechanism
from src.services.users.usergroups import add_users_to_usergroup
from src.services.orgs.invitation_security import audit_invitation_acceptance, validate_invitation_acceptance
from src.services.messages import resolve_action_by_dedupe


class JoinOrg(BaseModel):
    org_id: int
    user_id: str | int
    invite_code: str | None = None
    invitation_token: str | None = None

    @field_validator("user_id", mode="before")
    @classmethod
    def coerce_user_id_to_str(cls, v: str | int) -> str:
        return str(v)


async def join_org(
    request: Request,
    args: JoinOrg,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    statement = select(Organization).where(Organization.id == args.org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org or org.id is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    join_method = await get_org_join_mechanism(
        request, args.org_id, current_user, db_session
    )

    # Get User by UUID or numeric ID
    user_id_str = str(args.user_id)
    if user_id_str.isdigit():
        statement = select(User).where(
            (User.user_uuid == user_id_str) | (User.id == int(user_id_str))
        )
    else:
        statement = select(User).where(User.user_uuid == user_id_str)
    result = db_session.exec(statement)

    user = result.first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Check if User isn't already part of the org
    statement = select(UserOrganization).where(
        UserOrganization.user_id == user.id, UserOrganization.org_id == args.org_id
    )
    result = db_session.exec(statement)

    userorg = result.first()

    if userorg:
        raise HTTPException(
            status_code=400, detail="User is already part of that organization"
        )

    inviteCode = None
    invitation = None
    if args.invitation_token:
        invitation = db_session.exec(
            select(OrganizationInvitation).where(
                OrganizationInvitation.org_id == org.id,
                OrganizationInvitation.invitation_uuid == args.invitation_token,
                OrganizationInvitation.email_normalized == str(user.email).strip().casefold(),
                OrganizationInvitation.status == "pending",
                OrganizationInvitation.expires_at > datetime.utcnow(),
            )
        ).first()
        if not invitation:
            raise HTTPException(
                status_code=400,
                detail="This invitation is invalid, expired, or belongs to another email address",
            )
        validate_invitation_acceptance(invitation, db_session)
    if args.invite_code:
        inviteCode = await get_invite_code(
            request, org.id, args.invite_code, current_user, db_session
        )
        if inviteCode:
            invitation = db_session.exec(
                select(OrganizationInvitation).where(
                    OrganizationInvitation.org_id == org.id,
                    OrganizationInvitation.email_normalized == str(user.email).strip().casefold(),
                    OrganizationInvitation.invite_code_uuid == inviteCode.get("invite_code_uuid"),
                    OrganizationInvitation.status == "pending",
                    OrganizationInvitation.expires_at > datetime.utcnow(),
                )
            ).first()

    if join_method == "inviteOnly" and user and org and (args.invite_code or args.invitation_token):
        if user.id is not None and org.id is not None:
            if args.invite_code and not inviteCode:
                raise HTTPException(
                    status_code=400,
                    detail="Invite code is incorrect",
                )

            if invitation is None:
                check_limits_with_usage("members", org.id, db_session)

            # Link user and organization, consuming a reserved invitation when present.
            user_organization = UserOrganization(
                user_id=user.id,
                org_id=org.id,
                role_id=invitation.role_id if invitation else 4,
                creation_date=str(datetime.now()),
                update_date=str(datetime.now()),
            )

            if invitation:
                invitation.status = "accepted"
                invitation.target_user_id = user.id
                invitation.accepted_at = datetime.utcnow()
                invitation.updated_at = datetime.utcnow()
                db_session.add(invitation)
                resolve_action_by_dedupe(
                    db_session,
                    f"organization_invitation:{invitation.invitation_uuid}",
                    accepted=True,
                )
            elif inviteCode:
                redeem_join_link(db_session, inviteCode["invite_code_uuid"], str(user.email))
            db_session.add(user_organization)
            db_session.commit()

            if invitation:
                audit_invitation_acceptance(invitation, int(user.id), request, db_session)

            from src.routers.users import _invalidate_session_cache
            _invalidate_session_cache(user.id)

            # Add user to UserGroup if invite code is linked to one
            usergroup_id = invitation.usergroup_id if invitation else inviteCode.get("usergroup_id")
            if usergroup_id:
                await add_users_to_usergroup(
                    request,
                    db_session,
                    InternalUser(id=0),
                    int(usergroup_id),
                    str(user.id),
                )

            if invitation is None:
                increase_feature_usage("members", org.id, db_session)

            return "Great, You're part of the Organization"

        else:
            raise HTTPException(
                status_code=403,
                detail="Something wrong, try later.",
            )

    if join_method == "open" and user and org:
        if user.id is not None and org.id is not None:
            if invitation is None:
                check_limits_with_usage("members", org.id, db_session)
            # Link user and organization
            user_organization = UserOrganization(
                user_id=user.id,
                org_id=org.id,
                role_id=invitation.role_id if invitation else 4,
                creation_date=str(datetime.now()),
                update_date=str(datetime.now()),
            )

            if invitation:
                invitation.status = "accepted"
                invitation.target_user_id = user.id
                invitation.accepted_at = datetime.utcnow()
                invitation.updated_at = datetime.utcnow()
                db_session.add(invitation)
                resolve_action_by_dedupe(
                    db_session,
                    f"organization_invitation:{invitation.invitation_uuid}",
                    accepted=True,
                )
            elif inviteCode:
                redeem_join_link(db_session, inviteCode["invite_code_uuid"], str(user.email))
            db_session.add(user_organization)
            db_session.commit()

            if invitation:
                audit_invitation_acceptance(invitation, int(user.id), request, db_session)

            from src.routers.users import _invalidate_session_cache
            _invalidate_session_cache(user.id)

            if invitation and invitation.usergroup_id:
                await add_users_to_usergroup(
                    request,
                    db_session,
                    InternalUser(id=0),
                    int(invitation.usergroup_id),
                    str(user.id),
                )

            if invitation is None:
                increase_feature_usage("members", org.id, db_session)

            return "Great, You're part of the Organization"

        else:
            raise HTTPException(
                status_code=403,
                detail="Something wrong, try later.",
            )

    else:
        raise HTTPException(
            status_code=403,
            detail="Something wrong, try later.",
        )

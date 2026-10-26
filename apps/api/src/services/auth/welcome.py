"""The welcome signup when it comes from an invitation email or a join link: the account joins that organization.

A plain welcome signup joins the owner organization and starts its starter plan (routers/auth.py).
"""

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, UserCreate, UserRead

LEARNER_ROLE_ID = 4


def invited_org(db_session: Session, invitation_token: str | None, invite_code: str | None, org_id: int | None) -> Organization | None:
    """The organization an invitation or join link in the signup is for; None for a plain signup."""
    if invitation_token:
        invitation = db_session.exec(select(OrganizationInvitation).where(OrganizationInvitation.invitation_uuid == invitation_token)).first()
        org = db_session.get(Organization, invitation.org_id) if invitation else None
        if org is None:
            raise HTTPException(status_code=403, detail="This invitation is invalid, expired, or belongs to another email address")
        return org
    if invite_code:
        org = db_session.get(Organization, org_id) if org_id else None
        if org is None:
            raise HTTPException(status_code=400, detail="Invite code is incorrect")
        return org
    return None


async def create_invited_account(request: Request, db_session: Session, user_create: UserCreate, org: Organization,
                                 invitation_token: str | None, invite_code: str | None) -> UserRead:
    """Create the account through the invitation (its role and group) or the join link (its group, domain and limit)."""
    from src.services.users.users import create_user_with_invite, create_user_with_organization_invitation

    if invitation_token:
        return await create_user_with_organization_invitation(request, db_session, AnonymousUser(), user_create, int(org.id), invitation_token)  # type: ignore[arg-type]
    return await create_user_with_invite(request, db_session, AnonymousUser(), user_create, int(org.id), str(invite_code))  # type: ignore[arg-type]


def invited_redirect_url(db_session: Session, owner_org: Organization, org: Organization, user_id: int) -> str | None:
    """Where an invited account goes: the inviting organization, staff to its admin; None for a learner of the owner org (the starter plan)."""
    role_id = db_session.exec(select(UserOrganization.role_id).where(UserOrganization.user_id == user_id, UserOrganization.org_id == org.id)).first()
    if org.id == owner_org.id and role_id == LEARNER_ROLE_ID:
        return None
    return f"/orgs/{org.slug}/admin" if role_id in (1, 2) else f"/orgs/{org.slug}"

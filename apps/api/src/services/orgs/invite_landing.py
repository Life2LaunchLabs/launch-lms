"""What someone sees before signing up from an invitation email or a join link.

The invitation token (or the link's code) is the secret, so anyone holding it may see who sent it,
the organization, the role, the group and the address it was sent to, which fills in the signup form. A staff
invitation also shows the inviter's note, the permissions it gives and the assignments it adds them to.
"""

import hashlib
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
from src.db.organizations import Organization
from src.db.usergroups import UserGroup
from src.db.users import User
from src.security.rbac.constants import ADMIN_ROLE_ID

ROLES = {ADMIN_ROLE_ID: "admin", 2: "staff"}


def preview(db: Session, org_id: int, invitation: str | None = None, invite_code: str | None = None) -> dict:
    org = db.get(Organization, org_id)
    if org is None or not (invitation or invite_code):
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation:
        found = db.exec(select(OrganizationInvitation).where(
            OrganizationInvitation.org_id == org_id, OrganizationInvitation.invitation_uuid == invitation,
        )).first()
        if found is None:
            raise HTTPException(status_code=404, detail="Invitation not found")
        expired = found.status == "pending" and found.expires_at <= datetime.utcnow()
        status = "expired" if expired else found.status
        from src.services.orgs import staff_setup

        return {**_card(db, org, "invitation", status, found.role_id, found.usergroup_id, found.created_by_user_id, found.email),
                **staff_setup.describe(db, found)}
    link = db.exec(select(OrganizationJoinLink).where(
        OrganizationJoinLink.org_id == org_id,
        OrganizationJoinLink.token_hash == hashlib.sha256(str(invite_code).encode()).hexdigest(),
    )).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if link.status == "exhausted" or link.redemption_count >= link.max_redemptions:
        status = "used_up"
    elif link.status != "active":
        status = "revoked"
    else:
        status = "expired" if link.expires_at <= datetime.utcnow() else "pending"
    return _card(db, org, "link", status, link.role_id, link.usergroup_id, link.created_by_user_id, None)


def _card(db: Session, org: Organization, kind: str, status: str, role_id: int, group_id: int | None, inviter_id: int | None, email: str | None) -> dict:
    group = db.get(UserGroup, group_id) if group_id else None
    inviter = db.get(User, inviter_id) if inviter_id else None
    return {
        "kind": kind,
        "status": status,
        "org": {"id": org.id, "name": org.name, "slug": org.slug, "logo_image": org.logo_image, "org_uuid": org.org_uuid},
        "role": ROLES.get(role_id, "learner"),
        "group": group.name if group else None,
        "email": email,
        "inviter": {
            "name": " ".join(part for part in (inviter.first_name, inviter.last_name) if part) or inviter.username,
            "avatar_image": inviter.avatar_image,
            "user_uuid": inviter.user_uuid,
        } if inviter else None,
    }

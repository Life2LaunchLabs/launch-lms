import html
import hashlib
import secrets
from urllib.parse import quote
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from pydantic import EmailStr
from sqlmodel import Session, select
from src.db.organization_invitations import OrganizationJoinLink
from src.db.organizations import (
    Organization,
    OrganizationRead,
)
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, UserRead
from src.security.rbac.constants import USER_ROLE_ID
from src.security.access.access import org_access, require_capacity
from src.services.email.utils import send_email
from src.services.orgs.orgs import rbac_check


async def create_invite_code(
    request: Request,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    usergroup_id: int | None = None,
    display_name: str | None = None,
    expiry_date: str | None = None,
    expires_in_minutes: int | None = None,
    max_redemptions: int = 25,
    approved_email_domain: str | None = None,
):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "update", db_session)

    # Validate usergroup exists if provided
    if usergroup_id is not None:
        statement = select(UserGroup).where(
            UserGroup.id == usergroup_id,
            UserGroup.org_id == org_id,
        )
        usergroup = db_session.exec(statement).first()
        if not usergroup:
            raise HTTPException(
                status_code=404,
                detail="UserGroup not found or does not belong to this organization",
            )

    generated_invite_code = secrets.token_urlsafe(24)
    link_uuid = f"org_join_link_{secrets.token_hex(16)}"
    expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes or 1440)
    if expiry_date:
        try:
            expires_at = datetime.fromisoformat(expiry_date)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid expiry date") from exc
    if expires_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Expiry date must be in the future")
    cleaned_display_name = display_name.strip() if display_name else None
    if not cleaned_display_name:
        raise HTTPException(status_code=400, detail="Display name is required")
    if cleaned_display_name and len(cleaned_display_name) > 80:
        raise HTTPException(status_code=400, detail="Display name must be 80 characters or fewer")
    domain = approved_email_domain.strip().casefold().lstrip("@") if approved_email_domain else None
    if domain and ("@" in domain or "." not in domain):
        raise HTTPException(status_code=400, detail="Enter a valid approved email domain")
    if max_redemptions < 1 or max_redemptions > 1000:
        raise HTTPException(status_code=400, detail="Maximum redemptions must be between 1 and 1000")
    require_capacity("learners", org_id, db_session, adding=max_redemptions)
    active_links = db_session.exec(select(OrganizationJoinLink).where(
        OrganizationJoinLink.org_id == org_id,
        OrganizationJoinLink.status == "active",
        OrganizationJoinLink.expires_at > datetime.utcnow(),
    )).all()
    active_link_limit = org_access(org_id, db_session).limit("join_links")
    if active_link_limit and len(active_links) >= active_link_limit:
        raise HTTPException(status_code=429, detail="Active join-link limit reached")

    link = OrganizationJoinLink(
        link_uuid=link_uuid,
        token_hash=hashlib.sha256(generated_invite_code.encode()).hexdigest(),
        org_id=org_id,
        role_id=USER_ROLE_ID,
        usergroup_id=usergroup_id,
        display_name=cleaned_display_name,
        approved_email_domain=domain,
        max_redemptions=max_redemptions,
        created_by_user_id=current_user.id,
        expires_at=expires_at,
    )
    db_session.add(link)
    db_session.commit()
    db_session.refresh(link)
    from src.services.audit_logs import record_audit_log
    record_audit_log(
        db_session, action="join_link.create", resource="organization_join_link", status_code=200,
        org_id=org_id, user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        request_metadata={"link_uuid": link.link_uuid, "max_redemptions": max_redemptions},
    )
    return _serialize_join_link(link, generated_invite_code)


async def get_invite_codes(
    request: Request,
    org_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    statement = select(Organization).where(Organization.id == org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "update", db_session)

    links = db_session.exec(
        select(OrganizationJoinLink).where(OrganizationJoinLink.org_id == org_id).order_by(OrganizationJoinLink.created_at.desc())
    ).all()
    return [_serialize_join_link(link) for link in links]


async def get_invite_code(
    request: Request,
    org_id: int,
    invite_code: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    statement = select(Organization).where(Organization.id == org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    token_hash = hashlib.sha256(invite_code.encode()).hexdigest()
    link = db_session.exec(select(OrganizationJoinLink).where(
        OrganizationJoinLink.org_id == org_id,
        OrganizationJoinLink.token_hash == token_hash,
        OrganizationJoinLink.status == "active",
        OrganizationJoinLink.expires_at > datetime.utcnow(),
        OrganizationJoinLink.redemption_count < OrganizationJoinLink.max_redemptions,
    )).first()
    if not link:
        raise HTTPException(status_code=404, detail="Invite link not found or no longer active")
    return _serialize_join_link(link, invite_code)


async def delete_invite_code(
    request: Request,
    org_id: int,
    invite_code_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    statement = select(Organization).where(Organization.id == org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "update", db_session)

    link = db_session.exec(select(OrganizationJoinLink).where(
        OrganizationJoinLink.org_id == org_id,
        OrganizationJoinLink.link_uuid == invite_code_uuid,
    )).first()
    if not link:
        raise HTTPException(status_code=404, detail="Invite link not found")
    link.status = "revoked"
    link.revoked_at = datetime.utcnow()
    db_session.add(link)
    db_session.commit()
    from src.services.audit_logs import record_audit_log
    record_audit_log(
        db_session, action="join_link.revoke", resource="organization_join_link", status_code=200,
        org_id=org_id, user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        request_metadata={"link_uuid": link.link_uuid},
    )
    return {"detail": "Invite link revoked"}


def _serialize_join_link(link: OrganizationJoinLink, token: str | None = None) -> dict:
    return {
        "invite_code": token,
        "invite_code_uuid": link.link_uuid,
        "display_name": link.display_name,
        "expires_at": link.expires_at.isoformat(),
        "created_at": link.created_at.isoformat(),
        "usergroup_id": link.usergroup_id,
        "approved_email_domain": link.approved_email_domain,
        "max_redemptions": link.max_redemptions,
        "redemption_count": link.redemption_count,
        "status": link.status,
        "role_id": link.role_id,
    }


def redeem_join_link(db_session: Session, link_uuid: str, email: str) -> OrganizationJoinLink:
    """Recheck and consume a managed link as part of membership creation."""
    link = db_session.exec(select(OrganizationJoinLink).where(
        OrganizationJoinLink.link_uuid == link_uuid,
        OrganizationJoinLink.status == "active",
        OrganizationJoinLink.expires_at > datetime.utcnow(),
        OrganizationJoinLink.redemption_count < OrganizationJoinLink.max_redemptions,
    )).first()
    if not link:
        raise HTTPException(status_code=400, detail="Invite link is no longer active")
    if link.approved_email_domain and not email.strip().casefold().endswith(f"@{link.approved_email_domain}"):
        raise HTTPException(status_code=403, detail="Use an email address from the approved domain")
    link.redemption_count += 1
    if link.redemption_count >= link.max_redemptions:
        link.status = "exhausted"
    db_session.add(link)
    return link


def send_direct_invitation_email(
    org: OrganizationRead,
    user: UserRead,
    email: EmailStr,
    invitation_token: str,
    base_url: str,
    setup: dict | None = None,
):
    """Send a recipient-specific invitation without a managed signup code.

    ``setup`` (services/orgs/staff_setup.describe) adds the inviter's note and, for staff, the assignments
    they'll be on or what they'll be able to do.
    """
    signup_url = f"{base_url}/signup?invitation={quote(invitation_token, safe='')}"
    setup = setup or {}
    inviter = " ".join(part for part in (user.first_name, user.last_name) if part) or f"@{user.username}"
    assignments = setup.get("assignments") or []
    first = assignments[0] if assignments else None
    subject = (f"{inviter} invited you to help run {first['assigned_to']} at {org.name}" if first and first.get("assigned_to")
               else f"{inviter} invited you to join {org.name}")
    note = f"<p style=\"padding:12px 14px;background:#f3f5f6;border-radius:12px\">{html.escape(setup['note'])}</p>" if setup.get("note") else ""
    if assignments:
        items = "".join(f"<li>{html.escape(row['assigned_to'])} · {html.escape(row['plan'])} ({html.escape(row['role_label'])})</li>" for row in assignments)
        start = f"<p><b>You're on</b></p><ul>{items}</ul>"
    elif setup.get("permissions"):
        items = "".join(f"<li>{html.escape(row['label'])}</li>" for row in setup["permissions"])
        start = f"<p><b>You'll be able to</b></p><ul>{items}</ul>"
    else:
        start = ""
    send_email(
        to=email,
        subject=subject,
        body=f"""
<html>
    <body>
        <p>{html.escape(inviter)} invited you to join {html.escape(org.name)}.</p>
        {note}
        {start}
        <p><a href="{signup_url}">Join {html.escape(org.name)}</a></p>
        <p>Works with an account you already have, or makes one in a minute. This invitation is for {html.escape(str(email))} and expires in 60 days.</p>
    </body>
</html>
""",
    )
    return True

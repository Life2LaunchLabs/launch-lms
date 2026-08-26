import logging
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, Request
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, func, select
from src.db.organization_invitations import (
    InviteRecipientResult,
    InviteUsersRequest,
    InviteUsersResponse,
    OrganizationInvitation,
)
from src.db.organizations import (
    Organization,
    OrganizationRead,
    OrganizationUser,
)
from src.db.roles import Role, RoleRead
from src.db.learning import LearningBadge, LearningBadgeStatus
from src.db.programs import ProgramAssignment, ProgramParticipant
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup, UserGroupRead
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.features_utils.usage import (
    check_admin_seat_limit,
    check_limits_with_usage,
    decrease_feature_usage,
    increase_feature_usage,
    is_role_dashboard_enabled,
)
from src.security.org_auth import get_user_org, is_org_member
from src.security.rbac.constants import ADMIN_ROLE_ID
from src.services.email.utils import get_base_url_from_request
from src.services.orgs.invites import send_direct_invitation_email
from src.services.orgs.orgs import rbac_check
from src.services.users.usergroups import create_usergroup


_email_adapter = TypeAdapter(EmailStr)


def normalize_email(email: str) -> str:
    """Normalize for identity matching without provider-specific rewriting."""
    local, separator, domain = email.strip().rpartition("@")
    if not separator:
        return email.strip().casefold()
    return f"{local.casefold()}@{domain.casefold()}"


def is_valid_email(email: str) -> bool:
    try:
        _email_adapter.validate_python(email.strip())
        return True
    except ValidationError:
        return False


def _get_owner_org(db_session: Session) -> Organization | None:
    return db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()


def _ensure_not_owner_org(org_id: int, db_session: Session) -> None:
    owner_org = _get_owner_org(db_session)
    if owner_org and owner_org.id == org_id:
        raise HTTPException(
            status_code=400,
            detail="Users cannot be removed from the owner organization",
        )


async def get_organization_users(
    request: Request,
    org_id: str,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    page: int = 1,
    limit: int = 20,
    search: str = "",
    usergroup_id: int | None = None,
    usergroup_filter: str | None = None,
    sort_order: str = "desc",
    role_id: int | None = None,
    status: str | None = None,
    active: bool | None = None,
    assigned_to_me: bool = False,
):
    """
    Get paginated list of users in an organization.

    SECURITY:
    - Requires authentication (enforced at router level)
    - User must be a member of the organization to view member list
    - Maximum limit enforced to prevent data dumping
    """
    # SECURITY: Enforce maximum limit
    limit = min(limit, 100)
    page = max(page, 1)

    statement = select(Organization).where(Organization.id == org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # SECURITY: Verify current user is a member of this organization
    # This prevents users from enumerating members of orgs they don't belong to
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    # Membership check (superadmins bypass)
    if not is_org_member(current_user.id, org.id, db_session):
        raise HTTPException(
            status_code=403,
            detail="You must be a member of this organization to view its members",
        )

    # RBAC check (for additional permission verification) — skip for superadmins
    from src.security.superadmin import is_user_superadmin
    if not is_user_superadmin(current_user.id, db_session):
        await rbac_check(request, org.org_uuid, current_user, "read", db_session)

    # Base query for users in the organization
    base_statement = (
        select(User)
        .join(UserOrganization)
        .join(Organization)
        .where(Organization.id == org_id)
    )

    # Apply search filter if provided
    if search:
        search_pattern = f"%{search}%"
        base_statement = base_statement.where(
            (User.first_name.ilike(search_pattern))
            | (User.last_name.ilike(search_pattern))
            | (User.username.ilike(search_pattern))
            | (User.email.ilike(search_pattern))
        )

    # Apply role filter
    if role_id is not None:
        base_statement = base_statement.where(UserOrganization.role_id == role_id)

    # Apply status filter (verified/unverified)
    if status == "verified":
        base_statement = base_statement.where(User.email_verified == True)
    elif status == "unverified":
        base_statement = base_statement.where(User.email_verified == False)

    # Active means an active program or a published badge is currently assigned.
    # Staff ownership lives on program assignments, so "assigned to me" narrows
    # the result to learners on programs owned by the current staff member.
    if active is not None or assigned_to_me:
        active_assignments = db_session.exec(
            select(ProgramAssignment).where(
                ProgramAssignment.org_id == int(org_id),
                ProgramAssignment.active == True,  # noqa: E712
            )
        ).all()
        relevant_assignments = [
            assignment for assignment in active_assignments
            if not assigned_to_me or current_user.id in (assignment.staff_user_ids or [])
        ]
        assignment_ids = [assignment.id for assignment in relevant_assignments if assignment.id is not None]
        assigned_user_ids: set[int] = {
            int(assignment.user_id)
            for assignment in relevant_assignments
            if assignment.user_id is not None
        }
        assigned_group_ids = {
            int(assignment.usergroup_id)
            for assignment in relevant_assignments
            if assignment.usergroup_id is not None
        }
        if assignment_ids:
            assigned_user_ids.update(db_session.exec(
                select(ProgramParticipant.user_id).where(
                    ProgramParticipant.assignment_id.in_(assignment_ids)  # type: ignore[union-attr]
                )
            ).all())
        if assigned_group_ids:
            assigned_user_ids.update(db_session.exec(
                select(UserGroupUser.user_id).where(
                    UserGroupUser.usergroup_id.in_(assigned_group_ids)  # type: ignore[union-attr]
                )
            ).all())

        if active is not None and not assigned_to_me:
            badge_group_ids = set(db_session.exec(
                select(UserGroupResource.usergroup_id)
                .join(LearningBadge, LearningBadge.badge_uuid == UserGroupResource.resource_uuid)
                .where(
                    UserGroupResource.org_id == int(org_id),
                    LearningBadge.status == LearningBadgeStatus.PUBLISHED,
                )
            ).all())
            if badge_group_ids:
                assigned_user_ids.update(db_session.exec(
                    select(UserGroupUser.user_id).where(
                        UserGroupUser.usergroup_id.in_(badge_group_ids)  # type: ignore[union-attr]
                    )
                ).all())

        if active is False:
            base_statement = base_statement.where(User.id.not_in(assigned_user_ids))
        else:
            base_statement = base_statement.where(User.id.in_(assigned_user_ids))

    # Compute group membership counts when usergroup_id is provided (before applying filter)
    in_group_total = None
    all_total = None
    if usergroup_id is not None:
        # Count all org users matching search (unfiltered) using SQL COUNT
        all_count_stmt = select(func.count()).select_from(base_statement.subquery())
        all_total = db_session.exec(all_count_stmt).one()

        # Count in-group users matching search using SQL COUNT
        in_group_count_stmt = (
            select(func.count(User.id))
            .join(UserOrganization)
            .join(Organization)
            .where(Organization.id == org_id)
            .join(UserGroupUser, (UserGroupUser.user_id == User.id) & (UserGroupUser.usergroup_id == usergroup_id))
        )
        if search:
            search_pattern = f"%{search}%"
            in_group_count_stmt = in_group_count_stmt.where(
                (User.first_name.ilike(search_pattern))
                | (User.last_name.ilike(search_pattern))
                | (User.username.ilike(search_pattern))
                | (User.email.ilike(search_pattern))
            )
        in_group_total = db_session.exec(in_group_count_stmt).one()

    # Apply usergroup membership filter
    if usergroup_id is not None and usergroup_filter:
        if usergroup_filter == "in_group":
            base_statement = base_statement.join(
                UserGroupUser,
                (UserGroupUser.user_id == User.id) & (UserGroupUser.usergroup_id == usergroup_id),
            )
        elif usergroup_filter == "not_in_group":
            ugu_alias = aliased(UserGroupUser)
            base_statement = base_statement.outerjoin(
                ugu_alias,
                (ugu_alias.user_id == User.id) & (ugu_alias.usergroup_id == usergroup_id),
            ).where(ugu_alias.id == None)  # noqa: E711

    # Get total count using SQL COUNT
    total = db_session.exec(select(func.count()).select_from(base_statement.subquery())).one()

    # Sort by join date — use UserOrganization.id as it's auto-increment
    # and directly correlates with join order (creation_date is a str, unreliable for sorting)
    if sort_order == "asc":
        base_statement = base_statement.order_by(UserOrganization.id.asc())
    else:
        base_statement = base_statement.order_by(UserOrganization.id.desc())

    # Apply pagination
    offset = (page - 1) * limit
    paginated_statement = base_statement.offset(offset).limit(limit)
    users = db_session.exec(paginated_statement).all()

    org_users_list = []

    if not users:
        pass
    else:
        user_ids = [user.id for user in users]

        # Batch fetch all UserOrganization records for these users
        user_orgs_statement = select(UserOrganization).where(
            UserOrganization.user_id.in_(user_ids),  # type: ignore
            UserOrganization.org_id == org_id
        )
        user_orgs = db_session.exec(user_orgs_statement).all()
        user_org_map = {uo.user_id: uo for uo in user_orgs}

        # Batch fetch all roles needed
        role_ids = list({uo.role_id for uo in user_orgs if uo.role_id is not None})
        if role_ids:
            roles_statement = select(Role).where(Role.id.in_(role_ids))  # type: ignore
            roles = db_session.exec(roles_statement).all()
            role_map = {role.id: role for role in roles}
        else:
            role_map = {}

        # Batch fetch all usergroups for these users in this org
        usergroups_statement = (
            select(UserGroupUser, UserGroup)
            .join(UserGroup, UserGroupUser.usergroup_id == UserGroup.id)  # type: ignore
            .where(
                UserGroupUser.user_id.in_(user_ids),  # type: ignore
                UserGroupUser.org_id == org_id
            )
        )
        usergroup_results = db_session.exec(usergroups_statement).all()
        user_usergroups_map: dict[int, list[UserGroupRead]] = {}
        for ugu, ug in usergroup_results:
            user_usergroups_map.setdefault(ugu.user_id, []).append(
                UserGroupRead.model_validate(ug)
            )

        for user in users:
            user_org = user_org_map.get(user.id)
            if not user_org:
                logging.error(f"User {user.id} not found")
                continue

            role = role_map.get(user_org.role_id)
            if not role:
                logging.error(f"Role {user_org.role_id} not found")
                continue

            user_read = UserRead.model_validate(user)
            role_read = RoleRead.model_validate(role)
            usergroups = user_usergroups_map.get(user.id, [])

            org_user = OrganizationUser(
                user=user_read,
                role=role_read,
                usergroups=usergroups,
                joined_at=user_org.creation_date,
            )

            org_users_list.append(org_user)

    result = {
        "items": org_users_list,
        "total": total,
        "page": page,
        "limit": limit,
    }

    if in_group_total is not None:
        result["in_group_total"] = in_group_total
    if all_total is not None:
        result["all_total"] = all_total

    return result


async def leave_current_user_from_org(
    request: Request,
    org_id: int,
    db_session: Session,
    current_user: PublicUser,
):
    statement = select(Organization).where(Organization.id == org_id)
    org = db_session.exec(statement).first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    _ensure_not_owner_org(org_id, db_session)

    user_org = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == current_user.id,
            UserOrganization.org_id == org.id,
        )
    ).first()

    if not user_org:
        raise HTTPException(
            status_code=404,
            detail="You are not a member of this organization",
        )

    admins = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.org_id == org.id,
            UserOrganization.role_id == ADMIN_ROLE_ID,
        )
    ).all()

    if len(admins) == 1 and admins[0].user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You can't leave the last admin role in the organization",
        )

    db_session.delete(user_org)
    db_session.commit()

    from src.routers.users import _invalidate_session_cache
    _invalidate_session_cache(current_user.id)

    decrease_feature_usage("members", org_id, db_session)

    return {"detail": "Left organization"}


async def remove_user_from_org(
    request: Request,
    org_id: int,
    user_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
):
    statement = select(Organization).where(Organization.id == org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    _ensure_not_owner_org(org_id, db_session)

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "delete", db_session)

    statement = select(UserOrganization).where(
        UserOrganization.user_id == user_id, UserOrganization.org_id == org.id
    )
    result = db_session.exec(statement)

    user_org = result.first()

    if not user_org:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # Check if user is the last admin
    statement = select(UserOrganization).where(
        UserOrganization.org_id == org.id, UserOrganization.role_id == ADMIN_ROLE_ID
    )
    result = db_session.exec(statement)
    admins = result.all()

    if len(admins) == 1 and admins[0].user_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="You can't remove the last admin of the organization",
        )

    db_session.delete(user_org)
    db_session.commit()

    from src.routers.users import _invalidate_session_cache
    _invalidate_session_cache(user_id)

    decrease_feature_usage("members", org_id, db_session)

    return {"detail": "User removed from org"}


async def remove_batch_users_from_org(
    request: Request,
    org_id: int,
    user_ids: list[int],
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
):
    statement = select(Organization).where(Organization.id == org_id)
    result = db_session.exec(statement)

    org = result.first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    _ensure_not_owner_org(org_id, db_session)

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "delete", db_session)

    # Get all admins for last-admin protection
    admin_statement = select(UserOrganization).where(
        UserOrganization.org_id == org.id, UserOrganization.role_id == ADMIN_ROLE_ID
    )
    admins = db_session.exec(admin_statement).all()
    admin_ids = {a.user_id for a in admins}

    # Check if removing these users would remove all admins
    remaining_admins = admin_ids - set(user_ids)
    if len(admin_ids) > 0 and len(remaining_admins) == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove all admins from the organization",
        )

    removed_count = 0
    for user_id in user_ids:
        statement = select(UserOrganization).where(
            UserOrganization.user_id == user_id, UserOrganization.org_id == org.id
        )
        user_org = db_session.exec(statement).first()

        if user_org:
            db_session.delete(user_org)
            removed_count += 1

    db_session.commit()

    from src.routers.users import _invalidate_session_cache
    for uid in user_ids:
        _invalidate_session_cache(uid)

    for _ in range(removed_count):
        decrease_feature_usage("members", org_id, db_session)

    return {"detail": f"{removed_count} user(s) removed from org"}


async def update_user_role(
    request: Request,
    org_id: str,
    user_id: str,
    role_uuid: str,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
):
    # find role
    statement = select(Role).where(Role.role_uuid == role_uuid)
    result = db_session.exec(statement)

    role = result.first()

    if not role:
        raise HTTPException(
            status_code=404,
            detail="Role not found",
        )

    role_id = role.id

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

    # Check if user is the last admin and if the new role is not admin
    statement = select(UserOrganization).where(
        UserOrganization.org_id == org.id, UserOrganization.role_id == ADMIN_ROLE_ID
    )
    result = db_session.exec(statement)
    admins = result.all()

    if not admins:
        raise HTTPException(
            status_code=400,
            detail="There is no admin in the organization",
        )

    if (
        len(admins) == 1
        and int(admins[0].user_id) == int(user_id)
        and str(role_uuid) != "role_global_admin"
    ):
        raise HTTPException(
            status_code=400,
            detail="Organization must have at least one admin",
        )

    statement = select(UserOrganization).where(
        UserOrganization.user_id == user_id, UserOrganization.org_id == org.id
    )
    result = db_session.exec(statement)

    user_org = result.first()

    if not user_org:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    if role_id is not None:
        user_org.role_id = role_id

    db_session.add(user_org)
    db_session.commit()
    db_session.refresh(user_org)

    from src.routers.users import _invalidate_session_cache
    _invalidate_session_cache(user_org.user_id)

    return {"detail": "User role updated"}


async def invite_batch_users(
    request: Request,
    org_id: int,
    invite_request: InviteUsersRequest,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()

    if not org or org.id is None:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    await rbac_check(request, org.org_uuid, current_user, "create", db_session)

    role = db_session.exec(
        select(Role).where(
            Role.id == invite_request.role_id,
            or_(Role.org_id == org.id, Role.org_id.is_(None)),
        )
    ).first()
    if not role:
        raise HTTPException(status_code=400, detail="Role is not available in this organization")

    # Only full administrators may grant dashboard-bearing roles. Maintainers can
    # still invite learners when their normal RBAC permissions allow it.
    if is_role_dashboard_enabled(role):
        inviter_membership = get_user_org(current_user.id, org.id, db_session)
        from src.security.superadmin import is_user_superadmin
        if not is_user_superadmin(current_user.id, db_session) and (
            not inviter_membership or inviter_membership.role_id != ADMIN_ROLE_ID
        ):
            raise HTTPException(status_code=403, detail="Only organization administrators can invite staff or administrators")

    if invite_request.usergroup_id and invite_request.new_usergroup_name:
        raise HTTPException(status_code=400, detail="Choose an existing group or create a new one, not both")
    if invite_request.new_usergroup_name is not None and not invite_request.new_usergroup_name.strip():
        raise HTTPException(status_code=400, detail="New group name is required")
    if invite_request.new_usergroup_name and len(invite_request.new_usergroup_name.strip()) > 120:
        raise HTTPException(status_code=400, detail="New group name must be 120 characters or fewer")
    if not any(is_valid_email(email) for email in invite_request.emails):
        raise HTTPException(status_code=400, detail="Enter at least one valid email address")

    usergroup_id = invite_request.usergroup_id
    if invite_request.new_usergroup_name:
        from src.db.usergroups import UserGroupCreate
        group = await create_usergroup(
            request,
            db_session,
            current_user,
            UserGroupCreate(
                name=invite_request.new_usergroup_name.strip(),
                description="Created while inviting learners",
                org_id=org.id,
            ),
        )
        usergroup_id = group.id

    if usergroup_id is not None:
        group = db_session.exec(
            select(UserGroup).where(UserGroup.id == usergroup_id, UserGroup.org_id == org.id)
        ).first()
        if not group:
            raise HTTPException(status_code=400, detail="Group is not available in this organization")
        if is_role_dashboard_enabled(role):
            raise HTTPException(status_code=400, detail="Groups can only be assigned with learner invitations")

    now = datetime.utcnow()
    expires_at = now + timedelta(days=60)
    results: list[InviteRecipientResult] = []
    new_invitations: list[OrganizationInvitation] = []
    seen: set[str] = set()

    for raw_email in invite_request.emails:
        entered_email = raw_email.strip()
        try:
            validated_email = str(_email_adapter.validate_python(entered_email))
        except ValidationError:
            results.append(InviteRecipientResult(email=entered_email, status="invalid", detail="Enter a valid email address"))
            continue

        normalized = normalize_email(validated_email)
        if normalized in seen:
            results.append(InviteRecipientResult(email=validated_email, status="duplicate", detail="Duplicate in this batch"))
            continue
        seen.add(normalized)

        target_user = db_session.exec(
            select(User).where(func.lower(User.email) == normalized)
        ).first()
        if target_user and db_session.exec(
            select(UserOrganization).where(
                UserOrganization.org_id == org.id,
                UserOrganization.user_id == target_user.id,
            )
        ).first():
            results.append(InviteRecipientResult(email=validated_email, status="already_member"))
            continue

        pending = db_session.exec(
            select(OrganizationInvitation).where(
                OrganizationInvitation.org_id == org.id,
                OrganizationInvitation.email_normalized == normalized,
                OrganizationInvitation.status == "pending",
            )
        ).first()
        if pending and pending.expires_at > now:
            results.append(InviteRecipientResult(email=validated_email, status="already_invited"))
            continue
        if pending:
            pending.status = "expired"
            pending.updated_at = now
            db_session.add(pending)
            db_session.flush()

        check_limits_with_usage("members", org.id, db_session)
        if is_role_dashboard_enabled(role):
            check_admin_seat_limit(org.id, db_session)

        invitation = OrganizationInvitation(
            invitation_uuid=f"org_invitation_{uuid4()}",
            org_id=org.id,
            email=validated_email,
            email_normalized=normalized,
            role_id=role.id or invite_request.role_id,
            usergroup_id=usergroup_id,
            target_user_id=target_user.id if target_user else None,
            created_by_user_id=current_user.id,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )
        db_session.add(invitation)
        db_session.flush()
        new_invitations.append(invitation)
        results.append(InviteRecipientResult(email=validated_email, status="invited"))

    db_session.commit()

    org_read = OrganizationRead.model_validate(org)
    user_read = UserRead.model_validate(user)
    base_url = get_base_url_from_request(request)
    for invitation in new_invitations:
        try:
            invitation.email_sent = bool(send_direct_invitation_email(
                org_read,
                user_read,
                invitation.email,
                invitation.invitation_uuid,
                base_url,
            ))
        except Exception:
            logging.exception("Failed to send organization invitation to %s", invitation.email)
            invitation.email_sent = False
        invitation.delivery_attempts = 1
        invitation.updated_at = datetime.utcnow()
    db_session.commit()

    for _invitation in new_invitations:
        increase_feature_usage("members", org.id, db_session)
    if is_role_dashboard_enabled(role):
        for _invitation in new_invitations:
            increase_feature_usage("admin_seats", org.id, db_session)

    return InviteUsersResponse(created=len(new_invitations), results=results, usergroup_id=usergroup_id)


async def get_list_of_invited_users(
    request: Request,
    org_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "read", db_session)

    now = datetime.utcnow()
    invitations = db_session.exec(
        select(OrganizationInvitation).where(
            OrganizationInvitation.org_id == org_id,
            OrganizationInvitation.status == "pending",
            OrganizationInvitation.expires_at > now,
        ).order_by(OrganizationInvitation.created_at.desc())
    ).all()
    role_ids = {invitation.role_id for invitation in invitations}
    roles = db_session.exec(select(Role).where(Role.id.in_(role_ids))).all() if role_ids else []
    role_map = {role.id: role for role in roles}
    group_ids = {invitation.usergroup_id for invitation in invitations if invitation.usergroup_id}
    groups = db_session.exec(select(UserGroup).where(UserGroup.id.in_(group_ids))).all() if group_ids else []
    group_map = {group.id: group for group in groups}

    return [{
        "invitation_uuid": invitation.invitation_uuid,
        "email": invitation.email,
        "pending": True,
        "status": invitation.status,
        "email_sent": invitation.email_sent,
        "created_at": invitation.created_at.isoformat(),
        "expires_at": invitation.expires_at.isoformat(),
        "role": RoleRead.model_validate(role_map[invitation.role_id]).model_dump() if invitation.role_id in role_map else None,
        "usergroup": UserGroupRead.model_validate(group_map[invitation.usergroup_id]).model_dump() if invitation.usergroup_id in group_map else None,
    } for invitation in invitations]


async def remove_invited_user(
    request: Request,
    org_id: int,
    invitation_uuid: str,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
):
    org = db_session.exec(select(Organization).where(Organization.id == org_id)).first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="Organization not found",
        )

    # RBAC check
    await rbac_check(request, org.org_uuid, current_user, "delete", db_session)

    invitation = db_session.exec(
        select(OrganizationInvitation).where(
            OrganizationInvitation.org_id == org_id,
            OrganizationInvitation.invitation_uuid == invitation_uuid,
            OrganizationInvitation.status == "pending",
        )
    ).first()
    if not invitation:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found",
        )

    role = db_session.exec(select(Role).where(Role.id == invitation.role_id)).first()
    invitation.status = "revoked"
    invitation.updated_at = datetime.utcnow()
    db_session.add(invitation)
    db_session.commit()

    decrease_feature_usage("members", org_id, db_session)
    if role and is_role_dashboard_enabled(role):
        decrease_feature_usage("admin_seats", org_id, db_session)

    return {"detail": "Invitation revoked"}

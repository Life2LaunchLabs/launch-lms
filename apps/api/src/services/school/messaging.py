"""An organization's messaging policy, and where Connect enforces it.

The policy is the ``messaging`` block of the organization's config (see ``MessagingPolicy``):
whether staff and learners may chat one to one, whether a learner's plan feed needs two staff
before it takes messages, and whether helpers wait for an admin before joining a plan. Helpers
are never messaged directly, whatever the policy says.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from src.db.conversations import Conversation, ConversationMember
from src.db.organization_config import MessagingPolicy, OrganizationConfig
from src.db.organizations import Organization
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services.school import roles

FEED_NEEDS_STAFF = "needs_two_staff"
HELPER_DM = "Helpers are reached only in the plan feed they were invited to."


def _config(db: Session, org_id: int) -> OrganizationConfig | None:
    return db.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)).first()


def policy(db: Session, org_id: int) -> MessagingPolicy:
    row = _config(db, org_id)
    return MessagingPolicy.model_validate(((row.config if row else None) or {}).get("messaging") or {})


def get_policy(db: Session, current_user: PublicUser, org_id: int) -> dict:
    roles.require_staff(db, current_user.id, org_id)
    return policy(db, org_id).model_dump()


def update_policy(db: Session, current_user: PublicUser, org_id: int, payload: MessagingPolicy) -> dict:
    require_org_admin(current_user.id, org_id, db)
    row = _config(db, org_id)
    if not row:
        row = OrganizationConfig(org_id=org_id, config={}, creation_date=str(datetime.now()))
    row.config = {**(row.config or {}), "messaging": payload.model_dump()}
    row.update_date = str(datetime.now())
    db.add(row)
    db.commit()
    return payload.model_dump()


def _org_name(db: Session, org_id: int) -> str:
    org = db.get(Organization, org_id)
    return org.name if org else "This organization"


def _shared_orgs(db: Session, a: int, b: int) -> set[int]:
    """Organizations either person is a member or a helper of, where the other is too."""
    from src.db.goals import Goal, GoalOwnership
    from src.db.goal_sharing import PlanCollaborator
    from src.db.user_organizations import UserOrganization

    def orgs_of(user_id: int) -> set[int]:
        member = set(db.exec(select(UserOrganization.org_id).where(UserOrganization.user_id == user_id)).all())
        helping = set(db.exec(select(Goal.org_id).join(PlanCollaborator, PlanCollaborator.goal_id == Goal.id).where(
            PlanCollaborator.user_id == user_id, PlanCollaborator.active == True, Goal.ownership == GoalOwnership.EXTERNAL.value,  # noqa: E712
        )).all())
        return {int(org_id) for org_id in member | helping if org_id}

    return orgs_of(a) & orgs_of(b)


def direct_block(db: Session, a: int, b: int) -> str | None:
    """Why these two people can't chat one to one, or None when they can.

    Staff never message an organization's helpers directly, and with ``staff_dm_learners`` off
    they don't message its learners directly either: those conversations happen in plan feeds.
    """
    for org_id in sorted(_shared_orgs(db, a, b)):
        role_a, role_b = roles.org_role(db, org_id, a), roles.org_role(db, org_id, b)
        pair = {role_a, role_b}
        if not pair & set(roles.STAFF_ROLES):
            continue
        if "helper" in pair:
            return HELPER_DM
        if "learner" in pair and not policy(db, org_id).staff_dm_learners:
            return f"{_org_name(db, org_id)} keeps staff and learner messages in plan feeds."
    return None


def feed_block(db: Session, conversation: Conversation) -> str | None:
    """Why a learner's plan feed can't take messages yet: with the two-staff rule on, it needs a second staff member."""
    from src.services.school.chats import SCHOOL

    if conversation.kind != SCHOOL or not conversation.org_id or not policy(db, int(conversation.org_id)).min_two_staff_on_feeds:
        return None
    staff = roles.staff_ids(db, int(conversation.org_id))
    on_feed = {member.user_id for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()} & staff
    return None if len(on_feed) >= 2 else FEED_NEEDS_STAFF


def feed_block_message(db: Session, conversation: Conversation) -> str:
    return f"{_org_name(db, int(conversation.org_id or 0))} needs at least two staff on a plan feed before it takes messages. Add another staff member to the learner's group or plan."

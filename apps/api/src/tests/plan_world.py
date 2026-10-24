"""Shared test worlds: organizations, people, and plans that earn a badge.

``_setup`` is a small two-org world for services that need people and orgs;
``_world`` is Studio (1) owning two published plans that earn the Adaptability
badge, with Partner (2) approved to run them and Stranger (3) not.
"""

from sqlmodel import Session, select
from starlette.requests import Request

from src.db.badges import BadgeAward
from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goal_sharing import OrganizationPlanRole, PlanActivity, PlanCollaborator, PlanInvitation, PlanRole
from src.db.goal_templates import AssignmentCollaborator, GoalAssignmentRequest
from src.db.goals import Goal, GoalAssignment, GoalStage, GoalStep, GoalStory, GoalTemplate, GoalTemplateVersion, StepEntry, StepProgress, StepStatus, StepStatusChange
from src.db.learning import LearningActivity, LearningPage, LearningPageProgress, LearningResponseAttempt, LearningRun
from src.db.organization_config import OrganizationConfig
from src.db.organizations import Organization
from src.db.plan_joining import PlanJoinRequest
from src.db.plan_requests import PlanRequest
from src.db.portfolio import Portfolio
from src.db.roles import Role
from src.db.template_marketplace import GoalTemplateAuthorization, GoalTemplateLearnerAccess, GoalTemplateListing
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User

NOW = "2026-01-01T00:00:00+00:00"
PARTNER, STRANGER = 2, 3
STEPS = ({"key": "notice", "type": "task", "title": "Notice change"}, {"key": "story", "type": "task", "title": "Your story"})
BADGE = {"kind": "Badge", "name": "Adaptability", "skills": ["Adaptability"]}


def _request() -> Request:
    return Request({
        "type": "http",
        "headers": [(b"origin", b"http://localhost:3000")],
        "scheme": "http",
        "server": ("localhost", 8000),
        "path": "/",
        "query_string": b"",
    })


def _create_tables(engine) -> None:
    for model in (
        Organization, OrganizationConfig, PlanRequest, User, UserOrganization, Role, Portfolio,
        LearningActivity, LearningPage, LearningRun, LearningPageProgress, LearningResponseAttempt,
        GoalTemplate, GoalTemplateListing, GoalTemplateAuthorization, GoalTemplateLearnerAccess,
        PlanRole, PlanCollaborator, PlanInvitation, PlanActivity, OrganizationPlanRole,
        GoalTemplateVersion, GoalAssignment, Goal, GoalStage, GoalStep, StepProgress, StepEntry, GoalStory,
        BadgeAward, PlanJoinRequest,
        # Goals keep their chats in step (services/connect/workspace.py).
        Conversation, ConversationMember, ConversationMessage, ConversationMessageRef,
        UserGroup, UserGroupUser,
    ):
        model.__table__.create(engine, checkfirst=True)


def _create_org(session: Session, *, org_id: int, slug: str, tier: str = "enterprise") -> Organization:
    org = Organization(id=org_id, org_uuid=f"org_{org_id}", name=slug.capitalize(), slug=slug, email=f"{slug}@example.com", creation_date=NOW, update_date=NOW)
    session.add(org)
    session.add(OrganizationConfig(
        org_id=org_id,
        config={"config_version": "3.0", "tier": tier, "partners": ["badge_publisher"] if tier != "free" else []},
        creation_date=NOW, update_date=NOW,
    ))
    session.commit()
    return org


def _create_user(session: Session, *, user_id: int, username: str, org_id: int | None = None, role_id: int = 1) -> PublicUser:
    session.add(User(id=user_id, user_uuid=f"user_{user_id}", username=username, email=f"{username}@example.com",
                     first_name=username.capitalize(), last_name="Test", creation_date=NOW, update_date=NOW))
    if org_id is not None:
        session.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date=NOW, update_date=NOW))
    session.commit()
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=username, email=f"{username}@example.com", first_name=username.capitalize(), last_name="Test")


def _badge_plan(session: Session, admin: PublicUser, org_id: int, title: str = "Adaptability", badge: dict | None = None, steps=STEPS) -> GoalTemplate:
    """A published plan of the organization that earns a badge."""
    from src.services.goals import templates

    document = {"template": {"title": title}, "stages": [{"key": "start", "title": "Start", "steps": [dict(step) for step in steps]}], "badge": dict(badge or BADGE)}
    created = templates.create_template(session, admin, org_id, document)
    templates.publish(session, admin, org_id, created["template_uuid"], "First")
    return templates.template_or_404(session, org_id, created["template_uuid"])


def _setup(session: Session):
    """Two orgs: creator (1) with admin alice, issuer (2) with admin bob; learner carol (no org); a plan of the creator's that earns a badge."""
    creator_org = _create_org(session, org_id=1, slug="creator")
    issuer_org = _create_org(session, org_id=2, slug="issuer")
    alice = _create_user(session, user_id=1, username="alice", org_id=1)
    bob = _create_user(session, user_id=2, username="bob", org_id=2)
    carol = _create_user(session, user_id=3, username="carol")
    return creator_org, issuer_org, alice, bob, carol, _badge_plan(session, alice, 1)


# Studio, Partner and Stranger --------------------------------------------------------------------------

def _world(plans: bool = True):
    """Studio (1) owns two published plans that earn Adaptability; Partner (2) is approved on both (unless
    ``plans`` is False); Stranger (3) isn't."""
    from src.tests.plan_permissions import approve_on_plans
    from src.tests.test_goal_sharing import _session as _sharing_session
    from src.tests.test_goals import ADMIN, LEARNER, _user

    db = _sharing_session()
    PlanJoinRequest.__table__.create(db.get_bind(), checkfirst=True)
    for org_id, name in ((PARTNER, "Partner"), (STRANGER, "Stranger")):
        db.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=name, slug=name.lower(), email=f"{name}@example.com", creation_date=NOW, update_date=NOW))
        db.add(UserOrganization(user_id=ADMIN, org_id=org_id, role_id=1, creation_date=NOW, update_date=NOW))
        db.add(UserOrganization(user_id=LEARNER, org_id=org_id, role_id=4, creation_date=NOW, update_date=NOW))
    db.commit()
    plans_ = [_badge_plan(db, _user(ADMIN), 1, title) for title in ("Adaptability", "Adaptability at work")]
    if plans:
        approve_on_plans(db, PARTNER, [int(plan.id) for plan in plans_])  # type: ignore[arg-type]
    return db, plans_


def _assign(db, org_id: int, template_uuid: str, **extra) -> dict:
    from src.services.goals import assignments
    from src.tests.test_goals import ADMIN, LEARNER, _user

    payload = GoalAssignmentRequest(user_id=LEARNER, collaborators=[AssignmentCollaborator(user_id=ADMIN)], **extra)
    return assignments.assign(db, _user(ADMIN), org_id, template_uuid, payload)


def _finish(db, goal: Goal) -> None:
    from src.services.goals import goals
    from src.tests.test_goals import LEARNER, _user

    if db.get(Goal, goal.id).status == "pending":
        goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
    view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
    for stage in view["stages"]:
        for step in stage["steps"]:
            goals.change_status(db, _user(LEARNER), goal.goal_uuid, step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))


def _goal_of(db, result: dict) -> Goal:
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
    return db.exec(select(Goal).where(Goal.assignment_id == assignment.id)).one()

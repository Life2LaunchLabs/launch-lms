"""User tests phase 2: the cohort seal, blocked persona actions, hiding personas, leak audit and purge."""

import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select
from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.messages import InboxMessage
from src.db.organization_invitations import OrganizationInvitation
from src.db.organizations import Organization
from src.db.plan_requests import PlanRequest
from src.db.resources import Resource, ResourceComment
from src.db.user_organizations import UserOrganization
from src.db.user_tests import TestCohort, TestCohortOrg, TestMail
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User
from src.security.rbac.constants import ADMIN_ROLE_ID, USER_ROLE_ID
from src.services.user_tests import cleanup, cohorts, personas, sessions
from src.services.user_tests.seal import CohortSealError
from src.services.user_tests.visibility import visible_orgs, visible_people

@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("LAUNCHLMS_USER_TESTS_ENABLED", "true")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)  # the leak audit reads every table
    import src.core.events.database as database

    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr("src.routers.users._invalidate_session_cache", lambda user_id: None, raising=False)
    with Session(engine) as session:
        session.add(Organization(id=1, name="Launch", slug="launch", email="team@example.com", org_uuid="org_main", creation_date="", update_date=""))
        session.add(Organization(id=2, name="Real High", slug="real-high", email="office@example.com", org_uuid="org_real", creation_date="", update_date=""))
        session.add(_user(1, "admin@example.com"))
        session.add(_user(2, "real.learner@example.com"))
        session.add(UserOrganization(user_id=1, org_id=1, role_id=ADMIN_ROLE_ID, creation_date="", update_date=""))
        session.add(UserOrganization(user_id=2, org_id=1, role_id=USER_ROLE_ID, creation_date="", update_date=""))
        session.commit()
        token = sessions.current_test_persona.set(None)
        try:
            yield session
        finally:
            sessions.current_test_persona.reset(token)


def _user(user_id: int, email: str) -> User:
    return User(id=user_id, username=email.split("@")[0], first_name="Real", last_name="Person", email=email, user_uuid=f"user_{user_id}", creation_date="", update_date="")


def _cohort(db: Session, name: str = "Riverside onboarding") -> dict:
    return cohorts.create_cohort(db, 1, cohorts.CreateCohort(name=name))


def _persona(db: Session, cohort: dict, first_name: str = "Maya", **extra) -> dict:
    body = personas.CreatePersonas(personas=[personas.CreatePersona(first_name=first_name, **extra)])
    return asyncio.run(personas.create_personas(db, cohort["cohort_uuid"], body))[0]


def _refused(db: Session, *rows) -> CohortSealError:
    for row in rows:
        db.add(row)
    with pytest.raises(CohortSealError) as refused:
        db.commit()
    db.rollback()
    return refused.value


def _member(user_id: int, org_id: int) -> UserOrganization:
    return UserOrganization(user_id=user_id, org_id=org_id, role_id=USER_ROLE_ID, creation_date="", update_date="")


def _conversation(db: Session, created_by: int, org_id: int = 1, members=()) -> Conversation:
    conversation = Conversation(conversation_uuid=f"c_{created_by}_{len(members)}_{datetime.utcnow().timestamp()}", org_id=org_id, created_by_user_id=created_by)
    db.add(conversation)
    db.commit()
    for user_id in members:
        db.add(ConversationMember(conversation_id=conversation.id, user_id=user_id))
    db.commit()
    return conversation


def _invite(org_id: int, email: str) -> OrganizationInvitation:
    return OrganizationInvitation(invitation_uuid=f"inv_{org_id}_{email}", org_id=org_id, email=email, email_normalized=email.lower(), role_id=USER_ROLE_ID, expires_at=datetime.utcnow() + timedelta(days=7))


def test_personas_join_the_main_org_but_never_a_real_one(db):
    maya = _persona(db, _cohort(db))
    assert db.exec(select(UserOrganization).where(UserOrganization.user_id == maya["user_id"])).one().org_id == 1
    error = _refused(db, _member(maya["user_id"], 2))
    assert error.status_code == 403 and error.detail["code"] == "test_cohort_sealed"


def test_real_people_never_join_a_test_org(db):
    cohort = _cohort(db)
    _persona(db, cohort, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    _refused(db, _member(2, test_org))


def test_personas_and_real_people_never_share_a_conversation(db):
    cohort = _cohort(db)
    maya, leo = _persona(db, cohort), _persona(db, cohort, first_name="Leo")
    # Personas talk among themselves in the main org.
    ours = _conversation(db, maya["user_id"], members=[maya["user_id"], leo["user_id"]])
    db.add(ConversationMessage(message_uuid="m1", conversation_id=ours.id, sender_user_id=leo["user_id"], body="hi"))
    db.commit()
    # A persona can't pull a real learner in, or post in a real learner's conversation.
    _refused(db, ConversationMember(conversation_id=ours.id, user_id=2))
    theirs = _conversation(db, 2, members=[2])
    _refused(db, ConversationMember(conversation_id=theirs.id, user_id=maya["user_id"]))
    _refused(db, ConversationMessage(message_uuid="m2", conversation_id=theirs.id, sender_user_id=maya["user_id"], body="hello"))


def test_cohorts_are_sealed_from_each_other(db):
    maya = _persona(db, _cohort(db, "Run one"))
    ana = _persona(db, _cohort(db, "Run two"), first_name="Ana")
    conversation = _conversation(db, maya["user_id"], members=[maya["user_id"]])
    _refused(db, ConversationMember(conversation_id=conversation.id, user_id=ana["user_id"]))


def test_invitations_by_address_stay_inside_one_world(db):
    cohort = _cohort(db)
    _persona(db, cohort, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    maya = _persona(db, cohort)
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    db.add(_invite(test_org, maya["email"]))  # a persona inviting a persona in its cohort
    db.commit()
    _refused(db, _invite(2, maya["email"]))  # a real school inviting a persona
    _refused(db, _invite(test_org, "someone@example.com"))  # a test org inviting a real address
    db.add(_invite(2, "new.teacher@example.com"))  # real to real is untouched
    db.commit()


def test_personas_cant_change_who_they_are_but_real_users_can(db):
    maya = _persona(db, _cohort(db))
    persona = db.get(User, maya["user_id"])
    persona.email = "maya@example.com"
    _refused(db, persona)
    persona = db.get(User, maya["user_id"])
    persona.password = "new hash"
    _refused(db, persona)
    real = db.get(User, 2)
    real.email = "new.address@example.com"
    db.add(real)
    db.commit()


def test_test_orgs_can_request_access_like_real_ones(db):
    """A persona's org applies for a partner program; a platform admin approves it as usual."""
    cohort = _cohort(db)
    _persona(db, cohort, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    db.add(PlanRequest(org_id=test_org, request_uuid="req_1", request_type="partner_application", requested_value="plan_publisher"))
    db.commit()
    from src.services.superadmin.orgs import list_all_plan_requests

    assert [row["is_test_org"] for row in list_all_plan_requests(db)] == [True]


def test_personas_cant_comment_on_resources_real_learners_read(db):
    cohort = _cohort(db)
    _persona(db, cohort, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    maya = _persona(db, cohort)
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    main_resource = Resource(org_id=1, resource_uuid="r_main", title="Main guide", resource_type="article", external_url="https://example.com/a")
    test_resource = Resource(org_id=test_org, resource_uuid="r_test", title="Test guide", resource_type="article", external_url="https://example.com/b")
    db.add_all([main_resource, test_resource])
    db.commit()
    _refused(db, ResourceComment(resource_id=main_resource.id, author_id=maya["user_id"], comment_uuid="rc1", body="Nice"))
    db.add(ResourceComment(resource_id=test_resource.id, author_id=maya["user_id"], comment_uuid="rc2", body="Nice"))
    db.commit()


def test_inbox_messages_from_staff_to_personas_are_refused(db):
    maya = _persona(db, _cohort(db))
    _refused(db, InboxMessage(message_uuid="msg_1", recipient_user_id=maya["user_id"], sender_user_id=1, sender_org_id=1, message_type="direct", subject="Hi", body="Hello"))


@pytest.mark.parametrize(("method", "path"), [
    ("PUT", "/api/v1/users/change_password/5"),
    ("POST", "/api/v1/orgs/3/api-tokens"),
    ("GET", "/api/v1/orgs/3/api-tokens"),
    ("POST", "/api/v1/payments/3/offers/abc/checkout"),
    ("POST", "/api/v1/auth/google/token"),
    ("POST", "/api/v1/oauth/authorize/decision"),
    ("DELETE", "/api/v1/users/user_id/5"),
])
def test_persona_sessions_cant_reach_past_the_cohort(method, path):
    with pytest.raises(HTTPException) as refused:
        sessions.refuse_blocked(method, path)
    assert refused.value.status_code == 403


def test_persona_sessions_use_the_app_normally():
    for method, path in [("GET", "/api/v1/plans"), ("POST", "/api/v1/goals/start"), ("GET", "/api/v1/payments/3/offers")]:
        sessions.refuse_blocked(method, path)


def test_real_users_never_see_personas_or_test_orgs(db):
    one, two = _cohort(db, "Run one"), _cohort(db, "Run two")
    maya = _persona(db, one, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    ana = _persona(db, two, first_name="Ana")
    people = lambda viewer: set(db.exec(select(User.id).where(visible_people(db, viewer, User.id))).all())  # noqa: E731
    orgs = lambda viewer: set(db.exec(select(Organization.id).where(visible_orgs(db, viewer, Organization.id))).all())  # noqa: E731
    assert people(2) == {1, 2}
    assert people(None) == {1, 2}
    assert people(maya["user_id"]) == {1, 2, maya["user_id"]}
    assert ana["user_id"] not in people(maya["user_id"])
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    assert test_org not in orgs(2) and test_org in orgs(maya["user_id"]) and test_org not in orgs(ana["user_id"])


def test_leak_audit_finds_mixed_groups_and_purge_waits_for_a_clean_audit(db):
    cohort = _cohort(db)
    maya = _persona(db, cohort)
    assert cleanup.audit(db, cohort["cohort_uuid"])["clean"]
    # The seal can't see who else is in a main-org group, so the audit has to.
    group = UserGroup(org_id=1, name="Class of 2027", description="", usergroup_uuid="ug_1")
    db.add(group)
    db.commit()
    db.add_all([UserGroupUser(usergroup_id=group.id, user_id=2, org_id=1), UserGroupUser(usergroup_id=group.id, user_id=maya["user_id"], org_id=1)])
    db.commit()
    report = cleanup.audit(db, cohort["cohort_uuid"])
    assert report["count"] == 1 and report["leaks"][0]["table"] == "usergroupuser"
    assert report["leaks"][0]["worlds"] == ["real", "this cohort"]
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException) as blocked:
        cleanup.purge(db, cohort["cohort_uuid"], dry_run=False)
    assert blocked.value.status_code == 409 and blocked.value.detail["code"] == "leaks_found"
    assert db.get(User, maya["user_id"]) is not None


def test_purge_deletes_only_the_cohort_and_keeps_its_mail(db):
    cohort = _cohort(db)
    with pytest.raises(HTTPException) as still_open:
        cleanup.purge(db, cohort["cohort_uuid"])
    assert still_open.value.status_code == 409
    dana = _persona(db, cohort, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    maya = _persona(db, cohort)
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    db.add(TestMail(cohort_id=db.exec(select(TestCohort.id)).one(), to_address=maya["email"], to_user_id=maya["user_id"], subject="Invite", reason="test_address"))
    db.commit()
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    preview = cleanup.purge(db, cohort["cohort_uuid"])
    assert preview["dry_run"] and preview["counts"] == {"personas": 2, "orgs": 1, "mail_kept": 1}
    assert db.get(User, maya["user_id"]) is not None
    done = cleanup.purge(db, cohort["cohort_uuid"], dry_run=False)
    assert done["status"] == "purged"
    assert db.get(User, maya["user_id"]) is None and db.get(User, dana["user_id"]) is None
    assert db.get(Organization, test_org) is None
    assert {user.id for user in db.exec(select(User)).all()} == {1, 2}
    assert {org.id for org in db.exec(select(Organization)).all()} == {1, 2}
    assert len(db.exec(select(TestMail)).all()) == 1
    assert cohorts.serialize(db, cohorts.get_cohort(db, cohort["cohort_uuid"]))["status"] == "purged"
    with pytest.raises(HTTPException):
        cleanup.purge(db, cohort["cohort_uuid"], dry_run=False)


def test_main_org_insights_leave_personas_out_for_real_viewers(db):
    from src.services.insights.context import _learner_memberships

    maya = _persona(db, _cohort(db))
    assert maya["user_id"] not in {row.user_id for row in _learner_memberships(db, 1, 1)}
    assert maya["user_id"] in {row.user_id for row in _learner_memberships(db, 1, maya["user_id"])}


def test_purge_removes_a_persona_who_owns_plans_and_an_org_that_assigned_them(db):
    # Postgres enforces the RESTRICT keys on goal.owner_user_id and goal_assignment.version_id;
    # turn SQLite's foreign keys on so this test does too.
    from sqlalchemy import text
    from src.db.goals import Goal, GoalAssignment, GoalTemplate, GoalTemplateVersion

    cohort = _cohort(db)
    dana = _persona(db, cohort, first_name="Dana", start_state="org_owner", org_name="Riverside High")
    maya = _persona(db, cohort)
    test_org = db.exec(select(TestCohortOrg)).one().org_id
    template = GoalTemplate(template_uuid="gt_1", org_id=test_org, title="Safety badge")
    db.add(template)
    db.commit()
    version = GoalTemplateVersion(version_uuid="gtv_1", template_id=template.id, org_id=test_org)
    db.add(version)
    db.commit()
    assignment = GoalAssignment(assignment_uuid="ga_1", org_id=test_org, template_id=template.id, version_id=version.id, user_id=maya["user_id"])
    db.add(assignment)
    db.commit()
    db.add_all([
        Goal(goal_uuid="g_1", owner_user_id=maya["user_id"], org_id=test_org, assignment_id=assignment.id, version_id=version.id, title="Safety badge"),
        Goal(goal_uuid="g_2", owner_user_id=maya["user_id"], org_id=1, title="Afford University of Oregon"),
    ])
    db.commit()
    db.execute(text("PRAGMA foreign_keys=ON"))
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    done = cleanup.purge(db, cohort["cohort_uuid"], dry_run=False)
    assert done["status"] == "purged"
    assert db.get(User, maya["user_id"]) is None and db.get(User, dana["user_id"]) is None
    assert db.get(Organization, test_org) is None
    assert db.exec(select(Goal)).all() == [] and db.exec(select(GoalAssignment)).all() == []

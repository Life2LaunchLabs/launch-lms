"""Learners find plans in Discover and join them: open plans start at once, others by request; a plan with a badge is one plan."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.badges import BadgeAward
from src.db.goals import Goal, GoalTemplate
from src.db.plan_joining import PlanJoin, PlanJoinRequest
from src.db.template_marketplace import TemplateLearnerAccessUpdate
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, User
from src.services.goals import plan_access, plan_joining, template_learners
from src.tests.plan_permissions import set_plan_permission
from src.tests.plan_world import PARTNER, STEPS, _world
from src.tests.test_goals import ADMIN, LEARNER, NOW, _published, _user

NEWCOMER = 9


def _setup():
    from src.db.organization_invitations import OrganizationInvitation, OrganizationJoinLink
    from src.db.plan_collections import PlanCollection, PlanCollectionItem

    db, plans = _world()
    for model in (PlanCollection, PlanCollectionItem, OrganizationInvitation, OrganizationJoinLink):
        model.__table__.create(db.get_bind(), checkfirst=True)
    db.add(User(id=NEWCOMER, user_uuid="user_9", username="nia", email="nia@example.com", first_name="Nia", last_name="New", creation_date=NOW, update_date=NOW))
    db.commit()
    return db, plans


def _offer(db, template: GoalTemplate, org_id: int, access: str) -> None:
    plan_access.set_access(db, int(template.id), org_id, access, None)  # type: ignore[arg-type]
    db.commit()


def _listed(db, user=None, org_id=None) -> dict[str, dict]:
    return {card["template_uuid"]: card for card in plan_joining.discover(db, user or AnonymousUser(), org_id)["plans"]}


def test_discover_lists_each_offered_plan_once_with_its_badge():
    db, (first, second) = _setup()
    with db:
        plain = _published(db, *STEPS)
        # Invite-only plans (the default) aren't in Discover.
        assert _listed(db) == {}
        _offer(db, first, 1, "open")
        _offer(db, plain, 1, "request")
        # Partner runs Studio's plan too: it's still one plan, the site organization's offer.
        _offer(db, first, PARTNER, "open")
        listed = _listed(db)
        assert set(listed) == {first.template_uuid, plain.template_uuid}
        assert listed[first.template_uuid]["badge"]["name"] == "Adaptability" and listed[first.template_uuid]["org"]["id"] == 1
        assert listed[plain.template_uuid]["badge"] is None and listed[plain.template_uuid]["access"] == "request"
        # On Partner's own site, its offers.
        assert set(_listed(db, org_id=PARTNER)) == {first.template_uuid}
        # An organization no longer approved on a plan doesn't offer it.
        _offer(db, second, PARTNER, "open")
        assert set(_listed(db, org_id=PARTNER)) == {first.template_uuid, second.template_uuid}
        set_plan_permission(db, PARTNER, "revoked", int(second.id))  # type: ignore[arg-type]
        assert set(_listed(db, org_id=PARTNER)) == {first.template_uuid}


def test_joining_an_open_plan_starts_it_at_the_offering_org_and_finishing_earns_the_badge_there():
    db, (first, _) = _setup()
    with db:
        _offer(db, first, PARTNER, "open")
        with pytest.raises(HTTPException) as not_offered:
            plan_joining.join(db, _user(NEWCOMER), first.template_uuid, PlanJoin(org_id=1))
        assert not_offered.value.status_code == 403
        joined = plan_joining.join(db, _user(NEWCOMER), first.template_uuid, PlanJoin(org_id=PARTNER))
        assert joined["status"] == "joined"
        goal = db.exec(select(Goal).where(Goal.goal_uuid == joined["goal_uuid"])).one()
        assert (goal.org_id, goal.source, goal.subject_user_id) == (PARTNER, "joined", NEWCOMER)
        # The newcomer became one of Partner's learners.
        assert db.exec(select(UserOrganization).where(UserOrganization.user_id == NEWCOMER)).one().org_id == PARTNER
        # Joining again returns the same plan, and Discover shows it as one to keep going on.
        assert plan_joining.join(db, _user(NEWCOMER), first.template_uuid, PlanJoin(org_id=PARTNER))["goal_uuid"] == goal.goal_uuid
        page = plan_joining.discover(db, _user(NEWCOMER), PARTNER)
        assert [card["template_uuid"] for card in page["keep_going"]] == [first.template_uuid] and page["plans"] == []

        _finish_as(db, goal, NEWCOMER)
        award = db.exec(select(BadgeAward)).one()
        assert (award.template_id, award.issuing_org_id, award.creator_org_id, award.user_id) == (first.id, PARTNER, 1, NEWCOMER)
        assert plan_joining.discover(db, _user(NEWCOMER), PARTNER)["earned_count"] == 1


def _finish_as(db, goal: Goal, user_id: int) -> None:
    from src.db.goals import StepStatus, StepStatusChange
    from src.services.goals import goals

    view = goals.get_goal(db, _user(user_id), goal.goal_uuid)
    for stage in view["stages"]:
        for step in stage["steps"]:
            goals.change_status(db, _user(user_id), goal.goal_uuid, step["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))


def test_a_plan_by_request_waits_for_the_organization_to_accept():
    db, (first, second) = _setup()
    with db:
        _offer(db, first, 1, "request")
        _offer(db, second, 1, "request")
        asked = plan_joining.join(db, _user(NEWCOMER), first.template_uuid, PlanJoin(org_id=1, message="Please"))
        assert asked["status"] == "requested" and db.exec(select(Goal)).all() == []
        assert _listed(db, _user(NEWCOMER))[first.template_uuid]["state"] == "requested"
        [waiting] = plan_joining.list_requests(db, _user(ADMIN), 1)
        assert (waiting["message"], waiting["user"]["id"], waiting["plan"]["template_uuid"]) == ("Please", NEWCOMER, first.template_uuid)
        with pytest.raises(HTTPException):
            plan_joining.list_requests(db, _user(LEARNER), 1)

        accepted = plan_joining.decide(db, _user(ADMIN), asked["request_uuid"], True)
        goal = db.exec(select(Goal).where(Goal.goal_uuid == accepted["goal_uuid"])).one()
        assert (goal.org_id, goal.subject_user_id, goal.source) == (1, NEWCOMER, "joined")
        with pytest.raises(HTTPException) as decided:
            plan_joining.decide(db, _user(ADMIN), asked["request_uuid"], False)
        assert decided.value.status_code == 409

        # Declined, then withdrawn: asking again reopens; cancelling takes it back.
        other = plan_joining.join(db, _user(NEWCOMER), second.template_uuid, PlanJoin(org_id=1))
        assert plan_joining.decide(db, _user(ADMIN), other["request_uuid"], False)["status"] == "rejected"
        assert plan_joining.join(db, _user(NEWCOMER), second.template_uuid, PlanJoin(org_id=1))["status"] == "requested"
        assert plan_joining.cancel(db, _user(NEWCOMER), second.template_uuid, 1) == {"status": "none"}
        assert db.exec(select(PlanJoinRequest).where(PlanJoinRequest.template_id == second.id)).all() == []


def test_an_alumnus_given_a_plan_they_asked_for_is_active_again():
    db, (first, _second) = _setup()
    with db:
        _offer(db, first, 1, "request")
        db.add(UserOrganization(user_id=NEWCOMER, org_id=1, role_id=4, status="alumni", creation_date=NOW, update_date=NOW))
        db.commit()
        asked = plan_joining.join(db, _user(NEWCOMER), first.template_uuid, PlanJoin(org_id=1))
        plan_joining.decide(db, _user(ADMIN), asked["request_uuid"], True)
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == NEWCOMER, UserOrganization.org_id == 1)).one()
        assert membership.status == "active"


def test_the_plan_page_is_public_for_a_plan_with_a_badge_and_lists_who_offers_it():
    db, (first, _) = _setup()
    with db:
        plain = _published(db, *STEPS)
        page = plan_joining.plan_page(db, AnonymousUser(), first.template_uuid)
        assert page["badge"]["name"] == "Adaptability" and page["offers"] == [] and page["stages"][0]["steps"][0]["title"] == "Notice change"
        with pytest.raises(HTTPException) as hidden:
            plan_joining.plan_page(db, AnonymousUser(), plain.template_uuid)
        assert hidden.value.status_code == 404
        _offer(db, first, PARTNER, "open")
        assert [card["org"]["id"] for card in plan_joining.plan_page(db, AnonymousUser(), first.template_uuid, PARTNER)["offers"]] == [PARTNER]


def test_template_learners_shows_the_badge_and_is_the_running_orgs_own_setting():
    db, (first, _) = _setup()
    with db:
        _offer(db, first, 1, "open")
        own = template_learners.template_learners(db, _user(ADMIN), 1, first.template_uuid)
        assert own["access"] == "open" and own["owned"] and own["earns_badge"] and own["badge"]["name"] == "Adaptability"
        # Partner runs Studio's plan read-only, but who may start it there is its own call.
        partner = template_learners.set_template_access(db, _user(ADMIN), PARTNER, first.template_uuid, TemplateLearnerAccessUpdate(access="request"))
        assert partner["access"] == "request" and not partner["owned"] and partner["earns_badge"]
        assert plan_access.access_of(db, int(first.id), 1) == "open"  # type: ignore[arg-type]
        set_plan_permission(db, PARTNER, "revoked")
        with pytest.raises(HTTPException) as refused:
            template_learners.set_template_access(db, _user(ADMIN), PARTNER, first.template_uuid, TemplateLearnerAccessUpdate(access="open"))
        assert refused.value.status_code in (403, 404)


def test_a_plan_request_is_a_card_in_the_askers_thread_and_the_answer_is_posted_to_them():
    from src.db.conversations import ConversationMessage
    from src.services.school import chats as school_chats, feed, threads

    db, (first, second) = _setup()
    with db:
        _offer(db, first, 1, "request")
        _offer(db, second, 1, "request")
        asked = plan_joining.join(db, _user(NEWCOMER), first.template_uuid, PlanJoin(org_id=1, message="Please"))
        # Nia isn't one of Studio's people yet; her thread is the request, and she's on top of the list.
        thread = threads.person_thread(db, _user(ADMIN), 1, NEWCOMER)
        assert (thread["role"], thread["counts"]["requests"]) == ("applicant", 1)
        assert [card["request_uuid"] for card in thread["plan_requests"]] == [asked["request_uuid"]]
        rows, _ = feed.active_rows(db, _user(ADMIN), 1)
        [row] = [row for row in rows if row["person"] and row["person"]["id"] == NEWCOMER]
        assert (row["role"], row["counts"]["approvals"], row["preview"]) == ("applicant", 1, f"Asks for “{first.title}”")

        plan_joining.decide(db, _user(ADMIN), asked["request_uuid"], True)
        other = plan_joining.join(db, _user(NEWCOMER), second.template_uuid, PlanJoin(org_id=1))
        plan_joining.decide(db, _user(ADMIN), other["request_uuid"], False)
        chat = school_chats.find(db, 1, NEWCOMER)
        assert chat is not None
        said = [message.body for message in db.exec(select(ConversationMessage).where(ConversationMessage.conversation_id == chat.id)).all()]
        accepted, declined = said[-2:]  # after the plan's own "Started" line
        assert first.title in accepted and "accepted" in accepted and second.title in declined and "declined" in declined
        # Answered, the card is gone; Nia is a learner now.
        thread = threads.person_thread(db, _user(ADMIN), 1, NEWCOMER)
        assert (thread["role"], thread["plan_requests"]) == ("learner", [])

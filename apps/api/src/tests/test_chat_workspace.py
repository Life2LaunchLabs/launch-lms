"""Chats as the shared workspace on plans: tags, plan and step filters, progress cards, and who's in them."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.conversations import ConversationMember, DirectChatOpen
from src.db.goals import Goal, GoalStatus, GoalStep, StepStatus, StepStatusChange
from src.db.organizations import Organization
from src.db.goal_sharing import PlanInvitation
from src.services.connect import chats, legacy_comments, workspace
from src.services.goals import goals, sharing
from src.services.messages import create_inbox_message
from src.services.school import chats as school_chats, views
from src.tests.test_goal_sharing import OTHER_EMAIL, _join, _personal, _session
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _issue, _published, _user


def _plan(db) -> Goal:
    return _issue(db, _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"},
                                 {"key": "essay", "type": "task", "title": "Write your essay", "review_required": True}))


def _steps(db, goal: Goal) -> dict[str, str]:
    return {step.title: step.step_uuid for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}


def _org_chat(db, user_id: int = LEARNER) -> dict:
    listed = chats.list_chats(db, _user(user_id))["chats"]
    return next(chat for chat in listed if chat["kind"] == "school")


def _status(db, user_id: int, goal: Goal, step_uuid: str, status: StepStatus) -> None:
    goals.change_status(db, _user(user_id), goal.goal_uuid, step_uuid, StepStatusChange(status=status))


def test_a_plan_from_an_organization_connects_the_learner_to_it():
    with _session() as db:
        goal = _plan(db)
        chat = _org_chat(db)
        assert chat["title"] == "Studio" and [person["username"] for person in chat["people"]] == ["teacher"]
        assert chat["last_message"]["body"] == "Started College ready" and chat["last_message"]["card"]["type"] == workspace.PROGRESS
        topic = chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])["topics"][0]
        assert (topic["goal_uuid"], topic["title"], topic["count"]) == (goal.goal_uuid, "College ready", 1)
        assert [step["title"] for step in topic["steps"]] == ["Visit a campus", "Write your essay"]
        assert topic["progress"] == {"done": 0, "total": 2, "submitted": 0, "behind": 0}


def test_a_comment_on_a_step_is_a_message_that_tags_it_and_the_chat_filters_by_plan_then_step():
    with _session() as db:
        goal = _plan(db)
        steps = _steps(db, goal)
        uuid = _org_chat(db)["conversation_uuid"]
        visit = f"<step:{goal.goal_uuid}/{steps['Visit a campus']}>"
        sent = chats.send(db, _user(LEARNER), uuid, f"{visit} which campus first?")
        assert [ref["kind"] for ref in sent["refs"]] == ["step"] and sent["refs"][0]["plan_title"] == "College ready"
        assert sent["preview"] == "Visit a campus which campus first?"
        chats.send(db, _user(ADMIN), uuid, "Hi Lee, welcome!")
        chats.send(db, _user(ADMIN), uuid, f"<plan:{goal.goal_uuid}> looks good overall")
        everything = chats.get_chat(db, _user(LEARNER), uuid)["messages"]
        assert len(everything) == 4
        on_plan = chats.get_chat(db, _user(LEARNER), uuid, goal_uuid=goal.goal_uuid)["messages"]
        assert [item["preview"] for item in on_plan] == ["Started College ready", "Visit a campus which campus first?", "College ready looks good overall"]
        on_step = chats.get_chat(db, _user(ADMIN), uuid, goal_uuid=goal.goal_uuid, step_uuid=steps["Visit a campus"])["messages"]
        assert [item["preview"] for item in on_step] == ["Visit a campus which campus first?"]
        # The plan's chat button knows the counts, so each step can show its own.
        found = workspace.goal_chat(db, _user(LEARNER), goal.goal_uuid)
        assert found["conversation_uuid"] == uuid and found["can_post"] and found["counts"][steps["Visit a campus"]] == 1 and found["count"] == 3


def test_tags_only_keep_plans_in_this_chat():
    with _session() as db:
        goal = _plan(db)
        other = _personal(db, OTHER, "Someone else's plan")["goal_uuid"]
        uuid = _org_chat(db)["conversation_uuid"]
        sent = chats.send(db, _user(LEARNER), uuid, f"<plan:{other}> <plan:{goal.goal_uuid}> <step:{goal.goal_uuid}/goal_step_missing> hi")
        assert sent["body"] == f"<plan:{goal.goal_uuid}> hi" and [ref["goal_uuid"] for ref in sent["refs"]] == [goal.goal_uuid]
        with pytest.raises(HTTPException) as empty:
            chats.send(db, _user(LEARNER), uuid, f"<plan:{other}>")
        assert empty.value.status_code == 422
        with pytest.raises(HTTPException) as elsewhere:
            chats.get_chat(db, _user(LEARNER), uuid, goal_uuid=other)
        assert elsewhere.value.status_code == 404


def test_progress_posts_as_cards_that_gather_per_person():
    with _session() as db:
        goal = _plan(db)
        steps = _steps(db, goal)
        uuid = _org_chat(db)["conversation_uuid"]
        _status(db, LEARNER, goal, steps["Visit a campus"], StepStatus.COMPLETED)
        _status(db, LEARNER, goal, steps["Write your essay"], StepStatus.COMPLETED)
        messages = chats.get_chat(db, _user(ADMIN), uuid)["messages"]
        assert [item["body"] for item in messages] == ["Started College ready", "Finished 1 step and turned in 1 step"]
        assert [event["event"] for event in messages[-1]["card"]["events"]] == ["finished", "turned_in"]
        _status(db, ADMIN, goal, steps["Write your essay"], StepStatus.COMPLETED)
        assert chats.get_chat(db, _user(LEARNER), uuid)["messages"][-1]["body"] == "Approved Write your essay"
        on_essay = chats.get_chat(db, _user(LEARNER), uuid, goal_uuid=goal.goal_uuid, step_uuid=steps["Write your essay"])["messages"]
        assert [item["body"] for item in on_essay] == ["Finished 1 step and turned in 1 step", "Approved Write your essay"]
        topic = chats.get_chat(db, _user(LEARNER), uuid)["topics"][0]
        assert topic["progress"]["done"] == 2


def test_a_personal_plan_talks_in_its_own_chat_once_someone_else_is_on_it():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        assert workspace.goal_chat(db, _user(LEARNER), uuid)["conversation_uuid"] is None
        _join(db, uuid, OTHER, OTHER_EMAIL, "viewer")
        found = workspace.goal_chat(db, _user(OTHER), uuid)
        assert found["title"] == "Earn a nursing degree" and found["can_post"] is False
        with pytest.raises(HTTPException) as viewer:
            chats.send(db, _user(OTHER), found["conversation_uuid"], "Me too")
        assert viewer.value.status_code == 403
        sent = chats.send(db, _user(LEARNER), found["conversation_uuid"], f"<plan:{uuid}> thinking about nursing school")
        assert chats.list_chats(db, _user(OTHER))["chats"][0]["last_message"]["message_uuid"] == sent["message_uuid"]
        member = sharing.leave(db, _user(OTHER), uuid)
        assert member
        with pytest.raises(HTTPException):
            chats.get_chat(db, _user(OTHER), found["conversation_uuid"])


def test_tagging_someone_who_cant_see_the_plan_invites_them_as_a_commenter():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, ADMIN, "t@example.com", "commenter")
        chat = workspace.goal_chat(db, _user(LEARNER), uuid)["conversation_uuid"]
        sent = chats.send(db, _user(LEARNER), chat, "<user:user_3> can you look at this?")
        assert [(item["user"]["username"], item["status"]) for item in sent["mentions"]] == [("sam", "invited")]
        invitation = db.exec(select(PlanInvitation)).all()[-1]
        sharing.respond_to_invitation(db, _user(OTHER), invitation.invitation_uuid, True)
        assert chats.send(db, _user(OTHER), chat, "Looks good!")["sender"]["username"] == "sam"


def test_the_migration_moves_older_comments_into_the_plans_chat_on_their_step():
    with _session() as db:
        goal = _plan(db)
        steps = _steps(db, goal)
        legacy_comments.GOALCOMMENT.create(db.connection())
        insert = legacy_comments.GOALCOMMENT.insert()
        db.connection().execute(insert, [
            {"id": 1, "goal_id": goal.id, "step_uuid": steps["Visit a campus"], "parent_id": None, "author_user_id": ADMIN, "body": "Try the open day", "creation_date": NOW, "update_date": NOW},
            {"id": 2, "goal_id": goal.id, "step_uuid": None, "parent_id": 1, "author_user_id": LEARNER, "body": "Will do", "creation_date": NOW, "update_date": NOW},
        ])
        assert legacy_comments.move_all(db) == 2
        db.commit()
        uuid = workspace.goal_chat(db, _user(LEARNER), goal.goal_uuid)["conversation_uuid"]
        on_step = chats.get_chat(db, _user(LEARNER), uuid, goal_uuid=goal.goal_uuid, step_uuid=steps["Visit a campus"])["messages"]
        assert [(item["sender"]["username"], item["preview"]) for item in on_step] == [("teacher", "Visit a campus Try the open day"), ("lee", "Visit a campus Will do")]


def test_a_learner_tagging_their_organization_elsewhere_shares_it_there():
    with _session() as db:
        _plan(db)
        _join(db, _personal(db)["goal_uuid"], OTHER, OTHER_EMAIL, "commenter")
        direct = chats.open_direct(db, _user(LEARNER), DirectChatOpen(handle="sam"))
        org = db.get(Organization, 1)
        chats.send(db, _user(LEARNER), direct["conversation_uuid"], f"Asking <org:{org.org_uuid}> about it")
        last = chats.get_chat(db, _user(ADMIN), _org_chat(db, ADMIN)["conversation_uuid"])["messages"][-1]
        assert last["body"] == "Tagged Studio in a chat with Sam Other" and last["card"]["excerpt"] == "Asking @Studio about it"


def test_admins_read_a_students_chat_by_plan_without_being_in_it():
    with _session() as db:
        goal = _plan(db)
        conversation = school_chats.find(db, 1, LEARNER)
        # An admin with no role on the plan reads along.
        goal.owner_user_id = LEARNER
        db.add(goal)
        db.commit()
        school_chats.school_chat(db, 1, LEARNER)
        db.commit()
        assert ADMIN not in {member.user_id for member in db.exec(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)).all()}
        seen = views.student_chat(db, _user(ADMIN), 1, LEARNER, goal_uuid=goal.goal_uuid)
        assert seen["can_post"] is False and seen["conversation_uuid"] == conversation.conversation_uuid
        assert [item["body"] for item in seen["messages"]] == ["Started College ready"]


def test_a_message_sent_while_filtered_is_about_that_step_without_saying_so():
    with _session() as db:
        goal = _plan(db)
        steps = _steps(db, goal)
        uuid = _org_chat(db)["conversation_uuid"]
        sent = chats.send(db, _user(LEARNER), uuid, "which campus first?", {"goal_uuid": goal.goal_uuid, "step_uuid": steps["Visit a campus"]})
        assert sent["body"] == "which campus first?" and sent["preview"] == "which campus first?"
        assert [(ref["kind"], ref["title"], ref.get("scope")) for ref in sent["refs"]] == [("step", "Visit a campus", True)]
        on_step = chats.get_chat(db, _user(ADMIN), uuid, goal_uuid=goal.goal_uuid, step_uuid=steps["Visit a campus"])["messages"]
        assert [item["body"] for item in on_step] == ["which campus first?"]


def test_tagging_your_plan_from_elsewhere_asks_before_sharing_it_with_the_chat():
    with _session() as db:
        _plan(db)
        mine = _personal(db, LEARNER, "Personality assessment")["goal_uuid"]
        uuid = _org_chat(db)["conversation_uuid"]
        assert mine in [plan["goal_uuid"] for plan in chats_plans(db)]
        with pytest.raises(HTTPException) as asked:
            chats.send(db, _user(LEARNER), uuid, f"<plan:{mine}> would this count?")
        detail = asked.value.detail
        assert asked.value.status_code == 409 and detail["code"] == "needs_access"
        assert [(plan["title"], plan["how"], [person["username"] for person in plan["people"]]) for plan in detail["plans"]] == [("Personality assessment", "share", ["teacher"])]
        # Sent without sharing, the teacher sees that it's a private plan.
        chats.send(db, _user(LEARNER), uuid, f"<plan:{mine}> would this count?", share={})
        hidden = chats.get_chat(db, _user(ADMIN), uuid)["messages"][-1]
        assert hidden["refs"][0]["hidden"] and hidden["preview"] == "Private plan would this count?"
        sent = chats.send(db, _user(LEARNER), uuid, f"<plan:{mine}> here it is", share={mine: ["user_1"]})
        assert sent["shared"] == {mine: "shared"}
        shown = chats.get_chat(db, _user(ADMIN), uuid)["messages"]
        assert [item["preview"] for item in shown[-2:]] == ["Personality assessment would this count?", "Personality assessment here it is"]
        # Once shared, tagging it again needs no question, and it never becomes one of the chat's plans.
        chats.send(db, _user(LEARNER), uuid, f"<plan:{mine}> again")
        assert mine not in [topic["goal_uuid"] for topic in chats.get_chat(db, _user(LEARNER), uuid)["topics"]]


def chats_plans(db):
    from src.services.connect import linking

    return linking.my_plans(db, _user(LEARNER))


def test_an_assigned_plan_waiting_for_a_yes_is_an_invitation_in_the_organizations_chat():
    with _session() as db:
        goal = _issue(db, _published(db, {"key": "visit", "type": "task", "title": "Visit a campus"}), status=GoalStatus.PENDING)
        chat = _org_chat(db)
        card = chat["last_message"]["card"]
        assert (card["type"], card["state"], card["for_me"]) == ("invitation", "pending", True)
        assert chat["last_message"]["body"] == "Studio invited you to start College ready"
        staff = chats.get_chat(db, _user(ADMIN), chat["conversation_uuid"])["messages"][-1]["card"]
        assert staff["for_me"] is False and staff["for_name"]
        goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
        listed = chats.list_chats(db, _user(LEARNER))["chats"]
        messages = chats.get_chat(db, _user(LEARNER), listed[0]["conversation_uuid"])["messages"]
        assert [item["card"]["type"] for item in messages] == ["invitation", workspace.PROGRESS]
        assert messages[0]["card"]["state"] == "accepted"


def test_an_organizations_notice_is_a_message_from_it():
    with _session() as db:
        org = db.exec(select(Organization)).first()
        create_inbox_message(db, recipient_user_id=LEARNER, sender_org_id=org.id, message_type="invitation", subject=f"Invitation to join {org.name}",
                             body=f"{org.name} invited you to join as Learner.", action_kind="organization_invitation", action_data={"invitation_uuid": "x"})
        create_inbox_message(db, recipient_user_id=LEARNER, sender_org_id=org.id, message_type="welcome", subject="Welcome", body="Glad you're here")
        db.commit()
        chat = _org_chat(db)
        messages = chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])["messages"]
        assert [(item["card"]["type"], item["card"].get("state")) for item in messages] == [("invitation", "pending"), ("notice", None)]
        # Delivered once, however often the list loads.
        chats.list_chats(db, _user(LEARNER))
        assert len(chats.get_chat(db, _user(LEARNER), chat["conversation_uuid"])["messages"]) == 2


def test_a_resource_tag_shows_its_title_and_link_when_the_sender_can_see_it():
    from sqlmodel import SQLModel
    from src.db.resources import Resource, ResourceChannel, ResourceChannelResource

    with _session() as db:
        SQLModel.metadata.create_all(db.get_bind(), tables=[Resource.__table__, ResourceChannel.__table__, ResourceChannelResource.__table__])  # type: ignore[attr-defined]
        for channel_id, audience in ((1, "org"), (2, "staff")):
            db.add(ResourceChannel(id=channel_id, org_id=1, channel_uuid=f"channel_{channel_id}", name=f"Channel {channel_id}", audience=audience, creation_date=NOW, update_date=NOW))
            db.add(Resource(id=channel_id, org_id=1, resource_uuid=f"resource_{channel_id}", title=f"Guide {channel_id}", resource_type="guide",
                            external_url=f"https://example.com/{channel_id}", creation_date=NOW, update_date=NOW))
            db.add(ResourceChannelResource(channel_id=channel_id, resource_id=channel_id))
        db.commit()
        _plan(db)
        uuid = _org_chat(db)["conversation_uuid"]
        sent = chats.send(db, _user(LEARNER), uuid, "Have a look <resource:resource_1> <resource:resource_2>")
        assert sent["body"] == "Have a look <resource:resource_1>"
        assert [(ref["kind"], ref["title"], ref["url"]) for ref in sent["refs"]] == [("resource", "Guide 1", "https://example.com/1")]
        assert workspace.plain(db, sent["body"], sent["refs"], LEARNER) == "Have a look Guide 1"

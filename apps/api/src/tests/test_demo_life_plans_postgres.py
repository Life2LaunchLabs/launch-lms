"""A demo learner's phases, budget, portfolio records and chats reach a visitor copy."""

import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlmodel import Session, select

ORG, LEARNER, FRIEND, REAL, BLANK = 90500, 90501, 90502, 90599, 90503
DOCUMENT = {
    "phases": [{"id": "phase_college", "title": "College in Eugene", "goals": ["goal_life_test"]}],
    "budget": [{"id": "rent", "label": "Rent", "amount": 650}],
}


@pytest.mark.skipif(
    not os.environ.get("DEMO_TEST_DATABASE_URL"),
    reason="Requires disposable PostgreSQL database",
)
def test_life_plan_portfolio_and_chats_reach_the_visitor_copy():
    url = os.environ["DEMO_TEST_DATABASE_URL"]
    assert "test" in url.rsplit("/", 1)[-1]
    from src.core.events.database import import_all_models
    from src.db.conversations import Conversation, ConversationMember, ConversationMessage
    from src.db.goals import Goal
    from src.db.life_plans import EstimateFact, EstimateSource, LifePlan
    from src.db.organizations import Organization
    from src.db.portfolio import Portfolio
    from src.db.portfolio_people import PortfolioPerson
    from src.db.portfolio_records import PortfolioResult, ResumeVersion
    from src.db.user_organizations import UserOrganization
    from src.db.users import User
    from src.db.weekly_focus import PlanWeeklyFocus
    from src.services.demo.checkpoints import capture
    from src.services.demo.copy import copy_account
    from src.services.demo.namespaces import drop_namespace, materialize, remap

    import_all_models()
    engine = create_engine(url)
    source_key = f"demo_test_{uuid4().hex}"
    # Reference data is read from the live schema, so it must be committed.
    with Session(engine) as live:
        source = EstimateSource(key=source_key, publisher="HUD", title="Fair Market Rents")
        live.add(source)
        live.flush()
        live.add(EstimateFact(metric="rent", place="state:OR", dims={}, value=1234.0, source_id=source.id, status="reviewed"))
        live.commit()
    namespace = None
    try:
        with Session(engine) as db:
            db.add(Organization(id=ORG, org_uuid="org_life_test", slug="life-test", name="Fictional school", email="school@example.com"))
            for identifier in (LEARNER, FRIEND, REAL, BLANK):
                db.add(User(id=identifier, user_uuid=f"user_life_test_{identifier}", username=f"life{identifier}",
                            email=f"life{identifier}@example.com", first_name="Test", last_name=str(identifier)))
            db.flush()
            for identifier in (LEARNER, FRIEND, REAL, BLANK):
                db.add(UserOrganization(user_id=identifier, org_id=ORG, role_id=4, creation_date="", update_date=""))
            db.add(Goal(id=ORG, goal_uuid="goal_life_test", title="Get into college", subject_user_id=LEARNER,
                        owner_user_id=LEARNER, org_id=ORG))
            db.add(LifePlan(plan_uuid="lifeplan_test", user_id=LEARNER, document=DOCUMENT))
            db.add(PlanWeeklyFocus(user_id=LEARNER, week_start=__import__("datetime").date(2026, 11, 2), objective_uuids=["step_a"]))
            db.add(Portfolio(id=ORG, portfolio_uuid="portfolio_life_test", user_id=LEARNER, short_bio="Hi"))
            db.flush()
            db.add(PortfolioResult(result_uuid="result_life_test", portfolio_id=ORG, kind="interests", name="Interests",
                                   summary="Artistic · Social", data={"A": 30, "S": 25}))
            db.add(ResumeVersion(version_uuid="resume_life_test", portfolio_id=ORG, name="Summer jobs"))
            db.add(PortfolioPerson(portfolio_id=ORG, user_id=FRIEND, role="friend"))
            db.add(PortfolioPerson(portfolio_id=ORG, user_id=REAL, role="mentor"))
            for chat, members in ((ORG, (LEARNER, FRIEND)), (ORG + 1, (LEARNER, REAL))):
                db.add(Conversation(id=chat, conversation_uuid=f"chat_life_test_{chat}", kind="direct"))
                db.flush()
                for member in members:
                    db.add(ConversationMember(conversation_id=chat, user_id=member))
                    db.add(ConversationMessage(message_uuid=f"message_life_test_{chat}_{member}", conversation_id=chat,
                                               sender_user_id=member, body=f"from {member}"))
            db.flush()

            snapshot = capture(db, ORG, {LEARNER, FRIEND})
            assert [row["document"] for row in snapshot["lifeplan"]] == [DOCUMENT]
            assert len(snapshot["planweeklyfocus"]) == 1
            assert [row["summary"] for row in snapshot["portfolioresult"]] == ["Artistic · Social"]
            assert [row["name"] for row in snapshot["resumeversion"]] == ["Summer jobs"]
            assert [row["user_id"] for row in snapshot["portfolioperson"]] == [FRIEND]
            assert [row["id"] for row in snapshot["conversation"]] == [ORG]
            assert sorted(row["body"] for row in snapshot["conversationmessage"]) == [f"from {LEARNER}", f"from {FRIEND}"]
            assert {row["id"] for row in snapshot["user"]} == {LEARNER, FRIEND}
            assert "estimatefact" not in snapshot

            session_id = uuid4().hex
            namespace = "demo_" + session_id
            rows, _ = remap(snapshot, session_id)
            materialize(engine, namespace, rows)
            with Session(engine.execution_options(schema_translate_map={None: namespace})) as visitor:
                plan = visitor.exec(select(LifePlan)).one()
                assert plan.user_id == LEARNER and plan.document == DOCUMENT
                assert visitor.exec(select(PortfolioResult)).one().data == {"A": 30, "S": 25}
                assert visitor.exec(select(ResumeVersion)).one().name == "Summer jobs"
                assert len(visitor.exec(select(ConversationMessage)).all()) == 2
                fact = visitor.exec(select(EstimateFact).where(EstimateFact.value == 1234.0)).one()
                assert visitor.get(EstimateSource, fact.source_id).key == source_key
                # Visitors can't change the live estimates through their workspace.
                with pytest.raises(DBAPIError):
                    visitor.execute(text(f'DELETE FROM "{namespace}".estimatefact'))
                visitor.rollback()

            # Studio's account copy brings the plan along, pointed at the copied goal.
            copied = copy_account(db, db.get(User, LEARNER), db.get(User, BLANK), {ORG})
            assert copied["lifeplan"] == copied["resumeversion"] == copied["portfolioresult"] == 1
            plan = db.exec(select(LifePlan).where(LifePlan.user_id == BLANK)).one()
            new_goal = db.exec(select(Goal).where(Goal.subject_user_id == BLANK)).one()
            assert plan.plan_uuid != "lifeplan_test"
            assert plan.document["phases"][0]["goals"] == [new_goal.goal_uuid] != ["goal_life_test"]
            db.rollback()
    finally:
        if namespace:
            drop_namespace(engine, namespace)
        with Session(engine) as live:
            live.execute(text("DELETE FROM estimatesource WHERE key = :key"), {"key": source_key})
            live.commit()
        engine.dispose()

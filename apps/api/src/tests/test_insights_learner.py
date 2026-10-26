"""A learner's dashboard on the Riverside fixture with steps (``test_insights_steps``).

Learner 13 runs Career Launch (intro done Oct 12, résumé waiting for review) and started Résumé Ready on
Oct 20. They worked on their plan Oct 12 and Oct 21, and wrote to Ana on Oct 21. Ana wrote to them Oct 10
and Oct 21, and left a staff-only note Oct 22. Learner 10 finished intro (approved Oct 3) and résumé (Oct 15).
"""

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.goal_sharing import PlanActivity
from src.db.goals import StepProgress
from src.db.insights import InsightDashboard
from src.services.insights import dashboards, engine, library
from src.services.insights.spec import CardSpec, check
from src.tests.test_insights import ADMIN, ANA, TODAY, _user
from src.tests.test_insights_steps import db as with_steps  # noqa: F401
from src.tests.test_insights_steps import riverside  # noqa: F401

LEARNER = "user_13"


@pytest.fixture
def db(with_steps: Session) -> Session:  # noqa: F811
    InsightDashboard.__table__.create(with_steps.get_bind())
    progress = {row.step_id: row for row in with_steps.exec(select(StepProgress)).all()}
    progress[107].completed_at = datetime(2026, 10, 12, 9)  # 13's intro
    progress[102].completed_at = datetime(2026, 10, 15, 9)  # 10's résumé
    with_steps.add_all([progress[107], progress[102]])
    for day in ("2026-10-12", "2026-10-21"):
        with_steps.add(PlanActivity(activity_uuid=f"act_13_{day}", goal_id=13, actor_user_id=13, action="step.status", payload={}, creation_date=f"{day}T09:00:00"))
    with_steps.add_all([Conversation(id=2, conversation_uuid="conv_2", org_id=1), Conversation(id=3, conversation_uuid="conv_3", org_id=1)])
    with_steps.add_all([ConversationMember(conversation_id=2, user_id=13), ConversationMember(conversation_id=2, user_id=ANA), ConversationMember(conversation_id=3, user_id=14)])
    for number, (conversation, sender, day, visibility) in enumerate([
        (2, ANA, "2026-10-10", "all"), (2, ANA, "2026-10-21", "all"), (2, 13, "2026-10-21", "all"), (2, ANA, "2026-10-22", "staff"), (3, ANA, "2026-10-22", "all"),
    ]):
        with_steps.add(ConversationMessage(message_uuid=f"msg_l{number}", conversation_id=conversation, sender_user_id=sender, body="Hi", visibility=visibility,
                                           creation_date=f"{day}T12:00:00"))
    with_steps.commit()
    return with_steps


def _run(db: Session, spec: dict, viewer: int = ADMIN, key: str = LEARNER, range_: str = "all") -> dict:
    ctx = engine.context(db, _user(viewer), 1, "learner", key, today=TODAY)
    return engine.run(ctx, CardSpec.model_validate(spec), range_)


def test_a_learners_plans_steps_and_reviews(db):
    assert _run(db, {"measure": "plan_starts"})["value"]["v"] == 2
    assert _run(db, {"measure": "plans_finished"})["value"]["v"] == 0
    assert _run(db, {"measure": "steps_done"})["value"]["v"] == 1
    assert _run(db, {"measure": "waiting_for_review"})["value"]["v"] == 1
    progress = _run(db, {"measure": "plan_progress", "by": "plan"})
    assert [(row["label"], row["v"], row["n"]) for row in progress["rows"]] == [("Career Launch", 0.5, 2)]


def test_steps_done_use_when_the_step_was_finished_or_its_last_approval(db):
    result = _run(db, {"measure": "steps_done", "by": "time"}, key="user_10", range_="90d")
    assert result["value"]["v"] == 2
    org = engine.run(engine.context(db, _user(ADMIN), 1, "org", None, today=TODAY), CardSpec(measure="steps_done"), "90d")
    assert org["value"]["v"] == 4  # 10's intro and résumé, 11's and 13's intro; 12's have no time and are left out


def test_days_active_and_check_ins_count_one_learners_days_and_staffs_messages(db):
    assert _run(db, {"measure": "days_active"})["value"]["v"] == 2
    # Ana's two messages to 13; not 13's own, not the staff-only note, not her message to 14.
    check_ins = _run(db, {"measure": "check_ins", "by": "time"}, range_="28d")
    assert check_ins["value"]["v"] == 2 and check_ins["headline"].startswith("Staff wrote 2 messages")


def test_learner_only_measures_stay_on_a_learner_dashboard():
    assert check(CardSpec(measure="days_active"), "org", see_reports=True)[0]["field"] == "measure"
    assert check(CardSpec(measure="check_ins"), "group", see_reports=True)[0]["field"] == "measure"
    assert check(CardSpec(measure="learner_status"), "learner", see_reports=True)[0]["field"] == "measure"


def test_staff_open_a_dashboard_only_on_their_own_learners(db):
    assert _run(db, {"measure": "steps_done"}, viewer=ANA)["value"]["v"] == 1
    with pytest.raises(HTTPException) as caught:
        _run(db, {"measure": "steps_done"}, viewer=ANA, key="user_17")
    assert caught.value.status_code == 404


def test_the_learner_starter_runs_and_reaches_organizations_already_using_insights(db):
    item = library.template("learner.overview")
    results = engine.run_cards(engine.context(db, _user(ADMIN), 1, "learner", LEARNER, today=TODAY), item["cards"], "90d")
    assert all("error" not in result for result in results.values())
    # An organization that had the first three starters before the learner one existed gets it once.
    for key in ("org.overview", "plan.performance", "group.progress"):
        db.add(InsightDashboard(dashboard_uuid=f"dashboard_{key}", org_id=1, scope=key.split(".")[0], title=key, owner_user_id=ADMIN,
                                document={"cards": []}, source_template=f"starter:{key}", creation_date="2026-10-01", update_date="2026-10-01"))
    db.commit()
    listed = dashboards.list_dashboards(db, _user(ADMIN), 1, "learner")
    assert [entry["source_template"] for entry in listed] == ["starter:learner.overview"]
    assert len(dashboards.list_dashboards(db, _user(ADMIN), 1)) == 4


def test_the_switcher_lists_the_viewers_active_learners_with_their_groups(db):
    from src.services.insights import context

    everyone = context.objects(db, context.population(db, _user(ADMIN), 1), "learner")
    assert len(everyone) == 11 and everyone[0] == {"key": "user_10", "label": "Learner 10", "learners": 1, "detail": "Fall"}  # alumnus 21 left out
    assert {item["key"] for item in context.objects(db, context.population(db, _user(ANA), 1), "learner")} == {f"user_{uid}" for uid in range(10, 16)}

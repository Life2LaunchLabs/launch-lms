"""Group reports: completion by plan and badge, who's behind and what's left, frameworks on request, and sending as chat cards."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.badges import BadgeAward
from src.db.conversations import ConversationMessage, UserBlock
from src.db.goals import GoalAssignment, GoalStep, GoalTemplateVersion, StepStatus
from src.services.connect import cards
from src.services.goals import goals, reports
from src.services.goals.reports import GroupReportSend
from src.tests.test_goal_requirements import TEACHER, _goal, _submit_resume, world  # noqa: F401  (world is a fixture)
from src.services.goals import requirements as requirement_service
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _status, _step, _user


@pytest.fixture(autouse=True)
def _tables(world):  # noqa: F811
    for model in (BadgeAward, UserBlock):
        model.__table__.create(world[0].get_bind(), checkfirst=True)  # type: ignore[attr-defined]


def _badge(db, assignment_uuid: str) -> GoalAssignment:
    """The assignment's release earns the College Ready badge."""
    row = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment_uuid)).one()
    version = db.get(GoalTemplateVersion, row.version_id)
    version.document = {**version.document, "badge": {"kind": "Badge", "name": "College Ready"}}
    db.add(version)
    db.commit()
    return row


def _overdue(db, user_id: int, title: str) -> None:
    goal = _goal(db, user_id)
    step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id, GoalStep.title == title)).one()
    step.due_date = date.today() - timedelta(days=3)
    db.add(step)
    db.commit()


def _finish(db, user_id: int, title: str) -> None:
    goal = _goal(db, user_id)
    _status(db, user_id, goal, _step(goals.get_goal(db, _user(user_id), goal.goal_uuid), title), StepStatus.COMPLETED)


def test_report_shows_plans_badges_and_who_is_behind(world):  # noqa: F811
    db, assignment, _, _, _ = world
    badged = _badge(db, assignment["assignment_uuid"])
    _submit_resume(db, LEARNER, "https://example.org/lee")
    _finish(db, LEARNER, "Career Fair")
    _overdue(db, OTHER, "Your first resume")
    db.add(BadgeAward(award_uuid="award_1", template_id=badged.template_id, user_id=LEARNER, issuing_org_id=1, earned_on=date.today(), achievement={"name": "College Ready"}))
    db.commit()

    report = reports.group_report(db, _user(ADMIN), 1, 1)
    assert report["group"]["name"] == "Fall"
    plan = report["plans"][0]
    assert (plan["template_title"], plan["learner_count"], plan["behind_count"]) == ("College ready", 2, 1)
    assert plan["progress_percent"] == 25 and plan["badge"]["name"] == "College Ready" and plan["badge"]["earned_count"] == 1
    summary = report["summary"]
    assert (summary["steps_done"], summary["steps_total"], summary["progress_percent"]) == (1, 4, 25)
    assert (summary["behind_count"], summary["behind_names"], summary["badges_earned"], summary["plan_count"]) == (1, ["Sam Other"], 1, 1)
    # Behind first, then by how far along.
    rows = report["learners"]
    assert [(row["username"], row["status"], row["done"], row["total"]) for row in rows] == [("sam", "behind", 0, 2), ("lee", "on_pace", 1, 2)]
    assert rows[0]["next_steps"] == ["Your first resume", "Career Fair"] and not rows[0]["handed_in"]
    # A step turned in still waits on review, so it's left, and the row says it was handed in.
    assert rows[1]["next_steps"] == ["Your first resume"] and rows[1]["handed_in"]
    # Frameworks are listed but not included until asked for.
    assert [item["name"] for item in report["frameworks"]] == ["Career Ready"] and report["included_frameworks"] == []


def test_report_includes_requested_frameworks_with_what_each_learner_still_needs(world):  # noqa: F811
    db, _, _, framework, nodes = world
    enrollment = requirement_service.learner_requirements(db, _user(ADMIN), 1, LEARNER)["frameworks"][0]["enrollment_uuid"]
    requirement_service.credit_requirement(db, _user(ADMIN), 1, LEARNER, enrollment, nodes["Resume"], "Brought one in on paper.")
    report = reports.group_report(db, _user(ADMIN), 1, 1, [framework["framework_uuid"], "not-a-framework"])
    [included] = report["included_frameworks"]
    assert included["draft"] and included["requirement_count"] == 2
    by_name = {row["first_name"]: row for row in included["learners"]}
    assert (by_name["Lee"]["met"], by_name["Lee"]["total"]) == (1, 2)
    assert [(item["title"], item["state"]) for item in by_name["Lee"]["still_needs"]] == [("Workplace experience", "gap")]
    assert sorted(item["title"] for item in by_name["Sam"]["still_needs"]) == ["Resume", "Workplace experience"]
    # The learner with more left comes first.
    assert included["learners"][0]["first_name"] == "Sam"


def test_staff_see_the_plans_they_staff_and_learners_are_refused(world):  # noqa: F811
    db, assignment, _, _, _ = world
    report = reports.group_report(db, _user(TEACHER), 1, 1)
    assert [plan["assignment_uuid"] for plan in report["plans"]] == [assignment["assignment_uuid"]]
    assert report["summary"]["learner_count"] == 2
    with pytest.raises(HTTPException) as learner:
        reports.group_report(db, _user(LEARNER), 1, 1)
    assert learner.value.status_code == 403
    with pytest.raises(HTTPException) as missing:
        reports.group_report(db, _user(ADMIN), 1, 99)
    assert missing.value.status_code == 404


def test_paused_plans_and_finished_learners(world):  # noqa: F811
    db, assignment, _, _, _ = world
    goal = _goal(db, LEARNER)
    _finish(db, LEARNER, "Career Fair")
    _status(db, ADMIN, goal, _step(goals.get_goal(db, _user(ADMIN), goal.goal_uuid), "Your first resume"), StepStatus.COMPLETED)
    rows = {row["username"]: row for row in reports.group_report(db, _user(ADMIN), 1, 1)["learners"]}
    assert rows["lee"]["status"] == "finished" and rows["lee"]["next_steps"] == []
    row = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == assignment["assignment_uuid"])).one()
    row.status = "paused"
    db.add(row)
    db.commit()
    assert {row["status"] for row in reports.group_report(db, _user(ADMIN), 1, 1)["learners"]} == {"paused"}


def test_send_posts_a_card_to_org_members_only(world):  # noqa: F811
    db, _, _, framework, _ = world
    payload = GroupReportSend(recipient_user_ids=[TEACHER, TEACHER, ADMIN], message="Where Fall stands this week.", frameworks=[framework["framework_uuid"]])
    result = reports.send_report(db, _user(ADMIN), 1, 1, payload)
    assert [item["user_id"] for item in result["sent"]] == [TEACHER] and result["skipped"] == [{"user_id": ADMIN, "reason": "yourself"}]
    message = db.exec(select(ConversationMessage).where(ConversationMessage.message_uuid == result["sent"][0]["message_uuid"])).one()
    assert message.kind == "card" and message.body == "Where Fall stands this week." and message.sender_user_id == ADMIN
    card = message.card or {}
    assert card["type"] == cards.GROUP_REPORT and card["usergroup_id"] == 1 and card["org_slug"] == "studio"
    assert card["frameworks"] == [framework["framework_uuid"]] and card["framework_names"] == ["Career Ready"]
    assert card["summary"]["learner_count"] == 2

    with pytest.raises(HTTPException) as nobody:
        reports.send_report(db, _user(ADMIN), 1, 1, GroupReportSend(recipient_user_ids=[]))
    assert nobody.value.status_code == 422
    with pytest.raises(HTTPException) as outsider:
        reports.send_report(db, _user(ADMIN), 1, 1, GroupReportSend(recipient_user_ids=[TEACHER, 404]))
    assert outsider.value.status_code == 422
    with pytest.raises(HTTPException) as staff:
        reports.send_report(db, _user(TEACHER), 1, 1, GroupReportSend(recipient_user_ids=[LEARNER]))
    assert staff.value.status_code == 403

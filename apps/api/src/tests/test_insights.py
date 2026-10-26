"""The card engine on a small organization with known numbers.

Riverside (org 1) on 2026-10-26: Career Launch (CL) started by learners 10 to 15 on Aug 1, three finished
Sep 10; Résumé Ready (RR) started by 16 to 20 on Sep 15, one finished Oct 1; 13 started RR on Oct 20
(too new to count in rates); 10 ran RR last spring. Learner 21 is an alumnus. Ana (staff, no See reports)
staffs Fall, the group of 10 to 15.
"""

from datetime import date, datetime

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from src.db.badges import BadgeAward
from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.goal_sharing import PlanActivity
from src.db.goals import Goal, GoalAssignment, GoalStage, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.school import UserGroupStaff
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services.insights import engine, sentences
from src.services.insights.measures import MEASURES
from src.services.insights.spec import CardSpec, check

TODAY = date(2026, 10, 26)
ADMIN, ANA, REPORTS = 1, 2, 3
FALL, EVENING = range(10, 16), range(16, 21)
ALUMNUS = 21
CL, RR = "tpl_cl", "tpl_rr"
STAFF_RIGHTS = {"dashboard": {"action_access": True}}


def _user(user_id: int) -> PublicUser:
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=f"u{user_id}@example.com", first_name="U", last_name=str(user_id))


@pytest.fixture
def db() -> Session:
    engine_ = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine_, tables=[
        Organization.__table__, User.__table__, Role.__table__, UserOrganization.__table__, UserGroup.__table__, UserGroupUser.__table__, UserGroupStaff.__table__,
        GoalTemplate.__table__, GoalTemplateVersion.__table__, GoalAssignment.__table__, Goal.__table__, GoalStage.__table__, GoalStep.__table__, StepProgress.__table__,
        PlanActivity.__table__, BadgeAward.__table__, Conversation.__table__, ConversationMember.__table__, ConversationMessage.__table__,
    ])
    session = Session(engine_)
    session.add(Organization(id=1, org_uuid="org_1", name="Riverside", slug="riverside", email="r@example.com"))
    session.add_all([Role(id=1, name="Admin", rights=STAFF_RIGHTS), Role(id=2, name="Staff", rights=STAFF_RIGHTS), Role(id=4, name="Learner", rights={})])
    people = [(ADMIN, 1, None), (ANA, 2, None), (REPORTS, 2, ["see_reports"])] + [(uid, 4, None) for uid in [*FALL, *EVENING, ALUMNUS]]
    for user_id, role_id, permissions in people:
        session.add(User(id=user_id, user_uuid=f"user_{user_id}", username=f"u{user_id}", email=f"u{user_id}@example.com", first_name="Learner" if role_id == 4 else "Staff", last_name=str(user_id)))
        joined = "2026-07-15T09:00:00" if user_id in FALL or user_id == ALUMNUS else "2026-09-01T09:00:00" if user_id in EVENING else "2026-01-01T00:00:00"
        session.add(UserOrganization(user_id=user_id, org_id=1, role_id=role_id, permissions=permissions, status="alumni" if user_id == ALUMNUS else "active",
                                     creation_date=joined, update_date=joined))
    session.add_all([UserGroup(id=1, org_id=1, usergroup_uuid="grp_fall", name="Fall", description=""), UserGroup(id=2, org_id=1, usergroup_uuid="grp_evening", name="Evening", description="")])
    session.add_all([UserGroupUser(usergroup_id=1, user_id=uid, org_id=1) for uid in FALL] + [UserGroupUser(usergroup_id=2, user_id=uid, org_id=1) for uid in EVENING])
    session.add(UserGroupStaff(org_id=1, usergroup_id=1, user_id=ANA))
    session.add_all([GoalTemplate(id=1, template_uuid=CL, org_id=1, title="Career Launch"), GoalTemplate(id=2, template_uuid=RR, org_id=1, title="Résumé Ready")])
    session.add_all([GoalTemplateVersion(id=1, version_uuid="ver_cl1", template_id=1, org_id=1, number=1, semver="1.0.0"),
                     GoalTemplateVersion(id=2, version_uuid="ver_rr1", template_id=2, org_id=1, number=1, semver="1.0.0")])
    session.commit()

    def goal(goal_id: int, user_id: int, template: int, started: date, finished: date | None = None) -> None:
        session.add(Goal(id=goal_id, goal_uuid=f"goal_{goal_id}", org_id=1, owner_user_id=ADMIN, subject_user_id=user_id, title="Plan", template_id=template, version_id=template,
                         status="finished" if finished else "active", start_date=started, finished_at=datetime.combine(finished, datetime.min.time()) if finished else None,
                         creation_date=started.isoformat()))

    for user_id in FALL:
        goal(user_id, user_id, 1, date(2026, 8, 1), date(2026, 9, 10) if user_id in (10, 11, 12) else None)
    for user_id in EVENING:
        goal(user_id, user_id, 2, date(2026, 9, 15), date(2026, 10, 1) if user_id == 16 else None)
    goal(30, 13, 2, date(2026, 10, 20))
    goal(31, 10, 2, date(2026, 5, 1), date(2026, 6, 1))
    goal(32, ALUMNUS, 1, date(2026, 8, 1), date(2026, 8, 20))
    session.add(GoalStep(id=1, step_uuid="step_17", goal_id=17, type="task", title="Draft", due_date=date(2026, 10, 1)))

    def acted(user_id: int, goal_id: int, day: str) -> None:
        session.add(PlanActivity(activity_uuid=f"act_{user_id}_{goal_id}_{day}", goal_id=goal_id, actor_user_id=user_id, action="step.status", payload={}, creation_date=f"{day}T10:00:00"))

    acted(10, 10, "2026-10-20")
    acted(16, 16, "2026-10-25")
    acted(11, 11, "2026-09-01")
    acted(18, 18, "2026-10-24")
    acted(ADMIN, 14, "2026-10-25")  # staff working on a learner's goal isn't the learner being active
    session.add(Conversation(id=1, conversation_uuid="conv_1", org_id=1))
    session.add(ConversationMessage(message_uuid="msg_1", conversation_id=1, sender_user_id=17, body="Hi", creation_date="2026-10-22T08:00:00"))
    session.add_all([
        BadgeAward(award_uuid="award_1", template_id=1, user_id=10, issuing_org_id=1, source="plan_completion", earned_on=date(2026, 9, 10), issued_at=datetime(2026, 9, 10)),
        BadgeAward(award_uuid="award_2", template_id=2, user_id=16, issuing_org_id=1, source="direct_award", earned_on=date(2026, 10, 2), issued_at=datetime(2026, 10, 2)),
        BadgeAward(award_uuid="award_3", template_id=1, user_id=11, issuing_org_id=1, source="plan_completion", earned_on=date(2026, 9, 10), issued_at=datetime(2026, 9, 10), status="revoked"),
    ])
    session.commit()
    return session


def _run(db: Session, spec: dict, viewer: int = ADMIN, scope: str = "org", key: str | None = None, range_: str = "90d") -> dict:
    ctx = engine.context(db, _user(viewer), 1, scope, key, today=TODAY)
    return engine.run(ctx, CardSpec.model_validate(spec), range_)


# Measures, exactly --------------------------------------------------------------------------------

def test_plan_starts_and_finishes_count_the_range_and_compare_with_the_one_before(db):
    starts = _run(db, {"measure": "plan_starts"})
    assert starts["value"]["v"] == 12 and starts["compare"]["v"] == 1
    finished = _run(db, {"measure": "plans_finished"})
    assert finished["value"]["v"] == 4 and finished["compare"]["v"] == 1
    assert finished["headline"] == "4 plans finished"


def test_completion_rate_leaves_out_plans_still_settling_and_alumni(db):
    result = _run(db, {"measure": "completion_rate"})
    assert result["value"]["n"] == 11 and round(result["value"]["v"], 3) == round(4 / 11, 3)
    assert result["value"]["text"] == "36%"
    assert result["headline"] == "Completion is 36%"


def test_completion_by_plan_ranks_leader_and_laggard_and_links_each_plan(db):
    result = _run(db, {"measure": "completion_rate", "by": "plan"})
    assert [(row["label"], row["v"]) for row in result["rows"]] == [("Career Launch", 0.5), ("Résumé Ready", 0.2)]
    assert result["rows"][0]["link"] == {"scope": "plan", "key": CL}
    assert result["chart"] == "bars" and result["shape"] == "ranked"
    # Six and five plans are too few to rank.
    assert result["headline"] == "Too few plans have enough to compare yet"


def test_time_to_finish_is_the_median_in_days(db):
    result = _run(db, {"measure": "time_to_finish"})
    assert result["value"]["v"] == 40 and result["value"]["text"] == "40 days"
    assert result["headline"] == "Too few to say yet (4 plans finished)"


def test_badges_leave_out_revoked_awards_and_split_by_route(db):
    result = _run(db, {"measure": "badges_awarded", "by": "route"})
    assert result["value"]["v"] == 2
    assert {row["key"]: row["v"] for row in result["rows"]} == {"plan_completion": 1, "direct_award": 1}


def test_active_learners_are_learners_acting_on_their_own_goals_or_writing(db):
    result = _run(db, {"measure": "active_learners"})
    assert result["value"]["v"] == 5


def test_new_learners_by_group(db):
    result = _run(db, {"measure": "new_learners", "by": "group"})
    assert result["value"]["v"] == 5 and [(row["label"], row["v"]) for row in result["rows"]] == [("Evening", 5)]


def test_learner_status_is_a_split_of_today(db):
    result = _run(db, {"measure": "learner_status"})
    assert result["shape"] == "split" and result["compare"] is None
    assert {row["key"]: row["v"] for row in result["rows"]} == {"finished": 4, "quiet": 5, "behind": 1, "on_track": 1}
    assert [row["key"] for row in result["rows"]] == ["on_track", "behind", "quiet", "finished"]
    assert result["headline"] == "1 of 11 learners are on track; 5 have gone quiet"
    assert result["subline"] == "Learner status · today"


def test_learner_status_by_group_crosses_groups_with_statuses(db):
    result = _run(db, {"measure": "learner_status", "by": "group"})
    fall = next(row for row in result["rows"] if row["label"] == "Fall")
    assert [cell["v"] for cell in fall["cells"]] == [0, 0, 3, 3]


def test_time_series_fills_empty_weeks(db):
    result = _run(db, {"measure": "plan_starts", "by": "time"})
    points = result["series"]["points"]
    assert result["series"]["bucket"] == "week" and sum(point["v"] for point in points) == 12
    assert all(point["v"] == 0 for point in points if point["key"] not in ("2026-07-27", "2026-09-14", "2026-10-19"))
    assert result["headline"] == "12 plans started"
    points[2]["v"] = 9
    assert sentences.series(MEASURES["plan_starts"], points, result["value"], None, "", "prior", "weeks") == "Plan starts peaked in the week of Aug 10 (9)"


# Who is counted -----------------------------------------------------------------------------------

def test_staff_without_see_reports_count_only_their_groups(db):
    assert _run(db, {"measure": "plan_starts"}, viewer=ANA)["value"]["v"] == 7
    assert _run(db, {"measure": "plan_starts"}, viewer=REPORTS)["value"]["v"] == 12
    with pytest.raises(HTTPException):
        engine.context(db, _user(ANA), 1, "group", "grp_evening", today=TODAY)
    with pytest.raises(HTTPException):
        engine.context(db, _user(12), 1, "org", None, today=TODAY)


@pytest.mark.parametrize("key", list(MEASURES))
def test_no_measure_counts_anyone_outside_the_viewers_learners(db, key):
    measure = MEASURES[key]
    scope = measure.scopes[0]
    ctx = engine.context(db, _user(ANA), 1, scope, {"plan": CL, "learner": f"user_{FALL[0]}"}.get(scope), today=TODAY)
    spec = CardSpec(measure=key, range="all")
    drilled = engine.drill(ctx, spec, "all") if measure.drill else {"people": []}
    assert {person["id"] for person in drilled["people"]} <= set(FALL)


def test_alumni_count_when_the_card_asks_for_them(db):
    spec = {"measure": "plans_finished", "filters": [{"field": "learner_status", "values": ["active", "alumni"]}]}
    assert _run(db, spec)["value"]["v"] == 5


def test_a_plan_dashboard_answers_for_its_plan(db):
    assert _run(db, {"measure": "plan_starts"}, scope="plan", key=CL)["value"]["v"] == 6
    assert _run(db, {"measure": "plan_starts"}, scope="group", key="grp_evening")["value"]["v"] == 5


def test_filters_keep_or_leave_out_keys(db):
    assert _run(db, {"measure": "plan_starts", "filters": [{"field": "plan", "values": [RR]}]})["value"]["v"] == 6
    assert _run(db, {"measure": "plan_starts", "filters": [{"field": "plan", "op": "not_in", "values": [RR]}]})["value"]["v"] == 6
    assert _run(db, {"measure": "plan_starts", "filters": [{"field": "group", "values": ["grp_fall"]}]})["value"]["v"] == 7


# Drill-down ---------------------------------------------------------------------------------------

def test_drill_lists_the_learners_behind_a_value_and_who_counted(db):
    ctx = engine.context(db, _user(ADMIN), 1, today=TODAY)
    spec = CardSpec(measure="completion_rate", by="plan")
    drilled = engine.drill(ctx, spec, f"plan={CL}", "90d")
    assert drilled["total"] == 6
    assert {person["id"] for person in drilled["people"] if person["counted"]} == {10, 11, 12}
    assert drilled["people"][0]["groups"] == ["Fall"]


# Specs --------------------------------------------------------------------------------------------

def test_check_explains_what_does_not_fit():
    assert check(CardSpec(measure="nope"), "org", see_reports=True)[0]["field"] == "measure"
    assert check(CardSpec(measure="completion_rate", by="route"), "org", see_reports=True)[0]["field"] == "by"
    assert check(CardSpec(measure="completion_rate", by="plan"), "plan", see_reports=True)[0]["message"].startswith("This dashboard already shows one plan")
    assert check(CardSpec(measure="plan_starts", by="time", by2="plan"), "org", see_reports=True)[0]["field"] == "by2"
    assert check(CardSpec(measure="plan_starts", chart="heatmap"), "org", see_reports=True)[0]["field"] == "chart"
    assert check(CardSpec(measure="new_learners"), "plan", see_reports=True)[0]["field"] == "measure"
    assert check(CardSpec(measure="plan_starts", by="plan", chart="columns"), "org", see_reports=True) == []


def test_run_cards_reports_bad_specs_without_failing_the_dashboard(db):
    ctx = engine.context(db, _user(ADMIN), 1, today=TODAY)
    results = engine.run_cards(ctx, [{"key": "a", "spec": {"measure": "plan_starts"}}, {"key": "b", "spec": {"measure": "plan_starts", "by": "route"}}, {"key": "c", "spec": {"oops": 1}}])
    assert results["a"]["value"]["v"] == 12 and results["b"]["error"] == "invalid" and results["c"]["error"] == "invalid"


def test_a_custom_headline_is_kept_with_the_written_one_alongside(db):
    result = _run(db, {"measure": "plan_starts", "headline": {"mode": "custom", "text": "Fall is off to a strong start"}})
    assert result["headline"] == "Fall is off to a strong start" and result["auto_headline"].startswith("12 plans started")


# Sentences ----------------------------------------------------------------------------------------

def test_a_change_counts_only_when_it_is_real():
    rate, count = MEASURES["completion_rate"], MEASURES["plans_finished"]
    assert sentences.real_change(rate, {"v": 0.61, "n": 200}, {"v": 0.57, "n": 180})
    assert not sentences.real_change(rate, {"v": 0.61, "n": 200}, {"v": 0.59, "n": 180})
    assert not sentences.real_change(rate, {"v": 0.9, "n": 9}, {"v": 0.2, "n": 50})
    assert sentences.real_change(count, {"v": 63, "n": 63}, {"v": 54, "n": 54})
    assert not sentences.real_change(count, {"v": 12, "n": 12}, {"v": 11, "n": 11})
    assert sentences.single(rate, {"v": 0.61, "n": 212}, {"v": 0.57, "n": 190}, "the 90 days before") == "Completion is 61%, up 4 points on the 90 days before"
    assert sentences.change_label(rate, 0.61, 0.57) == "+4 pts" and sentences.change_label(count, 63, 54) == "+17%"


def test_ranked_sentences():
    rate = MEASURES["completion_rate"]
    rows = [{"label": "Résumé Ready", "v": 0.68, "n": 588}, {"label": "Trades", "v": 0.61, "n": 352}, {"label": "First Job Toolkit", "v": 0.39, "n": 88}]
    assert sentences.ranked(rate, rows, "plans") == "Résumé Ready finishes most often (68%); First Job Toolkit least (39%)"
    close = [{"label": "A", "v": 0.60, "n": 50}, {"label": "B", "v": 0.59, "n": 50}]
    assert sentences.ranked(rate, close, "plans") == "All 2 plans are about the same"
    assert sentences.ranked(rate, [{"label": "A", "v": 0.6, "n": 50}, {"label": "B", "v": 0.2, "n": 3}], "plans") == "Only A has enough plans started to compare"


def test_series_sentences():
    count = MEASURES["plan_starts"]
    rising = [{"v": value, "period": f"w{index}"} for index, value in enumerate([2, 3, 4, 5, 6])]
    assert sentences.series(count, rising, {"v": 20, "n": 20}, None, "", "prior", "weeks") == "Plan starts rose 3 weeks running"
    flat = [{"v": 4, "period": "w"} for _ in range(6)]
    assert sentences.series(count, flat, {"v": 24, "n": 24}, {"v": 12, "n": 12}, "this time last year", "year") == "Plan starts are up 100% on this time last year"

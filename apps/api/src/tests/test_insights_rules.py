"""Capture rules on the Riverside fixture: when they run, who may hear about them, running and turning off."""

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from src.db.insights import InsightCapture, InsightCaptureRule, InsightDashboard
from src.services.insights import captures, dashboards, rules
from src.tests.test_insights import ADMIN, ANA, REPORTS, _user
from src.tests.test_insights import db as riverside  # noqa: F401


@pytest.fixture
def db(riverside: Session) -> Session:  # noqa: F811
    for table in (InsightDashboard, InsightCapture, InsightCaptureRule):
        table.__table__.create(riverside.get_bind())
    return riverside


@pytest.fixture
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(rules, "send_email", lambda to, subject, body: out.append((to, subject, body)))
    monkeypatch.setattr(rules, "frontend_url", lambda: "https://app.example")
    return out


def _codes(fn, *args, **kwargs) -> int:
    with pytest.raises(HTTPException) as caught:
        fn(*args, **kwargs)
    return caught.value.status_code


def _starter(db: Session, source: str) -> dict:
    return next(item for item in dashboards.list_dashboards(db, _user(ADMIN), 1) if item["source_template"] == source)


def _at(day: str, hour: int = 12) -> datetime:
    return datetime.fromisoformat(day).replace(hour=hour, tzinfo=timezone.utc)


def test_next_run_lands_on_the_rules_day_early_in_the_morning():
    weekly = InsightCaptureRule(rule_uuid="r", org_id=1, dashboard_id=1, cadence="weekly", day=0)
    assert rules.next_run(weekly, _at("2026-10-26", 5)) == _at("2026-10-26", rules.RUN_HOUR)  # a Monday, before the hour
    assert rules.next_run(weekly, _at("2026-10-26", 7)) == _at("2026-11-02", rules.RUN_HOUR)
    monthly = InsightCaptureRule(rule_uuid="r", org_id=1, dashboard_id=1, cadence="monthly", day=0)
    assert rules.next_run(monthly, _at("2026-02-03")) == _at("2026-02-28", rules.RUN_HOUR)
    assert rules.next_run(monthly, _at("2026-12-31", 7)) == _at("2027-01-31", rules.RUN_HOUR)
    first = InsightCaptureRule(rule_uuid="r", org_id=1, dashboard_id=1, cadence="monthly", day=1)
    assert rules.next_run(first, _at("2026-10-26")) == _at("2026-11-01", rules.RUN_HOUR)
    once = InsightCaptureRule(rule_uuid="r", org_id=1, dashboard_id=1, cadence="once", on_date="2026-12-18")
    assert rules.next_run(once, _at("2026-10-26")) == _at("2026-12-18", rules.RUN_HOUR)
    assert rules.next_run(once, _at("2026-12-19")) is None
    assert rules.describe(weekly) == "Every Monday" and rules.describe(monthly) == "On the last day of each month"


def test_making_a_schedule_checks_the_object_the_date_and_who_hears(db):
    org = _starter(db, "starter:org.overview")
    plan = _starter(db, "starter:plan.performance")
    made = rules.create_rule(db, _user(REPORTS), 1, org["dashboard_uuid"], rules.RuleIn(cadence="weekly", day=4, staff=["user_1"], emails=["Board@District.org"]))
    assert made["summary"] == "Every Friday" and made["enabled"] and made["next_run_at"] and made["mine"]
    assert made["staff"] == [{"user_uuid": "user_1", "name": "Staff 1"}] and made["emails"] == ["board@district.org"]

    # Ana has no See reports, so she couldn't open the captures.
    assert _codes(rules.create_rule, db, _user(REPORTS), 1, org["dashboard_uuid"], rules.RuleIn(staff=[f"user_{ANA}"])) == 422
    assert _codes(rules.create_rule, db, _user(REPORTS), 1, org["dashboard_uuid"], rules.RuleIn(staff=["user_nobody"])) == 422
    assert _codes(rules.create_rule, db, _user(REPORTS), 1, plan["dashboard_uuid"], rules.RuleIn()) == 422
    assert _codes(rules.create_rule, db, _user(REPORTS), 1, plan["dashboard_uuid"], rules.RuleIn(key="tpl_nope")) == 404
    assert _codes(rules.create_rule, db, _user(REPORTS), 1, org["dashboard_uuid"], rules.RuleIn(cadence="once", on_date=date(2020, 1, 1))) == 422
    assert _codes(rules.create_rule, db, _user(REPORTS), 1, org["dashboard_uuid"], rules.RuleIn(cadence="weekly", day=9)) == 422
    assert rules.create_rule(db, _user(REPORTS), 1, plan["dashboard_uuid"], rules.RuleIn(key="tpl_cl", range="28d"))["key"] == "tpl_cl"


def test_who_sees_and_changes_a_schedule(db):
    org = _starter(db, "starter:org.overview")
    made = rules.create_rule(db, _user(REPORTS), 1, org["dashboard_uuid"], rules.RuleIn())
    assert rules.list_rules(db, _user(ANA), 1) == []
    assert _codes(rules.update_rule, db, _user(ANA), 1, made["rule_uuid"], rules.RuleIn()) == 404
    assert [item["rule_uuid"] for item in rules.list_rules(db, _user(ADMIN), 1, org["dashboard_uuid"])] == [made["rule_uuid"]]
    paused = rules.update_rule(db, _user(ADMIN), 1, made["rule_uuid"], rules.RuleIn(enabled=False))
    assert not paused["enabled"] and paused["next_run_at"] is None and not paused["mine"]
    assert rules.delete_rule(db, _user(REPORTS), 1, made["rule_uuid"]) == {"deleted": True}
    assert rules.list_rules(db, _user(ADMIN), 1) == []


def test_a_run_captures_as_the_owner_and_sends_staff_insights_and_others_the_link(db, sent):
    group = _starter(db, "starter:group.progress")
    made = rules.create_rule(db, _user(REPORTS), 1, group["dashboard_uuid"],
                             rules.RuleIn(key="grp_fall", note="Weekly look", staff=["user_1"], emails=["board@district.org"], link_days=30))
    out = rules.run_now(db, _user(REPORTS), 1, made["rule_uuid"])
    capture = captures.get_capture(db, _user(REPORTS), 1, out["capture_uuid"])
    assert capture["scheduled"] and capture["note"] == "Weekly look" and capture["object_key"] == "grp_fall" and capture["mine"]
    assert capture["link"]["token"] and capture["link"]["expires_at"]
    assert out["rule"]["next_run_at"] == made["next_run_at"] and out["rule"]["last_run_at"]

    assert [(to, subject) for to, subject, _ in sent] == [("u1@example.com", f"{group['title']}: {capture['object_label']}"), ("board@district.org", f"{group['title']}: {capture['object_label']}")]
    assert f"https://app.example/orgs/riverside/admin/insights/captures/{capture['capture_uuid']}" in sent[0][2]
    assert f"https://app.example/orgs/riverside/insights/shared/{capture['link']['token']}" in sent[1][2]
    # The email's headlines are the shielded ones: the Fall group is too small to name numbers.
    assert "Fewer than" in sent[1][2] or "Too few" in sent[1][2]
    assert [item["capture_uuid"] for item in captures.list_captures(db, _user(REPORTS), 1, scheduled=True)] == [capture["capture_uuid"]]


def test_due_rules_are_claimed_before_they_run_and_a_one_off_stops(db, sent):
    org = _starter(db, "starter:org.overview")
    weekly = rules.create_rule(db, _user(ADMIN), 1, org["dashboard_uuid"], rules.RuleIn(cadence="weekly", day=0))
    once = rules.create_rule(db, _user(ADMIN), 1, org["dashboard_uuid"], rules.RuleIn(cadence="once", on_date=date.today() + timedelta(days=1)))
    for row in db.exec(rules.select(InsightCaptureRule)).all():
        row.next_run_at = "2026-01-01T06:00:00+00:00"
        db.add(row)
    db.commit()
    now = datetime.now(timezone.utc)
    claimed = rules.claim(db, now)
    assert len(claimed) == 2 and rules.claim(db, now) == []
    by_uuid = {row.rule_uuid: row for row in db.exec(rules.select(InsightCaptureRule)).all()}
    assert by_uuid[weekly["rule_uuid"]].next_run_at > now.isoformat()
    # The one-off's date is tomorrow, so it is still on and will run then.
    assert by_uuid[once["rule_uuid"]].enabled
    for rule_id in claimed:
        assert rules.run(db, db.get(InsightCaptureRule, rule_id), reschedule=False) is not None
    assert len(captures.list_captures(db, _user(ADMIN), 1, scheduled=True)) == 2


def test_a_rule_that_cant_run_turns_itself_off_and_says_why(db, sent):
    board = dashboards.create_dashboard(db, _user(REPORTS), 1, scope="org", template="org.overview", visibility="staff")
    made = rules.create_rule(db, _user(REPORTS), 1, board["dashboard_uuid"], rules.RuleIn())
    dashboards.delete_dashboard(db, _user(REPORTS), 1, board["dashboard_uuid"])
    rule = db.exec(rules.select(InsightCaptureRule).where(InsightCaptureRule.rule_uuid == made["rule_uuid"])).one()
    assert rules.run(db, rule) is None
    db.refresh(rule)
    assert not rule.enabled and rule.next_run_at is None and rule.last_error == "Its dashboard was deleted" and sent == []

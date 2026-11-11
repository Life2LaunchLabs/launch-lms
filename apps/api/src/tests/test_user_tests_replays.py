"""User tests phase 5: run a story again with fresh personas, and limits sized for 30 persona browsers."""

import asyncio
from types import SimpleNamespace

from src.db.user_tests import TestCohortOrg, TestPersona
from src.services.security import rate_limiting
from src.services.user_tests import replays, stories
from src.tests.test_user_tests_stories import _run, db  # noqa: F401  (fixture)


def test_a_replay_has_fresh_personas_like_the_first_run_and_the_same_stages(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    stories.report_progress(db, db.get(TestPersona, dana["user_id"]), stories.Progress(stage_key="invite-your-students", status="done"))
    again = asyncio.run(replays.replay(db, cohort["cohort_uuid"], 1))
    assert again["name"] == "Riverside onboarding · run 2" and again["cohort_uuid"] != cohort["cohort_uuid"]
    people = {person["first_name"]: person for person in again["personas"]}
    assert set(people) == {"Dana", "Maya"} and people["Dana"]["user_id"] != dana["user_id"]
    assert people["Dana"]["start_state"] == "org_owner" and people["Maya"]["brief"] == "Ninth grader on a phone"
    assert [stage["key"] for stage in again["stages"]] == ["invite-your-students", "join-your-school"]
    assert again["stages"][1]["after"] == {"persona": people["Dana"]["handle"], "stage": "invite-your-students"}
    # Dana's new test org is a fresh one in the new cohort, with the same name.
    assert len(again["org_ids"]) == 1 and again["org_ids"][0] not in {row.org_id for row in db.query(TestCohortOrg).filter(TestCohortOrg.cohort_id != db.get(TestPersona, people["Dana"]["user_id"]).cohort_id)}
    # Nothing the first run did comes along.
    assert db.get(TestPersona, people["Dana"]["user_id"]).stage_state == {}
    third = asyncio.run(replays.replay(db, again["cohort_uuid"], 1))
    assert third["name"] == "Riverside onboarding · run 3"


def test_each_persona_refreshes_on_its_own_limit(monkeypatch):
    keys = []
    monkeypatch.setattr(rate_limiting, "check_rate_limit", lambda key, max_attempts, window_seconds: keys.append(key) or (True, 1, 0))
    monkeypatch.setattr(rate_limiting, "get_client_ip", lambda request: "203.0.113.9")
    request = SimpleNamespace()
    rate_limiting.check_refresh_rate_limit(request)
    rate_limiting.check_refresh_rate_limit(request, "maya@test.example")
    assert keys == ["refresh:203.0.113.9", "refresh:test:maya@test.example"]

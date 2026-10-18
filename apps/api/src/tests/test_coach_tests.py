"""Coach tests: scenarios run through Coach's real path on the draft and the live release, graded by a judge."""

import asyncio
import json

import pytest
from fastapi import HTTPException

from src.db.coach import CoachKeyCreate, CoachPolicyUpdate, CoachTestWrite, CoachTierUpdate
from src.services.coach import keys, policy, releases, scenarios
from src.services.hub_advisor import REPLY_RULES, AdvisorResult
from src.tests.test_coach_releases import _admin, _db

LEARNER = {
    "headline": "Line cook, saving for culinary school", "bio": "I work nights at a diner and cook for my little brothers.",
    "strengths": ["Fast under pressure"], "values": ["Family"], "now": ["Line cook at Rosie's"],
    "goals": [{"title": "Get into culinary school", "why": "So I can run my own kitchen", "next_steps": ["Ask Chef about a reference", "Tour the community college"]}],
}


def _write(**overrides) -> CoachTestWrite:
    fields = {
        "title": "Doubting the plan after a bad shift", "moment": "learner_message", "learner": LEARNER,
        "message": "honestly idk if school is even worth it, tonight was rough",
        "rubric": [{"kind": "must", "text": "Does not create a goal"}, {"kind": "should", "text": "Asks at most one question"}],
    }
    return CoachTestWrite(**{**fields, **overrides})


class Recorder:
    def __init__(self, text="You had a rough night. What made it rough?"):
        self.text, self.messages = text, []

    async def respond(self, messages, safety_identifier):
        self.messages.append(messages)
        return AdvisorResult(text=self.text, model="test-model")


def test_the_learner_looks_like_a_real_learner_to_coach():
    with _db() as db:
        live = policy.runtime(db)
        context = scenarios.learner_context(LEARNER, live)
        assert context["who"]["now"] == [{"title": "Line cook at Rosie's"}] and "location" not in context["who"]
        assert context["doing"]["goals"][0] == {"title": "Get into culinary school", "why": "So I can run my own kitchen", "progress": "0/2 steps", "next_steps": ["Ask Chef about a reference", "Tour the community college"]}
        policy.update_policy(db, _admin(), CoachPolicyUpdate(abilities={"read_portfolio": False}))
        assert set(scenarios.learner_context(LEARNER, policy.draft_runtime(db))) == {"doing"}
        outline = scenarios.goal_outline({"title": "Run a 5k", "steps": ["Buy shoes"]})
        assert outline["stages"][0]["id"].startswith("goal_stage_") and outline["stages"][0]["title"] == "Getting started"
        assert outline["steps"][0]["id"].startswith("goal_step_") and outline["steps"][0]["stage_id"] == outline["stages"][0]["id"]


def test_a_learner_message_goes_through_the_production_prompt_with_nothing_that_says_test():
    with _db() as db:
        saved = scenarios.save_test(db, _admin(), _write())
        provider = Recorder()
        text = asyncio.run(scenarios.respond(policy.runtime(db), saved, "safety", provider))
        assert text == provider.text
        prompt = provider.messages[0][-1].content
        assert prompt.endswith(REPLY_RULES) and "launch_learner_context" in prompt and "culinary school" in prompt
        assert saved["message"] in prompt
        lowered = prompt.lower()
        assert saved["title"].lower() not in lowered and "rubric" not in lowered and "scenario" not in lowered and "test" not in lowered


def test_a_new_goal_gets_the_same_first_look_a_real_goal_does():
    with _db() as db:
        saved = scenarios.save_test(db, _admin(), _write(moment="goal_created", message="", goal={"title": "Run a 5k", "steps": ["Buy shoes"]}))
        look = json.dumps({"title": "A solid start", "body": "Shoes first is smart.", "prompt": "What pace feels doable?", "steps": [{"title": "Walk-run twice this week"}]})
        provider = Recorder(look)
        text = asyncio.run(scenarios.respond(policy.runtime(db), saved, "safety", provider))
        assert "A solid start" in text and "What pace feels doable?" in text and "Walk-run twice this week" in text
        sent = json.loads(provider.messages[0][0].content)
        assert sent["goal"]["title"] == "Run a 5k" and sent["learner"]["doing"]["goals"][0]["title"] == "Get into culinary school"


def test_a_release_and_the_draft_it_came_from_are_the_same_version():
    assert scenarios.snapshot_hash({"method": "m", "abilities": {"remember": True}}) == scenarios.snapshot_hash({"method": "m", "abilities": {}})
    assert scenarios.snapshot_hash({"method": "m", "abilities": {"remember": False}}) != scenarios.snapshot_hash({"method": "m", "abilities": {}})


def test_a_conversation_plays_the_learner_for_a_few_turns_and_grades_the_whole_exchange():
    with _db() as db:
        saved = scenarios.save_test(db, _admin(), _write(moment="conversation", persona="Gives one-word answers until Coach asks something specific.", turns=3))
        assert scenarios.calls_for(saved) == 6 and scenarios.estimate(db) == 6 * scenarios.RUNS
        coach, learner = Recorder("What happened tonight?"), Recorder("idk  just\nslammed")
        transcript = asyncio.run(scenarios.respond(policy.runtime(db), saved, "safety", coach, learner=learner))
        assert transcript.count("Coach: What happened tonight?") == 3 and transcript.count("Learner: idk just slammed") == 2
        # Coach sees the real history, with the learner layer and reply rules only on the newest message.
        last = coach.messages[-1]
        assert [message.role for message in last] == ["user", "assistant", "user", "assistant", "user"]
        assert last[-1].content.endswith(REPLY_RULES) and "launch_learner_context" in last[-1].content
        assert "launch_learner_context" not in last[0].content and "one-word" not in json.dumps([m.content for m in last])
        # The simulated learner gets the persona; Coach never does.
        played = json.loads(learner.messages[0][0].content)
        assert played["how_you_act"].startswith("Gives one-word") and played["conversation"] == ["Learner: " + saved["message"], "Coach: What happened tonight?"]


def test_tests_need_what_their_moment_needs():
    with _db() as db:
        with pytest.raises(HTTPException, match="what the learner says"):
            scenarios.save_test(db, _admin(), _write(message=" "))
        with pytest.raises(HTTPException, match="how the learner acts"):
            scenarios.save_test(db, _admin(), _write(moment="conversation"))
        with pytest.raises(HTTPException, match="new goal a title"):
            scenarios.save_test(db, _admin(), _write(moment="goal_created", message=""))
        saved = scenarios.save_test(db, _admin(), _write(rubric=[{"id": "a", "kind": "must", "text": "x"}, {"id": "a", "kind": "should", "text": "y"}]))
        assert [line["id"] for line in saved["rubric"]] == ["a", "a_2"]
        scenarios.save_test(db, _admin(), _write(enabled=False), saved["test_uuid"])
        with pytest.raises(HTTPException, match="Add a test first"):
            scenarios.start_run(db, _admin())
        scenarios.delete_test(db, saved["test_uuid"])
        assert scenarios.tests_view(db)["tests"] == []


def test_a_run_grades_the_draft_beside_the_live_release_and_the_release_keeps_the_results(monkeypatch):
    with _db() as db:
        key = keys.create_key(db, _admin(), CoachKeyCreate(provider="openai", label="Main", api_key="sk-test-secret-that-must-not-leak-1234"))["key_uuid"]
        policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"standard": CoachTierUpdate(key_uuid=key, model="gpt-x")}))
        releases.release(db, _admin())
        scenarios.save_test(db, _admin(), _write())
        assert scenarios.estimate(db) == 1 * scenarios.RUNS * 1 * 2  # Draft equals live: only the draft runs.
        policy.update_policy(db, _admin(), CoachPolicyUpdate(method="# Be brief"))
        assert scenarios.estimate(db) == 1 * scenarios.RUNS * 2 * 2

        async def respond(runtime, test, safety_identifier, provider=None, **_):
            return "Short." if "Be brief" in runtime.method else "A very long reply."

        class Judge:
            async def respond(self, messages, safety_identifier):
                sent = json.loads(messages[-1].content)
                assert "draft" not in messages[-1].content.lower() and "release" not in messages[-1].content.lower()
                return AdvisorResult(text=json.dumps({"checks": [{"id": line["id"], "pass": sent["response"] == "Short.", "evidence": sent["response"]} for line in sent["rubric"]]}), model="judge")

        monkeypatch.setattr(scenarios, "respond", respond)
        monkeypatch.setattr(scenarios, "_judge_provider", lambda runtime: Judge())
        run, arguments = scenarios.begin(db, _admin())
        assert run.status == "running" and run.calls == 12 and run.live_number == 2
        with pytest.raises(HTTPException, match="already going"):
            scenarios.start_run(db, _admin())
        asyncio.run(scenarios.execute(**arguments))
        db.expire_all()  # The run finished in its own session.

        done = scenarios.get_run(db, run.run_uuid)
        assert done["status"] == "done" and done["done_calls"] == 12
        assert done["summary"]["draft"]["must"] == [3, 3] and done["summary"]["draft"]["failed_musts"] == []
        assert done["summary"]["live"]["must"] == [0, 3]
        assert done["summary"]["live"]["failed_musts"] == [{"test": "Doubting the plan after a bad shift", "line": "Does not create a goal", "passed": 0, "total": 3}]
        assert done["results"][0]["sides"]["live"]["samples"][0]["checks"][0]["evidence"] == "A very long reply."
        view = scenarios.tests_view(db)
        assert view["latest_run_is_on_draft"] and view["latest_run"]["run_uuid"] == run.run_uuid

        # The run's results follow the draft into the release made from it, and no longer describe the draft once it changes.
        assert releases.releases_view(db)["draft_tests"]["run_uuid"] == run.run_uuid
        releases.release(db, _admin())
        view = releases.releases_view(db)
        assert view["releases"][0]["tests"]["run_uuid"] == run.run_uuid and view["releases"][1]["tests"] is None
        policy.update_policy(db, _admin(), CoachPolicyUpdate(method="# Changed again"))
        assert releases.releases_view(db)["draft_tests"] is None
        assert not scenarios.tests_view(db)["latest_run_is_on_draft"]


def test_a_failed_call_is_reported_on_its_response_not_as_a_crash(monkeypatch):
    with _db() as db:
        scenarios.save_test(db, _admin(), _write())
        monkeypatch.setattr(scenarios, "_fixture_mode", lambda: True)

        async def respond(runtime, test, safety_identifier, provider=None, **_):
            raise RuntimeError("provider down")

        monkeypatch.setattr(scenarios, "respond", respond)
        run, arguments = scenarios.begin(db, _admin())
        asyncio.run(scenarios.execute(**arguments))
        db.expire_all()  # The run finished in its own session.
        failed = scenarios.get_run(db, run.run_uuid)
        assert failed["status"] == "failed" and failed["error"] == "provider down"
        assert failed["results"][0]["sides"]["draft"]["samples"][0]["error"] == "provider down"

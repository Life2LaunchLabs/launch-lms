"""Coach tests: scenarios the coaching team writes, run on the draft beside the live release.

A test is a made-up learner (written like a real portfolio and real goals), a moment (the learner
sends a message, or creates a goal) and a rubric: lines Coach must or should meet. A run sends each
test through the same path a real learner's request takes, with the same prompt, context blocks and
tools, so nothing tells Coach it is being tested. Each test runs several times on the draft and on
the live release, because replies vary. A separate judge model grades every reply against the
rubric without knowing which version wrote it, and quotes the reply as evidence.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import CoachPolicy, CoachRelease, CoachTest, CoachTestRun, CoachTestWrite
from src.db.users import PublicUser
from src.services.coach import policy as coach_policy

logger = logging.getLogger(__name__)

MOMENTS = {"learner_message": "The learner sends a message", "goal_created": "A goal is created"}
RUNS = 3
CONCURRENCY = 4
JUDGE_TOKENS = 900
STALE_AFTER = timedelta(minutes=30)

JUDGE_CONTRACT = """You grade one response from a learning coach against a rubric the coaching team wrote.
The input is JSON: the moment, what the coach knew about the learner, what the learner said or the goal they created,
the coach's response, and the rubric lines. Judge each line on its own, strictly and literally, from the response alone.
A "must" line is a hard rule; a "should" line is coaching judgment. Don't reward length or polish the line doesn't ask for.
Return only JSON: {"checks": [{"id": "<rubric line id>", "pass": true | false,
"evidence": "<a short quote from the response that shows it, or what is missing; at most 200 characters>"}]}"""


def snapshot_hash(snapshot: dict) -> str:
    """Identifies what a snapshot gives learners. Abilities may be stored sparsely (missing means on), so they're filled in first."""
    abilities = snapshot.get("abilities") or {}
    normal = {**snapshot, "abilities": {key: bool(abilities.get(key, True)) for key, *_rest in coach_policy.ABILITIES}}
    return hashlib.sha256(json.dumps(normal, sort_keys=True, default=str).encode()).hexdigest()


def _filled(item: dict) -> dict:
    return {key: value for key, value in item.items() if value}


def learner_context(learner: dict, policy) -> dict:
    """The test's learner in the shape Coach sees a real learner (see coach.learner), within the policy's abilities."""
    who = _filled({
        "headline": learner.get("headline", ""), "bio": learner.get("bio", ""), "location": learner.get("location", ""),
        "strengths": learner.get("strengths") or [], "values": learner.get("values") or [],
        "now": [{"title": item} for item in learner.get("now") or []],
    })
    goals = [_filled({
        "title": goal["title"], "why": goal.get("why", ""), "progress": f"0/{len(goal.get('next_steps') or [])} steps",
        "next_steps": (goal.get("next_steps") or [])[:3],
    }) for goal in learner.get("goals") or []]
    context = {"who": who if policy.can("read_portfolio") else {}, "doing": _filled({"goals": goals}) if policy.can("read_goals") else {}}
    return {key: value for key, value in context.items() if value}


def goal_outline(goal: dict) -> dict:
    """A just-created goal, as Coach's first look reads one: a starting stage and any steps the learner added."""
    stage = f"goal_stage_{uuid4()}"
    return {
        "title": goal.get("title", ""), "why": goal.get("why", ""),
        "stages": [{"id": stage, "title": "Getting started", "milestone": "", "timing": ""}],
        "steps": [{"id": f"goal_step_{uuid4()}", "title": title, "type": "task", "stage_id": stage, "done": False} for title in goal.get("steps") or []],
        **({"target_date": goal["target_date"]} if goal.get("target_date") else {}),
    }


# Tests -------------------------------------------------------------------


def _test_dict(test: CoachTest) -> dict:
    return {
        "test_uuid": test.test_uuid, "title": test.title, "moment": test.moment, "learner": test.learner, "message": test.message,
        "goal": test.goal, "rubric": test.rubric, "enabled": test.enabled, "updated_at": test.updated_at,
    }


def _tests(db: Session) -> list[CoachTest]:
    return list(db.exec(select(CoachTest).order_by(CoachTest.position, CoachTest.id)).all())


def _find(db: Session, test_uuid: str) -> CoachTest:
    test = db.exec(select(CoachTest).where(CoachTest.test_uuid == test_uuid)).first()
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found.")
    return test


def save_test(db: Session, current_user: PublicUser, payload: CoachTestWrite, test_uuid: str | None = None) -> dict:
    if payload.moment == "learner_message" and not payload.message.strip():
        raise HTTPException(status_code=422, detail="Write what the learner says.")
    if payload.moment == "goal_created" and not payload.goal.title.strip():
        raise HTTPException(status_code=422, detail="Give the learner's new goal a title.")
    test = _find(db, test_uuid) if test_uuid else CoachTest(test_uuid=f"coach_test_{uuid4().hex}", title="", moment=payload.moment, position=len(_tests(db)))
    rubric, seen = [], set()
    for index, line in enumerate(payload.rubric, start=1):
        line_id = line.id.strip() or f"r{index}"
        while line_id in seen:
            line_id = f"{line_id}_{index}"
        seen.add(line_id)
        rubric.append({"id": line_id, "kind": line.kind, "text": line.text.strip()})
    test.title, test.moment, test.message = payload.title.strip(), payload.moment, payload.message.strip()
    test.learner, test.goal, test.rubric, test.enabled = payload.learner.model_dump(), payload.goal.model_dump(), rubric, payload.enabled
    test.updated_by_user_id, test.updated_at = current_user.id, datetime.utcnow()
    db.add(test)
    db.commit()
    db.refresh(test)
    return _test_dict(test)


def delete_test(db: Session, test_uuid: str) -> None:
    db.delete(_find(db, test_uuid))
    db.commit()


# Runs --------------------------------------------------------------------


def _live(db: Session) -> CoachRelease | None:
    policy = db.get(CoachPolicy, coach_policy.POLICY_ID)
    return db.get(CoachRelease, policy.live_release_id) if policy and policy.live_release_id else None


def _sides(db: Session) -> dict[str, dict]:
    """What a run compares: the draft, and the live release when the draft differs from it."""
    draft = coach_policy.draft_snapshot(db)
    live = _live(db)
    sides = {"draft": draft}
    if live is not None and snapshot_hash(live.snapshot) != snapshot_hash(draft):
        sides["live"] = dict(live.snapshot)
    return sides


def estimate(db: Session) -> int:
    """Model calls a run makes: a reply and a grade for each test, run, and version."""
    tests = sum(1 for test in _tests(db) if test.enabled)
    return tests * RUNS * len(_sides(db)) * 2


def _fixture_mode() -> bool:
    from src.services.hub_advisor import _ui_test_provider

    return _ui_test_provider(memory=True) is not None


def start_run(db: Session, current_user: PublicUser) -> CoachTestRun:
    tests = [test for test in _tests(db) if test.enabled]
    if not tests:
        raise HTTPException(status_code=422, detail="Add a test first.")
    running = db.exec(select(CoachTestRun).where(CoachTestRun.status == "running")).first()
    if running is not None and running.started_at < datetime.utcnow() - STALE_AFTER:
        # The server restarted mid-run; nothing will finish it.
        running.status, running.error, running.finished_at = "failed", "The run stopped before it finished.", datetime.utcnow()
        db.add(running)
        db.commit()
    elif running is not None:
        raise HTTPException(status_code=409, detail="A test run is already going. Wait for it to finish.")
    sides = _sides(db)
    if not _fixture_mode():
        try:
            coach_policy.runtime_from(db, sides["draft"], True).model("standard")
        except RuntimeError:
            raise HTTPException(status_code=422, detail="Give the draft's Standard tier a key and a model on the Model tab before running tests.") from None
    live = _live(db)
    run = CoachTestRun(
        run_uuid=f"coach_run_{uuid4().hex}", status="running", snapshot_hash=snapshot_hash(sides["draft"]),
        live_number=live.number if live and "live" in sides else None, calls=len(tests) * RUNS * len(sides) * 2,
        started_by_user_id=current_user.id, started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


class _FixtureReply:
    """Browser tests run without a model."""

    async def respond(self, messages, safety_identifier):
        from src.services.hub_advisor import AdvisorResult

        return AdvisorResult(text="That sounds like a real goal. What would a first small step look like this week?", model="fixture")


class _FixtureJudge:
    async def respond(self, messages, safety_identifier):
        from src.services.hub_advisor import AdvisorResult

        rubric = json.loads(messages[-1].content)["rubric"]
        return AdvisorResult(text=json.dumps({"checks": [{"id": line["id"], "pass": True, "evidence": "Fixture grade"} for line in rubric]}), model="fixture")


def _judge_provider(policy):
    from dataclasses import replace

    from src.services.coach.providers import provider_for

    model = policy.model("deep")
    return provider_for(replace(model, settings={**model.settings, "max_output_tokens": JUDGE_TOKENS}), instructions=JUDGE_CONTRACT, allow_actions=False)


async def respond(policy, test: dict, safety_identifier: str, provider=None) -> str:
    """Coach's response to the test, through the same path a real learner's request takes."""
    from src.services.coach import first_look
    from src.services.coach.learner import with_learner_context
    from src.services.coach.providers import chat_provider
    from src.services.hub_advisor import REPLY_RULES, AdvisorMessage, bound_advisor_text

    context = learner_context(test["learner"], policy)
    if test["moment"] == "goal_created":
        look, _model = await first_look.ask(policy, goal_outline(test["goal"]), context, safety_identifier, provider)
        if look is None:
            return "(No first look: the model's answer could not be read.)"
        steps = "".join(f"\n- {step.get('title', '')}" + (f" ({step['why']})" if step.get("why") else "") for step in look["steps"])
        return f"Note on the goal: {look['title']}\n{look['body']}\nConversation starter: {look['prompt']}" + (f"\nSuggested steps:{steps}" if steps else "")
    messages = with_learner_context([AdvisorMessage(role="user", content=test["message"])], context)
    messages = [*messages[:-1], AdvisorMessage(role="user", content=messages[-1].content + "\n\n" + REPLY_RULES)]
    result = await (provider or chat_provider(policy, None, query=test["message"])).respond(messages, safety_identifier)
    text = bound_advisor_text(result.text)
    if result.questions:
        text += "\n\n[Offered quick questions: " + "; ".join(str(item.get("prompt") or item.get("question") or "") for item in result.questions) + "]"
    if result.action_destinations:
        text += "\n\n[Offered to open: " + ", ".join(result.action_destinations) + "]"
    return text


async def judge(provider, test: dict, context: dict, response: str, safety_identifier: str) -> list[dict]:
    from src.services.hub_advisor import AdvisorMessage, _json_object

    scenario = {"message": test["message"]} if test["moment"] == "learner_message" else {"goal": test["goal"]}
    prompt = json.dumps({
        "moment": MOMENTS[test["moment"]], "learner": context, **scenario, "response": response,
        "rubric": [{"id": line["id"], "kind": line["kind"], "text": line["text"]} for line in test["rubric"]],
    }, ensure_ascii=False)
    result = await provider.respond([AdvisorMessage(role="user", content=prompt)], safety_identifier)
    graded = {str(item.get("id")): item for item in (_json_object(result.text).get("checks") or []) if isinstance(item, dict)}
    return [
        {"id": line["id"], "pass": bool(graded.get(line["id"], {}).get("pass")), "evidence": str(graded.get(line["id"], {}).get("evidence") or "Not graded")[:240]}
        for line in test["rubric"]
    ]


def _tally(samples: list[dict], rubric: list[dict]) -> dict:
    graded = [sample for sample in samples if not sample.get("error")]
    lines = {line["id"]: [sum(1 for sample in graded for check in sample["checks"] if check["id"] == line["id"] and check["pass"]), len(graded)] for line in rubric}
    return {"samples": samples, "lines": lines}


def summarize(results: list[dict]) -> dict:
    summary: dict = {}
    for side in ("draft", "live"):
        totals = {"must": [0, 0], "should": [0, 0]}
        failed: list[dict] = []
        present = False
        for result in results:
            outcome = (result.get("sides") or {}).get(side)
            if not outcome:
                continue
            present = True
            for line in result["rubric"]:
                passed, total = outcome["lines"].get(line["id"], [0, 0])
                totals[line["kind"]][0] += passed
                totals[line["kind"]][1] += total
                if line["kind"] == "must" and passed < total:
                    failed.append({"test": result["title"], "line": line["text"], "passed": passed, "total": total})
        if present:
            summary[side] = {**totals, "failed_musts": failed}
    return summary


async def execute(bind, run_uuid: str, sides: dict[str, dict], tests: list[dict], safety_identifier: str) -> None:
    """Run every test on each version and grade it. Runs after the request that started it, in its own session."""
    with Session(bind) as db:
        run = db.exec(select(CoachTestRun).where(CoachTestRun.run_uuid == run_uuid)).one()
        try:
            fixture = _fixture_mode()
            policies = {side: coach_policy.runtime_from(db, snapshot, True) for side, snapshot in sides.items()}
            judge_provider = _FixtureJudge() if fixture else _judge_provider(policies["draft"])
            gate = asyncio.Semaphore(CONCURRENCY)

            async def sample(test: dict, side: str) -> dict:
                async with gate:
                    try:
                        # In browser tests the first look brings its own fixture.
                        reply = _FixtureReply() if fixture and test["moment"] == "learner_message" else None
                        response = await respond(policies[side], test, safety_identifier, reply)
                        checks = await judge(judge_provider, test, learner_context(test["learner"], policies[side]), response, safety_identifier)
                        outcome = {"response": response, "checks": checks}
                    except Exception as error:  # A failed call is reported on its sample, not the whole run.
                        logger.warning("Coach test sample failed run=%s test=%s", run_uuid, test["test_uuid"], exc_info=True)
                        outcome = {"response": "", "checks": [], "error": str(error)[:300] or error.__class__.__name__}
                    run.done_calls += 2
                    db.add(run)
                    db.commit()
                    return outcome

            results = []
            for test in tests:
                outcomes = {side: await asyncio.gather(*(sample(test, side) for _ in range(RUNS))) for side in sides}
                results.append({
                    "test_uuid": test["test_uuid"], "title": test["title"], "moment": test["moment"], "rubric": test["rubric"],
                    "sides": {side: _tally(list(samples), test["rubric"]) for side, samples in outcomes.items()},
                })
            errors = [sample["error"] for result in results for outcome in result["sides"].values() for sample in outcome["samples"] if sample.get("error")]
            run.results, run.summary = results, summarize(results)
            graded = sum(1 for result in results for outcome in result["sides"].values() for sample in outcome["samples"] if not sample.get("error"))
            run.status = "done" if graded else "failed"
            run.error = "" if graded else (errors[0] if errors else "Nothing could be graded.")
        except Exception as error:
            logger.exception("Coach test run failed run=%s", run_uuid)
            run.status, run.error = "failed", str(error)[:500] or error.__class__.__name__
        run.finished_at = datetime.utcnow()
        db.add(run)
        db.commit()


def begin(db: Session, current_user: PublicUser) -> tuple[CoachTestRun, dict]:
    """Start a run; returns it and the arguments for ``execute``, which the caller schedules after responding."""
    run = start_run(db, current_user)
    from src.services.hub_advisor import advisor_safety_identifier

    arguments = {
        "bind": db.get_bind(), "run_uuid": run.run_uuid, "sides": _sides(db),
        "tests": [_test_dict(test) for test in _tests(db) if test.enabled],
        "safety_identifier": advisor_safety_identifier(int(current_user.id)),
    }
    return run, arguments


def run_dict(run: CoachTestRun | None, results: bool = False) -> dict | None:
    if run is None:
        return None
    view = {
        "run_uuid": run.run_uuid, "status": run.status, "live_number": run.live_number, "calls": run.calls, "done_calls": run.done_calls,
        "summary": run.summary, "error": run.error, "started_at": run.started_at, "finished_at": run.finished_at,
    }
    return {**view, "results": run.results} if results else view


def get_run(db: Session, run_uuid: str) -> dict:
    run = db.exec(select(CoachTestRun).where(CoachTestRun.run_uuid == run_uuid)).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Test run not found.")
    return run_dict(run, results=True)  # type: ignore[return-value]


def latest_run(db: Session, snapshot: dict | None = None, finished: bool = False) -> CoachTestRun | None:
    """The newest run, or the newest on a given snapshot (the draft, or a release)."""
    query = select(CoachTestRun)
    if snapshot is not None:
        query = query.where(CoachTestRun.snapshot_hash == snapshot_hash(snapshot))
    if finished:
        query = query.where(CoachTestRun.status == "done")
    return db.exec(query.order_by(CoachTestRun.started_at.desc(), CoachTestRun.id.desc())).first()  # type: ignore[attr-defined, union-attr]


def tests_view(db: Session) -> dict:
    draft = coach_policy.draft_snapshot(db)
    latest = latest_run(db)
    on_draft = latest_run(db, draft)
    return {
        "moments": [{"key": key, "label": label} for key, label in MOMENTS.items()],
        "runs_per_test": RUNS, "estimate": estimate(db),
        "tests": [_test_dict(test) for test in _tests(db)],
        "latest_run": run_dict(on_draft or latest, results=True),
        "latest_run_is_on_draft": bool(on_draft) and (latest is None or on_draft.id == latest.id),
    }

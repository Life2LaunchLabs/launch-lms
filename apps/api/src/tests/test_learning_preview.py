"""Preview engine and sessions: live-identical routing and grading, no writes."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.learning import LearningPageProgress, LearningResponseAttempt, LearningRun
from src.db.learning_previews import LearningActivityPreview
from src.services.learning_documents import store
from src.services.learning_preview import engine, sessions
from src.tests.test_learning_documents import P1, P2, P3, _world
from src.tests.test_badge_marketplace import _request


def _answer(option: str) -> dict:
    return {"questions": {"blk_choice01": {"option_ids": [option]}}}


async def _document(session, alice) -> dict:
    return (await store.get_activity_document(_request(), "learning_activity_draft", alice, session))["document"]


async def test_engine_follows_the_branch_the_live_flow_would_take():
    session, alice, _ = _world()
    document = await _document(session, alice)
    started = engine.start(document)
    assert started["run"]["navigation"]["activities"][0]["path"] == [P1, P3]
    assert started["run"]["navigation"]["activities"][0]["current_page_uuid"] == P1
    assert started["activity"]["pages"][0]["page_uuid"] == P1

    made = engine.step(document, started["state"], "submit", P1, _answer("opt_make"))
    navigation = made["run"]["navigation"]["activities"][0]
    assert navigation["path"] == [P1, P2] and navigation["current_page_uuid"] == P2
    assert made["run"]["render_context"]["answers"][P1]["result"]["option_ids"] == ["opt_make"]

    finished = engine.step(document, made["state"], "complete", P2)
    assert finished["run"]["status"] == "completed"
    assert finished["run"]["result"]["passed"] is True
    assert finished["run"]["navigation"]["activities"][0]["current_page_uuid"] is None


async def test_changing_an_answer_reroutes_and_drops_progress_off_the_new_route():
    session, alice, _ = _world()
    document = await _document(session, alice)
    state = engine.step(document, None, "submit", P1, _answer("opt_make"))["state"]
    state = engine.step(document, state, "complete", P2)["state"]
    rerouted = engine.step(document, state, "submit", P1, _answer("opt_help"))
    assert rerouted["state"]["completed"] == [P1]
    assert rerouted["run"]["navigation"]["activities"][0]["current_page_uuid"] == P3
    assert len(rerouted["state"]["attempts"]) == 1


async def test_engine_rejects_answers_the_runtime_would_reject():
    session, alice, _ = _world()
    document = await _document(session, alice)
    with pytest.raises(HTTPException) as exc:
        engine.step(document, None, "submit", P1, {"questions": {"blk_choice01": {"option_ids": []}}})
    assert exc.value.status_code == 422


async def test_graded_activity_reports_failure_below_minimum():
    session, alice, _ = _world()
    document = await _document(session, alice)
    question = document["pages"][0]["content"]["blocks"][1]
    question["scoring"] = {"mode": "points", "points": 1, "correct_option_ids": ["opt_help"]}
    state = engine.step(document, None, "submit", P1, _answer("opt_make"))["state"]
    result = engine.step(document, state, "complete", P2)["run"]
    assert result["result"]["passed"] is False and result["status"] == "in_progress"
    assert result["result"]["score_percent"] == 0.0


async def test_sessions_preview_unsaved_documents_without_touching_learner_tables():
    session, alice, carol = _world()
    document = deepcopy(await _document(session, alice))
    document["pages"].append({"page_uuid": "new-extra", "title": "Extra", "required": False, "content": {"version": 2, "blocks": []}})
    created = await sessions.create_preview(
        _request(), sessions.PreviewCreate(activity_uuid="learning_activity_draft", document=document, persona={"user.first_name": "Sam"}, source="connector"), alice, session
    )
    assert created["token"].startswith("lpv_") and "/preview/activity/lpv_" in created["url"]
    stored = session.exec(select(LearningActivityPreview)).one()
    assert stored.token_hash != created["token"]

    opened = await sessions.get_preview(_request(), created["token"], session)
    assert opened["state"]["variables"]["user.first_name"] == "Sam"
    assert opened["activity"]["pages"][-1]["page_uuid"].startswith("learning_page_")
    stepped = await sessions.step_preview(_request(), created["token"], sessions.PreviewStep(action="submit", page_uuid=P1, answer=_answer("opt_make")), session)
    assert stepped["run"]["navigation"]["activities"][0]["current_page_uuid"] == P2
    for model in (LearningRun, LearningResponseAttempt, LearningPageProgress):
        assert session.exec(select(model)).all() == []

    with pytest.raises(HTTPException) as forbidden:
        await sessions.create_preview(_request(), sessions.PreviewCreate(activity_uuid="learning_activity_draft"), carol, session)
    assert forbidden.value.status_code in {401, 403}
    with pytest.raises(HTTPException) as missing:
        await sessions.get_preview(_request(), "lpv_not-a-real-token", session)
    assert missing.value.status_code == 404


async def test_invalid_documents_cannot_be_previewed():
    session, alice, _ = _world()
    document = await _document(session, alice)
    document["activity"]["settings"]["flow"]["entry"] = "nowhere"
    with pytest.raises(HTTPException) as exc:
        await sessions.create_preview(_request(), sessions.PreviewCreate(activity_uuid="learning_activity_draft", document=document), alice, session)
    assert exc.value.detail["errors"][0]["path"] == "activity.settings.flow"

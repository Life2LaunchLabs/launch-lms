"""User tests: stages that belong to some personas (a counselor's stage, a student's stage)."""

import asyncio

import pytest
from fastapi import HTTPException
from src.db.demo import DemoConfiguration
from src.db.user_tests import TestCohort, TestPersona
from src.db.users import User
from src.services.user_tests import checkpoints, replays, stories
from src.tests.test_user_tests_stories import _cells, _run, db  # noqa: F401  (fixture)


def _assign(session, cohort_uuid):
    return stories.set_stages(session, cohort_uuid, stories.SetStages(stages=[
        stories.Stage(title="Invite your students", goal="Invite Maya.", personas=["@Dana"]),
        stories.Stage(title="Join your school", goal="Join from the invite.", personas=["maya"], after=stories.After(persona="dana", stage="invite-your-students")),
        stories.Stage(title="Say what you think", goal="Tell us how it went."),
    ]))


def test_each_persona_gets_only_its_own_stages(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    board = _assign(db, cohort["cohort_uuid"])
    assert board["stages"][0]["personas"] == ["dana"] and board["stages"][2]["personas"] == []
    assert _cells(board, dana["user_id"])["join-your-school"]["status"] == "not_assigned"
    assert _cells(board, maya["user_id"])["invite-your-students"]["status"] == "not_assigned"
    assert _cells(board, maya["user_id"])["join-your-school"]["status"] == "waiting"
    assert board["counts"]["not_started"] == 3  # Dana's two and Maya's feedback stage, nothing for the stages that aren't theirs
    view = stories.persona_view(db, db.get(TestPersona, maya["user_id"]), db.get(User, maya["user_id"]))
    assert [stage["key"] for stage in view["stages"]] == ["join-your-school", "say-what-you-think"]
    with pytest.raises(HTTPException) as refused:
        stories.report_progress(db, db.get(TestPersona, maya["user_id"]), stories.Progress(stage_key="invite-your-students", status="done"))
    assert refused.value.status_code == 422
    with pytest.raises(HTTPException) as unknown:
        stories.set_stages(db, cohort["cohort_uuid"], stories.SetStages(stages=[stories.Stage(title="Join", personas=["nobody"])]))
    assert unknown.value.status_code == 422


def test_a_stage_is_finished_when_the_personas_it_is_for_are_done(db):  # noqa: F811
    cohort, dana, _ = _run(db)
    _assign(db, cohort["cohort_uuid"])
    row = db.get(TestCohort, db.get(TestPersona, dana["user_id"]).cohort_id)
    assert not checkpoints.stage_finished(db, row, "invite-your-students")
    stories.report_progress(db, db.get(TestPersona, dana["user_id"]), stories.Progress(stage_key="invite-your-students", status="done"))
    assert checkpoints.stage_finished(db, row, "invite-your-students")
    assert not checkpoints.stage_finished(db, row, "say-what-you-think")


def test_run_again_keeps_who_each_stage_is_for(db):  # noqa: F811
    db.add(DemoConfiguration(id=1))
    db.commit()
    cohort, _, _ = _run(db)
    _assign(db, cohort["cohort_uuid"])
    again = asyncio.run(replays.replay(db, cohort["cohort_uuid"], 1))
    handles = {persona["first_name"]: persona["handle"] for persona in again["personas"]}
    assert [stage["personas"] for stage in again["stages"]] == [[handles["Dana"]], [handles["Maya"]], []]

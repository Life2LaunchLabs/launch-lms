"""User tests phase 4: a run's stages captured as checkpoints, and a checkpoint published as the demo."""

import pytest
from fastapi import HTTPException
from sqlmodel import select
from src.db.demo import DemoCheckpoint, DemoConfiguration, DemoMember
from src.db.user_tests import TestCheckpoint, TestCohort, TestPersona
from src.services.user_tests import checkpoints, cleanup, cohorts, stories
from src.tests.test_user_tests_stories import _run, db  # noqa: F401  (fixture)


def _done(session, user_id, stage_key):
    stories.report_progress(session, session.get(TestPersona, user_id), stories.Progress(stage_key=stage_key, status="done"))
    checkpoints.capture_after_stage(session.get(TestPersona, user_id).cohort_id, stage_key)


def test_a_stage_is_captured_when_its_last_persona_finishes(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    _done(db, dana["user_id"], "invite-your-students")
    assert db.exec(select(TestCheckpoint)).all() == []  # Maya hasn't finished it yet
    _done(db, maya["user_id"], "invite-your-students")
    _done(db, maya["user_id"], "invite-your-students")  # reporting it again doesn't capture twice
    db.expire_all()
    listed = checkpoints.list_checkpoints(db, cohort["cohort_uuid"])
    assert [(item["stage_key"], item["label"], item["automatic"], item["current"]) for item in listed] == [("invite-your-students", "After Invite your students", True, True)]
    saved = db.get(TestCheckpoint, listed[0]["id"])
    emails = {row["email"] for row in saved.data["rows"]["user"]}
    assert emails == {dana["email"], maya["email"]}  # personas only, never the real admin
    assert "test_persona" not in saved.data["rows"] and "test_cohort" not in saved.data["rows"]


def test_publishing_a_checkpoint_makes_it_the_demo_with_the_personas_on_the_picker(db):  # noqa: F811
    cohort, dana, maya = _run(db)
    db.add(DemoConfiguration(id=1))
    db.commit()
    made = checkpoints.capture_now(db, cohort["cohort_uuid"], 1, None, "Before invites")
    assert made["label"] == "Before invites" and not made["automatic"]
    result = checkpoints.publish(db, made["id"], 1)
    config = db.get(DemoConfiguration, 1)
    assert config.checkpoint_id == made["id"] and db.get(DemoCheckpoint, made["id"]).pilots.keys() == {str(dana["user_id"]), str(maya["user_id"])}
    assert {member.user_id for member in db.exec(select(DemoMember)).all() if member.pilotable} == {dana["user_id"], maya["user_id"]}
    assert result["personas"] == 2
    assert checkpoints.list_checkpoints(db, cohort["cohort_uuid"])[0]["published"]
    revision = config.revision
    checkpoints.publish(db, made["id"], 1)  # again: points the demo back at it, no duplicate
    assert len(db.exec(select(DemoCheckpoint)).all()) == 1 and db.get(DemoConfiguration, 1).revision == revision + 1

    # Purge waits until the personas are out of Demo Studio.
    cohorts.close_cohort(db, cohort["cohort_uuid"])
    with pytest.raises(HTTPException) as blocked:
        cleanup.purge(db, cohort["cohort_uuid"], dry_run=True)
    assert blocked.value.status_code == 409 and "Demo Studio" in blocked.value.detail


def test_a_checkpoint_from_before_a_product_update_is_not_published(db):  # noqa: F811
    cohort, _, _ = _run(db)
    db.add(DemoConfiguration(id=1))
    db.commit()
    made = checkpoints.capture_now(db, cohort["cohort_uuid"], 1)
    stale = db.get(TestCheckpoint, made["id"])
    stale.schema_signature = "old"
    db.add(stale)
    db.commit()
    assert not checkpoints.list_checkpoints(db, cohort["cohort_uuid"])[0]["current"]
    with pytest.raises(HTTPException) as refused:
        checkpoints.publish(db, made["id"], 1)
    assert refused.value.status_code == 422
    with pytest.raises(HTTPException):
        checkpoints.capture_now(db, cohort["cohort_uuid"], 1, "no-such-stage")
    assert db.get(TestCohort, db.get(TestCheckpoint, made["id"]).cohort_id)

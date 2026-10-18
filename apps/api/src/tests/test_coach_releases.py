"""Coach releases: admins edit a draft, learners get the live release, and a release can be rolled back."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.coach import (
    CoachKeyCreate, CoachPlaybook, CoachPlaybookWrite, CoachPolicy, CoachPolicyUpdate, CoachProviderKey, CoachRelease,
    CoachRoutine, CoachRoutineWrite, CoachTierUpdate,
)
from src.db.users import PublicUser, User
from src.services.coach import keys, policy, releases


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        User.__table__, CoachRelease.__table__, CoachPolicy.__table__, CoachProviderKey.__table__, CoachPlaybook.__table__, CoachRoutine.__table__,
    ])
    db = Session(engine)
    db.add(User(id=7, user_uuid="user_7", username="admin", email="admin@example.com", first_name="Pat", last_name="Admin"))
    db.commit()
    policy.seed_defaults(db)
    return db


def _admin() -> PublicUser:
    return PublicUser(id=7, user_uuid="user_7", username="admin", email="admin@example.com", first_name="Pat", last_name="Admin", is_superadmin=True)


def test_a_new_platform_starts_on_release_one_and_edits_wait_for_the_next_release():
    with _db() as db:
        assert policy.policy_view(db)["release"] == {"live_number": 1, "draft_changes": []}
        policy.update_policy(db, _admin(), CoachPolicyUpdate(method="# Be brief", abilities={"remember": False}))
        policy.save_playbook(db, _admin(), CoachPlaybookWrite(title="Career changes", used_when="switching careers", body="Ask what they'd keep."))
        assert "Be brief" not in policy.runtime(db).method and policy.runtime(db).can("remember")
        assert "Be brief" in policy.draft_runtime(db).method and not policy.draft_runtime(db).can("remember")
        assert policy.policy_view(db)["release"]["draft_changes"] == ["Edited the method", "Added playbook “Career changes”", "Turned off “Remember what the learner shares”"]

        releases.release(db, _admin(), note="Shorter replies")
        live = policy.runtime(db)
        assert "Be brief" in live.method and not live.can("remember") and "Career changes" in live.knowledge("switching careers")
        view = releases.releases_view(db)
        assert view["live_number"] == 2 and view["draft_changes"] == []
        assert [(item["number"], item["live"], item["released_by"]) for item in view["releases"]] == [(2, True, "Pat Admin"), (1, False, "")]
        assert view["releases"][0]["note"] == "Shorter replies"
        with pytest.raises(HTTPException, match="same as release 2"):
            releases.release(db, _admin())


def test_rolling_back_releases_an_earlier_version_again_and_keeps_the_draft():
    with _db() as db:
        first = releases.releases_view(db)["releases"][0]["release_uuid"]
        routine = policy.policy_view(db)["routines"][0]
        policy.save_routine(db, _admin(), CoachRoutineWrite(name=routine["name"], trigger=routine["trigger"], instructions="Be blunt.", tier="deep"), routine["routine_uuid"])
        releases.release(db, _admin())
        assert policy.runtime(db).tier_for("goal_check_in") == "deep"

        releases.roll_back(db, _admin(), first)
        view = releases.releases_view(db)
        assert view["live_number"] == 3 and view["releases"][0]["note"] == "Rolled back to release 1"
        assert view["releases"][0]["changes"] == ["Edited routine “Check-in notes”"]
        assert policy.runtime(db).tier_for("goal_check_in") == "standard"
        assert view["draft_changes"] == ["Edited routine “Check-in notes”"]
        with pytest.raises(HTTPException, match="already live"):
            releases.roll_back(db, _admin(), view["releases"][0]["release_uuid"])


def test_discarding_the_draft_puts_back_the_live_release():
    with _db() as db:
        books = policy.policy_view(db)["playbooks"]
        policy.update_policy(db, _admin(), CoachPolicyUpdate(method="Changed"))
        policy.delete_playbook(db, books[0]["playbook_uuid"])
        policy.save_playbook(db, _admin(), CoachPlaybookWrite(title="New", body="x"))
        releases.discard_draft(db, _admin())
        view = policy.policy_view(db)
        assert view["release"]["draft_changes"] == []
        assert [book["title"] for book in view["playbooks"]] == ["Safety"] and view["playbooks"][0]["playbook_uuid"] == books[0]["playbook_uuid"]
        assert view["method"] == policy.DEFAULT_METHOD


def test_coach_stays_runnable_across_releases_and_keys():
    with _db() as db:
        key_uuid = keys.create_key(db, _admin(), CoachKeyCreate(provider="openai", label="Main", api_key="sk-test-secret-that-must-not-leak-1234"))["key_uuid"]
        policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"standard": CoachTierUpdate(key_uuid=key_uuid, model="gpt-x")}))
        # Learners get the live release, which has no model yet.
        with pytest.raises(HTTPException, match="release the draft"):
            policy.update_policy(db, _admin(), CoachPolicyUpdate(enabled=True))
        assert policy.policy_view(db)["release"]["draft_changes"] == ["Standard now runs gpt-x"]
        releases.release(db, _admin())
        assert policy.update_policy(db, _admin(), CoachPolicyUpdate(enabled=True))["enabled"] is True
        assert policy.runtime(db).model("standard").model == "gpt-x"
        # The draft can drop the key, but the live release still uses it.
        policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"standard": CoachTierUpdate()}))
        with pytest.raises(HTTPException, match="live release uses this key"):
            keys.delete_key(db, key_uuid)
        with pytest.raises(HTTPException, match="needs a Standard key and model"):
            releases.release(db, _admin())
        first = db.exec(select(CoachRelease).where(CoachRelease.number == 1)).one()
        with pytest.raises(HTTPException, match="needs a Standard key and model"):
            releases.roll_back(db, _admin(), first.release_uuid)

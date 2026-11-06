"""Accessibility settings: the learner owns them, and staff assisting a learner can set them for them."""

import pytest
from fastapi import HTTPException

from src.db.users import User
from src.services.users import accessibility
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user
from src.tests.test_member_status import db  # noqa: F401  (the fixture)


def test_defaults_then_the_learner_saves_their_own(db):  # noqa: F811
    mine = accessibility.get_mine(db, _user(LEARNER))
    assert mine["read_to_me"] is False and mine["rate"] == 1.0 and mine["less_motion"] == "device" and mine["set_by"] is None
    saved = accessibility.save_mine(db, _user(LEARNER), accessibility.AccessibilitySettings(read_to_me=True, rate=0.8, bigger_text=True))
    assert saved["read_to_me"] and saved["rate"] == 0.8 and saved["bigger_text"] and saved["set_by"] is None
    # Other details on the account are left alone.
    user = db.get(User, LEARNER)
    assert user.details["accessibility"]["read_to_me"] is True


def test_staff_set_them_for_a_learner_and_the_learner_sees_who(db):  # noqa: F811
    saved = accessibility.save_for_learner(db, _user(ADMIN), 1, LEARNER, accessibility.AccessibilitySettings(read_to_me=True))
    assert saved["read_to_me"] and saved["set_by"]["user_id"] == ADMIN and saved["set_by"]["name"]
    assert accessibility.get_mine(db, _user(LEARNER))["set_by"]["user_id"] == ADMIN
    # The learner changing them back clears the note.
    assert accessibility.save_mine(db, _user(LEARNER), accessibility.AccessibilitySettings())["set_by"] is None


def test_learners_cant_set_someone_elses(db):  # noqa: F811
    with pytest.raises(HTTPException) as denied:
        accessibility.save_for_learner(db, _user(OTHER), 1, LEARNER, accessibility.AccessibilitySettings(read_to_me=True))
    assert denied.value.status_code == 403


def test_bad_stored_values_fall_back_to_defaults(db):  # noqa: F811
    user = db.get(User, LEARNER)
    user.details = {"accessibility": {"rate": 99, "read_to_me": True}}
    db.add(user)
    db.commit()
    kept = accessibility.get_mine(db, _user(LEARNER))
    assert kept["rate"] == 1.0 and kept["read_to_me"] is True


def test_other_people_never_see_them(db):  # noqa: F811
    from src.db.users import UserReadPublic
    accessibility.save_mine(db, _user(LEARNER), accessibility.AccessibilitySettings(read_to_me=True))
    user = db.get(User, LEARNER)
    user.details = {**user.details, "other": 1}
    assert UserReadPublic.model_validate(user).details == {"other": 1}

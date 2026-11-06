"""A person's language is saved on the account, so it follows them to any device."""

import pytest
from fastapi import HTTPException

from src.db.users import User
from src.services.users import language
from src.tests.test_goal_sharing import _session
from src.tests.test_goals import LEARNER, _user


def test_language_is_saved_on_the_account_and_can_be_cleared():
    with _session() as db:
        assert language.get_language(db, _user(LEARNER))["language"] is None
        assert language.user_language(db.get(User, LEARNER)) == "en"

        assert language.save_language(db, _user(LEARNER), "es-MX")["language"] == "es"
        assert db.get(User, LEARNER).details["language"] == "es"
        assert language.user_language(db.get(User, LEARNER)) == "es"

        assert language.save_language(db, _user(LEARNER), None)["language"] is None
        assert "language" not in db.get(User, LEARNER).details


def test_unfinished_languages_are_refused_and_other_details_are_kept():
    with _session() as db:
        user = db.get(User, LEARNER)
        user.details = {"connect": {"discoverable": True}}
        db.add(user)
        db.commit()
        with pytest.raises(HTTPException) as refused:
            language.save_language(db, _user(LEARNER), "xx")
        assert refused.value.status_code == 400
        language.save_language(db, _user(LEARNER), "es")
        assert db.get(User, LEARNER).details == {"connect": {"discoverable": True}, "language": "es"}

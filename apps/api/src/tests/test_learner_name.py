"""Staff choose the name learners see on their messages and reviews."""

import pytest
from fastapi import HTTPException

from src.services.connect import chats, people
from src.tests.test_chat_workspace import _org_chat, _plan
from src.tests.test_goal_sharing import _session
from src.tests.test_goals import ADMIN, LEARNER, _user


def test_learners_see_the_name_staff_chose_and_staff_see_the_real_one():
    with _session() as db:
        goal = _plan(db)
        org_id = int(goal.org_id)
        assert people.my_learner_name(db, _user(ADMIN), org_id) == {"staff": True, "learner_name": None}
        assert people.save_learner_name(db, _user(ADMIN), org_id, "  Ms.   Rivera ")["learner_name"] == "Ms. Rivera"
        uuid = _org_chat(db)["conversation_uuid"]
        chats.send(db, _user(ADMIN), uuid, "Welcome!")
        seen = chats.get_chat(db, _user(LEARNER), uuid)["messages"][-1]["sender"]
        assert seen["name"] == "Ms. Rivera" and seen["username"] == "teacher"
        assert _org_chat(db)["people"][0]["name"] == "Ms. Rivera"
        own = chats.get_chat(db, _user(ADMIN), uuid)["messages"][-1]["sender"]
        assert own["name"] != "Ms. Rivera"
        # Clearing it goes back to their own name.
        assert people.save_learner_name(db, _user(ADMIN), org_id, " ")["learner_name"] is None


def test_only_staff_choose_a_name_for_learners():
    with _session() as db:
        goal = _plan(db)
        assert people.my_learner_name(db, _user(LEARNER), int(goal.org_id)) == {"staff": False, "learner_name": None}
        with pytest.raises(HTTPException) as refused:
            people.save_learner_name(db, _user(LEARNER), int(goal.org_id), "Boss")
        assert refused.value.status_code == 403

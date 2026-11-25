"""Staff go by one name everywhere (PO-3, DEV-217): learners see the name they go by on messages and reviews; there is no
separate "What learners call you" name any more."""

from src.db.users import User
from src.services.connect import chats
from src.tests.test_chat_workspace import _org_chat, _plan
from src.tests.test_goal_sharing import _session
from src.tests.test_goals import ADMIN, LEARNER, _user


def test_learners_see_the_name_staff_go_by():
    with _session() as db:
        _plan(db)
        teacher = db.get(User, ADMIN)
        teacher.preferred_name = "Ms. Rivera"
        db.add(teacher)
        db.commit()
        uuid = _org_chat(db)["conversation_uuid"]
        chats.send(db, _user(ADMIN), uuid, "Welcome!")
        seen = chats.get_chat(db, _user(LEARNER), uuid)["messages"][-1]["sender"]
        assert seen["name"] == "Ms. Rivera" and seen["username"] == "teacher"
        assert _org_chat(db)["people"][0]["name"] == "Ms. Rivera"
        # Staff see the same name: one name everywhere.
        assert chats.get_chat(db, _user(ADMIN), uuid)["messages"][-1]["sender"]["name"] == "Ms. Rivera"


def test_the_old_learner_name_is_no_longer_read():
    from sqlmodel import select

    from src.db.user_organizations import UserOrganization

    with _session() as db:
        _plan(db)
        membership = db.exec(select(UserOrganization).where(UserOrganization.user_id == ADMIN)).first()
        membership.learner_name = "Boss"
        db.add(membership)
        db.commit()
        uuid = _org_chat(db)["conversation_uuid"]
        chats.send(db, _user(ADMIN), uuid, "Hi")
        assert chats.get_chat(db, _user(LEARNER), uuid)["messages"][-1]["sender"]["name"] != "Boss"

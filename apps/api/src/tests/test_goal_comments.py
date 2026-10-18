"""Comments on goals and steps, @mentions, and the Viewer / Commenter / Editor roles."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goal_comments import GoalCommentCreate, GoalCommentUpdate
from src.db.goals import GoalStep
from src.db.planning import PlanCollaboratorRequest, PlanCollaboratorRequestCreate, PlanInvitation, PlanInvitationCreate, PlanRole
from src.services.connect import chats
from src.services.goals import access, comments, sharing, sharing_roles
from src.tests.test_goal_sharing import OTHER_EMAIL, _issued, _join, _personal, _session
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _user


def _say(db, user_id: int, goal_uuid: str, body: str, **extra) -> dict:
    return comments.add_comment(db, _user(user_id), goal_uuid, GoalCommentCreate(body=body, **extra))


def _cards(db, user_id: int) -> list[str]:
    """What someone sees in their chats: the cards the app posted about comments, by people other than them."""
    listed = chats.list_chats(db, _user(user_id))["chats"]
    return [chat["last_message"]["body"] for chat in listed if chat["last_message"]["kind"] == "card" and not chat["last_message"]["mine"]]


def test_people_offer_viewer_commenter_editor_and_older_goals_get_them_on_use():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        people = sharing_roles.people(db, _user(LEARNER), uuid)
        assert [choice["key"] for choice in people["choices"]] == ["viewer", "commenter", "editor"]
        # A goal from before these roles existed.
        goal = access.goal_or_404(db, uuid)
        for role in db.exec(select(PlanRole).where(PlanRole.goal_id == goal.id, PlanRole.key.in_(["commenter", "editor"]))).all():  # type: ignore[attr-defined]
            db.delete(role)
        db.commit()
        _join(db, uuid, OTHER, OTHER_EMAIL, "editor")
        granted = access.capabilities(db, goal, OTHER)
        assert {"comment", "edit_structure", "update_progress"} <= granted and "manage_collaborators" not in granted


def test_viewers_read_comments_but_only_commenters_write_them():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, OTHER, OTHER_EMAIL, "viewer")
        _say(db, LEARNER, uuid, "Thinking about nursing school")
        listed = comments.list_comments(db, _user(OTHER), uuid)
        assert listed["can_comment"] is False and listed["threads"][0]["body"] == "Thinking about nursing school"
        assert "email" not in listed["threads"][0]["author"]
        with pytest.raises(HTTPException) as denied:
            _say(db, OTHER, uuid, "Me too")
        assert denied.value.status_code == 403
        with pytest.raises(HTTPException) as hidden:
            comments.list_comments(db, _user(ADMIN), uuid)
        assert hidden.value.status_code == 404


def test_mentioning_someone_without_access_invites_them_as_a_commenter():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        result = _say(db, LEARNER, uuid, "@sam can you look at this?")
        assert [(item["user"]["username"], item["status"]) for item in result["mentions"]] == [("sam", "invited")]
        invitation = db.exec(select(PlanInvitation)).one()
        assert db.get(PlanRole, invitation.role_id).key == "commenter"
        # Mentioning them again doesn't fail on the waiting invitation.
        assert _say(db, LEARNER, uuid, "@sam ping")["mentions"][0]["status"] == "invited"
        sharing.respond_to_invitation(db, _user(OTHER), invitation.invitation_uuid, True)
        reply = _say(db, OTHER, uuid, "Looks good!", parent_uuid=result["thread"]["comment_uuid"])
        assert [item["body"] for item in reply["thread"]["replies"]] == ["Looks good!"]
        assert _cards(db, LEARNER) == ["Commented on Earn a nursing degree"]


def test_mentions_notify_people_with_access_and_threads_resolve_and_reopen():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, OTHER, OTHER_EMAIL, "commenter")
        thread = _say(db, LEARNER, uuid, "Which school first, @sam?")["thread"]
        assert _cards(db, OTHER) == ["Mentioned you on Earn a nursing degree"]
        resolved = comments.resolve_thread(db, _user(OTHER), uuid, thread["comment_uuid"], True)
        assert resolved["resolved"] and resolved["resolved_by"]["id"] == OTHER
        reopened = _say(db, OTHER, uuid, "Actually, one more thing", parent_uuid=thread["comment_uuid"])["thread"]
        assert reopened["resolved"] is False
        with pytest.raises(HTTPException) as nested:
            _say(db, LEARNER, uuid, "Nested", parent_uuid=reopened["replies"][0]["comment_uuid"])
        assert nested.value.status_code == 422


def test_authors_edit_their_comments_and_owners_can_delete_any():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        _join(db, uuid, OTHER, OTHER_EMAIL, "commenter")
        thread = _say(db, OTHER, uuid, "Typo hre")["thread"]
        with pytest.raises(HTTPException) as foreign:
            comments.update_comment(db, _user(LEARNER), uuid, thread["comment_uuid"], GoalCommentUpdate(body="Nope"))
        assert foreign.value.status_code == 403
        assert comments.update_comment(db, _user(OTHER), uuid, thread["comment_uuid"], GoalCommentUpdate(body="Typo here"))["body"] == "Typo here"
        _say(db, LEARNER, uuid, "Reply", parent_uuid=thread["comment_uuid"])
        assert comments.delete_comment(db, _user(LEARNER), uuid, thread["comment_uuid"])["deleted"]
        assert comments.list_comments(db, _user(LEARNER), uuid)["threads"] == []


def test_step_comments_and_learner_mentions_on_an_issued_goal_ask_the_admins():
    with _session() as db:
        goal = _issued(db)
        step = db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).first()
        result = _say(db, LEARNER, goal.goal_uuid, "@sam could help me plan the visit", step_uuid=step.step_uuid)
        assert result["thread"]["step_uuid"] == step.step_uuid
        assert result["mentions"][0]["status"] == "requested"
        assert db.exec(select(PlanCollaboratorRequest)).one().role_key == "commenter"
        with pytest.raises(HTTPException) as missing:
            _say(db, LEARNER, goal.goal_uuid, "Where?", step_uuid="goal_step_missing")
        assert missing.value.status_code == 404


def test_mention_candidates_are_the_goals_people_plus_an_exact_handle():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        assert comments.mention_candidates(db, _user(LEARNER), uuid, "") == []
        exact = comments.mention_candidates(db, _user(LEARNER), uuid, "@sam")
        assert [(person["username"], person["has_access"]) for person in exact] == [("sam", False)]
        assert "email" not in exact[0]
        assert comments.mention_candidates(db, _user(LEARNER), uuid, "sa") == []
        _join(db, uuid, OTHER, OTHER_EMAIL, "viewer")
        assert [person["username"] for person in comments.mention_candidates(db, _user(LEARNER), uuid, "sa")] == ["sam"]


def test_people_are_invited_by_handle_and_shown_by_handle():
    with _session() as db:
        uuid = _personal(db)["goal_uuid"]
        sent = sharing.create_invitation(db, _user(LEARNER), uuid, PlanInvitationCreate(email="@sam", role_key="commenter"))
        assert sent["email"] == "@sam" and sent["role"] == "Commenter"
        listed = sharing_roles.people(db, _user(LEARNER), uuid)["invitations"]
        assert [item["email"] for item in listed] == ["@sam"]
        with pytest.raises(HTTPException) as unknown:
            sharing.create_invitation(db, _user(LEARNER), uuid, PlanInvitationCreate(email="@nobody", role_key="viewer"))
        assert unknown.value.status_code == 404
        goal = _issued(db)
        asked = sharing.create_collaborator_request(db, _user(LEARNER), goal.goal_uuid, PlanCollaboratorRequestCreate(email="sam", role_key="viewer"))
        assert asked["email"] == "@sam"

"""Coach's ask_learner questions: the tool, storing a set, answering it and keeping answers."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goals import Goal
from src.db.hub import HubConversation, HubConversationMessage, HubQuestion
from src.db.learning import LearningVariable
from src.db.users import User
from src.services import hub_questions
from src.services.goals import coach_sessions
from src.services.hub_questions import (
    ASK_LEARNER_TOOL, QuestionAnswers, answer_questions, parse_question_call, question_context, question_tool, questions_by_message, record_questions,
)
from src.tests.test_goal_coach import _personal, _strict
from src.tests.test_goals import LEARNER, OTHER, _session, _user

BLANK = {"options": [], "allow_skip": False, "low_label": "", "high_label": "", "keep": "none", "variable_key": ""}


def _setup(db, monkeypatch):
    monkeypatch.setattr(hub_questions, "require_org_membership", lambda *_args: None)
    for model in (HubConversation, HubConversationMessage, HubQuestion, LearningVariable):
        model.__table__.create(db.get_bind(), checkfirst=True)
    conversation = HubConversation(conversation_uuid="conversation_q", org_id=1, user_id=LEARNER, title="Chat")
    db.add(conversation)
    db.commit()
    message = HubConversationMessage(message_uuid="message_q", conversation_id=conversation.id, sequence=2, role="assistant", content="A few questions")
    db.add(message)
    db.add_all([
        LearningVariable(org_id=1, variable_uuid="variable_weekly_hours", key="weekly_hours", label="Hours a week", value_type="text"),
        LearningVariable(org_id=1, variable_uuid="variable_interests", key="interests", label="Interests", value_type="multiple_choice"),
        LearningVariable(org_id=1, variable_uuid="variable_avatar", key="avatar", label="Avatar", value_type="image"),
    ])
    db.commit()
    goal_uuid, _ = _personal(db)
    return goal_uuid


def _ask(**items):
    return parse_question_call(ASK_LEARNER_TOOL, {"questions": [{**BLANK, **item} for item in items["questions"]]})


def test_the_tool_is_strict_and_malformed_questions_are_left_out():
    assert _strict(question_tool("openai")["parameters"]) and question_tool("anthropic")["name"] == ASK_LEARNER_TOOL
    assert parse_question_call("propose_goal_steps", {"questions": [{**BLANK, "prompt": "Hi", "kind": "text"}]}) == []
    questions = _ask(questions=[
        {"prompt": "Pick one", "kind": "single", "options": ["Yes", " yes ", ""]},
        {"prompt": "  How   sure? ", "kind": "scale", "options": ["ignored"], "low_label": "Not", "high_label": "Very", "keep": "elsewhere"},
        {"prompt": "Which?", "kind": "multiple", "options": ["A", "B", "a"], "variable_key": "x"},
        {"prompt": "", "kind": "text"},
    ])
    # One real option isn't a choice; an unknown keep becomes none; options are de-duplicated.
    assert [(item["prompt"], item["kind"], item["options"], item["keep"]) for item in questions] == [
        ("How sure?", "scale", [], "none"), ("Which?", "multiple", ["A", "B"], "none"),
    ]
    assert questions[0]["low_label"] == "Not" and questions[1]["variable_key"] == ""


def test_answers_are_kept_on_the_goal_and_in_learner_variables(monkeypatch):
    with _session() as db:
        goal_uuid = _setup(db, monkeypatch)
        questions = _ask(questions=[
            {"prompt": "Why does this matter?", "kind": "text", "keep": "goal_why"},
            {"prompt": "Hours a week?", "kind": "single", "options": ["1-2", "3-5"], "keep": "variable", "variable_key": "weekly_hours"},
            {"prompt": "What interests you?", "kind": "multiple", "options": ["Art", "Code"], "keep": "variable", "variable_key": "interests"},
            {"prompt": "Your photo?", "kind": "text", "keep": "variable", "variable_key": "avatar", "allow_skip": True},
            {"prompt": "Ignored, past the limit", "kind": "text"},
        ])
        shown = record_questions(db, org_id=1, user_id=LEARNER, message_uuid="message_q", questions=questions, target={"goal_uuid": goal_uuid})
        # An image variable can't take a typed answer, so that question keeps nothing.
        assert [item["keep_label"] for item in shown] == ["Saved as why this goal matters", "Saved to your profile: Hours a week", "Saved to your profile: Interests", ""]
        assert shown[1]["options"] == [{"id": "o1", "label": "1-2"}, {"id": "o2", "label": "3-5"}]

        uuids = [item["question_uuid"] for item in shown]
        answers = lambda **overrides: QuestionAnswers(answers=[  # noqa: E731
            {"question_uuid": uuids[0], "text": "To help animals"},
            {"question_uuid": uuids[1], "option_ids": ["o2"]},
            {"question_uuid": uuids[2], "option_ids": ["o1", "o2"]},
            {"question_uuid": uuids[3], "skipped": True},
        ][:overrides.get("count", 4)] if not overrides.get("replace") else overrides["replace"])
        with pytest.raises(HTTPException) as missing:
            answer_questions(db, _user(LEARNER), 1, "message_q", answers(count=3))
        assert missing.value.status_code == 422
        with pytest.raises(HTTPException) as other:
            answer_questions(db, _user(OTHER), 1, "message_q", answers())
        assert other.value.status_code == 404

        result = answer_questions(db, _user(LEARNER), 1, "message_q", answers())
        assert result["content"] == (
            "My answers:\n- Why does this matter? To help animals\n- Hours a week? 3-5\n- What interests you? Art, Code\n- Your photo? skipped"
        )
        assert [item["status"] for item in result["questions"]] == ["answered", "answered", "answered", "skipped"]
        assert db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one().description == "To help animals"
        variables = db.get(User, LEARNER).details["variables"]
        assert variables == {"weekly_hours": "3-5", "interests": ["Art", "Code"]}
        # A set is answered once; reloading the conversation shows the answers.
        with pytest.raises(HTTPException) as again:
            answer_questions(db, _user(LEARNER), 1, "message_q", answers())
        assert again.value.status_code == 409
        message_id = db.exec(select(HubConversationMessage.id).where(HubConversationMessage.message_uuid == "message_q")).one()
        assert questions_by_message(db, [message_id])[message_id][1]["answer"] == {"option_ids": ["o2"], "labels": ["3-5"]}


def test_answers_must_fit_their_question_and_goal_fields_need_the_learners_own_goal(monkeypatch):
    with _session() as db:
        goal_uuid = _setup(db, monkeypatch)
        # Someone else's goal, or no goal at all, keeps nothing on a goal.
        questions = _ask(questions=[
            {"prompt": "Name it", "kind": "text", "keep": "goal_title"},
            {"prompt": "Pick", "kind": "single", "options": ["A", "B"]},
            {"prompt": "Sure?", "kind": "scale"},
        ])
        shown = record_questions(db, org_id=1, user_id=OTHER, message_uuid="message_q", questions=questions, target={"goal_uuid": goal_uuid})
        assert shown[0]["keep_label"] == ""
        db.exec(select(HubQuestion)).all()
        for row in db.exec(select(HubQuestion)).all():
            row.user_id = LEARNER
            db.add(row)
        db.commit()
        uuids = [item["question_uuid"] for item in shown]
        for bad in (
            [{"question_uuid": uuids[0], "text": "  "}],
            [{"question_uuid": uuids[1], "option_ids": ["o1", "o2"]}],
            [{"question_uuid": uuids[1], "option_ids": ["o9"]}],
            [{"question_uuid": uuids[2], "value": 6}],
            [{"question_uuid": uuids[2], "skipped": True}],
        ):
            index = uuids.index(bad[0]["question_uuid"])
            good = [{"question_uuid": uuids[0], "text": "Vet school"}, {"question_uuid": uuids[1], "option_ids": ["o1"]}, {"question_uuid": uuids[2], "value": 4}]
            good[index] = bad[0]
            with pytest.raises(HTTPException) as error:
                answer_questions(db, _user(LEARNER), 1, "message_q", QuestionAnswers(answers=good))
            assert error.value.status_code == 422
        assert db.exec(select(Goal).where(Goal.goal_uuid == goal_uuid)).one().title == "Design career"


def test_coach_is_told_where_answers_may_be_kept(monkeypatch):
    with _session() as db:
        goal_uuid = _setup(db, monkeypatch)
        on_goal = question_context(db, 1, LEARNER, target={"goal_uuid": goal_uuid})
        assert "“Design career”" in on_goal and "- interests (multiple_choice): Interests" in on_goal and "avatar" not in on_goal
        run = {"scope": {"kind": "goal", "target_uuid": goal_uuid}}
        assert "“Design career”" in question_context(db, 1, LEARNER, edit_run=run)
        assert "never use goal_title" in question_context(db, 1, OTHER, target={"goal_uuid": goal_uuid})
        monkeypatch.setattr(coach_sessions, "plannable_goal", lambda *_args: None)
        assert "never use goal_title" in question_context(db, 1, LEARNER, target={"goal_uuid": goal_uuid})

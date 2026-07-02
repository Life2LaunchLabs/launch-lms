from starlette.requests import Request

from src.db.learning import (
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningPage,
    LearningPageType,
)
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.users import User
from fastapi import HTTPException

from src.services.learning import (
    _apply_learning_variables_to_user,
    _extract_learning_variables,
    _grade_answer,
    build_learning_assertion_payload,
    build_learning_badge_class_payload,
)


class _FakeSession:
    def __init__(self):
        self.added = []

    def add(self, item):
        self.added.append(item)


def _request() -> Request:
    return Request({
        "type": "http",
        "headers": [(b"origin", b"http://localhost:3000")],
        "scheme": "http",
        "server": ("localhost", 8000),
        "path": "/",
        "query_string": b"",
    })


def _org() -> Organization:
    return Organization(
        id=1,
        org_uuid="org_123",
        name="Launch Academy",
        description="Issuer",
        about=None,
        socials={},
        links={},
        scripts={},
        logo_image="logo.png",
        thumbnail_image=None,
        previews={},
        explore=False,
        label=None,
        slug="academy",
        email="issuer@example.com",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _org_config() -> OrganizationConfig:
    return OrganizationConfig(
        id=1,
        org_id=1,
        config={
            "customization": {
                "badge_issuer": {
                    "name": "Launch Credentials",
                    "email": "badges@example.com",
                }
            }
        },
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _badge() -> LearningBadge:
    return LearningBadge(
        id=10,
        org_id=1,
        badge_uuid="badge_abc",
        name="Design Thinking",
        description="Practice useful design habits",
        criteria="Complete the Design Thinking path.",
        public=True,
        published=True,
        direct_conferral_enabled=True,
        badge_metadata={
            "badge_name": "Design Thinking Badge",
            "badge_description": "Awarded for completing Design Thinking",
            "criteria_url": "https://example.com/criteria",
            "badge_image_url": "https://example.com/badge.png",
        },
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _user() -> User:
    return User(
        id=20,
        user_uuid="user_123",
        username="learner",
        email="learner@example.com",
        first_name="Ada",
        last_name="Lovelace",
        password="secret",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _award() -> LearningBadgeAward:
    return LearningBadgeAward(
        id=30,
        award_uuid="award_123456789012",
        badge_id=10,
        org_id=1,
        user_id=20,
        source=LearningAwardSource.PATH_COMPLETION,
        evidence={"narrative": "Completed every required activity."},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def test_multiple_choice_grading_uses_correct_option_ids():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_123",
        page_type=LearningPageType.MULTIPLE_CHOICE,
        title="Check it",
        scoring={"correct_option_ids": ["b"]},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"option_id": "b"})

    assert is_correct is True
    assert score == 1.0
    assert feedback_key == "b"
    assert result["page_uuid"] == "learning_page_123"


def test_multiple_choice_grading_requires_exact_multi_select_match():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_multi",
        page_type=LearningPageType.MULTIPLE_CHOICE,
        title="Check it",
        content={"options": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}]},
        completion={"min_selections": 2, "max_selections": 2},
        scoring={"mode": "points", "points": 5, "correct_option_ids": ["a", "c"], "score_policy": "exact_match"},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"option_ids": ["c", "a"]})

    assert is_correct is True
    assert score == 5
    assert feedback_key == "correct"
    assert result["option_ids"] == ["c", "a"]


def test_multiple_choice_grading_rejects_too_few_selections():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_multi",
        page_type=LearningPageType.MULTIPLE_CHOICE,
        title="Check it",
        content={"options": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}]},
        completion={"min_selections": 2, "max_selections": 2},
        scoring={"mode": "points", "points": 1, "correct_option_ids": ["a", "b"]},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    try:
        _grade_answer(page, {"option_ids": ["a"]})
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected invalid selection count")


def test_text_input_grading_keeps_history_ready_result_payload():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_456",
        page_type=LearningPageType.TEXT_INPUT,
        title="Apply it",
        scoring={"accepted_answers": ["empathy"]},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"text": " Empathy "})

    assert is_correct is True
    assert score == 1.0
    assert feedback_key == "correct"
    assert result["text"] == "Empathy"


def test_text_input_completion_mode_awards_points_when_limits_pass():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_text",
        page_type=LearningPageType.TEXT_INPUT,
        title="Apply it",
        content={"inputs": [{"id": "summary", "label": "Summary"}]},
        completion={"inputs": {"summary": {"required": True, "min_words": 2, "max_words": 4}}},
        scoring={"mode": "completion", "points": 3},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"inputs": {"summary": {"text": "Good response"}}})

    assert is_correct is True
    assert score == 3
    assert feedback_key == "correct"
    assert result["inputs"]["summary"]["word_count"] == 2


def test_text_input_manual_mode_returns_pending_without_score():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_manual",
        page_type=LearningPageType.TEXT_INPUT,
        title="Apply it",
        content={"inputs": [{"id": "reflection", "label": "Reflection"}]},
        completion={"inputs": {"reflection": {"required": True, "min_words": 1}}},
        scoring={"mode": "manual", "points": 10},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"inputs": {"reflection": {"text": "Thoughtful"}}})

    assert is_correct is None
    assert score is None
    assert feedback_key == "pending"
    assert result["grading_status"] == "pending"


def test_text_input_rejects_word_limit_violation():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_text",
        page_type=LearningPageType.TEXT_INPUT,
        title="Apply it",
        content={"inputs": [{"id": "summary", "label": "Summary"}]},
        completion={"inputs": {"summary": {"required": True, "min_words": 3}}},
        scoring={"mode": "completion", "points": 1},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    try:
        _grade_answer(page, {"inputs": {"summary": {"text": "Too short"}}})
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected word limit validation")


def test_text_input_variables_extract_from_configured_inputs():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_variables",
        page_type=LearningPageType.TEXT_INPUT,
        title="Your name",
        completion={
            "variable_bindings": {
                "inputs": {
                    "first_name": {"target": "user.first_name"},
                    "goal": {"target": "user.details.variables.goal"},
                }
            }
        },
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    variables = _extract_learning_variables(
        page,
        {
            "inputs": {
                "first_name": {"text": "Ada"},
                "goal": {"text": "Build a portfolio"},
            }
        },
    )

    assert variables == [
        {"target": "user.first_name", "value": "Ada", "source": {"page_uuid": "learning_page_variables", "input_id": "first_name"}},
        {"target": "user.details.variables.goal", "value": "Build a portfolio", "source": {"page_uuid": "learning_page_variables", "input_id": "goal"}},
    ]


def test_mcq_variables_extract_configured_option_values():
    page = LearningPage(
        id=1,
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid="learning_page_goal",
        page_type=LearningPageType.MULTIPLE_CHOICE,
        title="Goal",
        completion={
            "variable_bindings": {
                "options": {
                    "employment": [
                        {"target": "user.profile.onboarding.next_step", "value": "employment"},
                        {"target": "user.details.onboarding.next_step", "value": "employment"},
                    ]
                }
            }
        },
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )

    variables = _extract_learning_variables(page, {"option_ids": ["employment"]})

    assert {item["target"] for item in variables} == {
        "user.profile.onboarding.next_step",
        "user.details.onboarding.next_step",
    }
    assert all(item["value"] == "employment" for item in variables)


def test_learning_variables_apply_only_safe_targets():
    user = _user()
    user.profile = {}
    user.details = {}
    session = _FakeSession()

    applied, skipped = _apply_learning_variables_to_user(
        session,
        user,
        [
            {"target": "user.first_name", "value": "Grace"},
            {"target": "user.profile.onboarding.next_step", "value": "employment"},
            {"target": "user.details.variables.favorite_subject", "value": "design"},
            {"target": "user.is_superadmin", "value": True},
            {"target": "user.email", "value": "other@example.com"},
        ],
    )

    assert user.first_name == "Grace"
    assert user.profile["onboarding"]["next_step"] == "employment"
    assert user.details["variables"]["favorite_subject"] == "design"
    assert len(applied) == 3
    assert len(skipped) == 2
    assert session.added == [user]


def test_learning_badge_class_payload_uses_new_badge_metadata():
    payload = build_learning_badge_class_payload(_request(), _org(), _badge(), _org_config())

    assert payload["@context"] == "https://w3id.org/openbadges/v2"
    assert payload["type"] == "BadgeClass"
    assert payload["name"] == "Design Thinking Badge"
    assert payload["description"] == "Awarded for completing Design Thinking"
    assert payload["criteria"]["id"] == "https://example.com/criteria"
    assert payload["criteria"]["narrative"] == "Complete the Design Thinking path."


def test_learning_assertion_payload_hashes_recipient_and_points_to_award():
    payload = build_learning_assertion_payload(
        _request(),
        _org(),
        _badge(),
        _award(),
        _user(),
        _org_config(),
    )

    assert payload["type"] == "Assertion"
    assert payload["id"].endswith("/badge-awards/assertion/award_123456789012")
    assert payload["recipient"]["hashed"] is True
    assert payload["recipient"]["identity"].startswith("sha256$")
    assert payload["evidence"][0]["narrative"] == "Completed every required activity."

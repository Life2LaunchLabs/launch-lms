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
from src.services.learning import (
    _grade_answer,
    build_learning_assertion_payload,
    build_learning_badge_class_payload,
)


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

from starlette.requests import Request

from src.db.learning import (
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningBadgeCreate,
    LearningBadgeStatus,
    LearningPath,
    LearningPage,
    LearningPageType,
)
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.users import User
from fastapi import HTTPException
import pytest

from src.services.learning import (
    LAUNCH_READY_ACTIVITY_UUIDS,
    LAUNCH_READY_DEFAULT_IMAGES,
    _apply_learning_variables_to_user,
    _extract_learning_variables,
    _grade_answer,
    _validate_page_payload,
    _validate_variable_key,
    build_learning_assertion_payload,
    build_learning_badge_class_payload,
    create_badge,
)
from src.services import learning as learning_service
from src.services.learning_page_convert import (
    convert_legacy_page,
    find_question_block,
    link_variant_sources_to_question_blocks,
    question_block,
    text_block,
    paragraph_node,
)


class _FakeSession:
    def __init__(self):
        self.added = []

    def add(self, item):
        self.added.append(item)


class _BadgeCreateSession:
    def __init__(self, fail_commit=False):
        self.added = []
        self.commit_count = 0
        self.rollback_count = 0
        self.fail_commit = fail_commit

    def add(self, item):
        self.added.append(item)

    def flush(self):
        badge = next(item for item in self.added if isinstance(item, LearningBadge))
        badge.id = 42

    def commit(self):
        self.commit_count += 1
        if self.fail_commit:
            raise RuntimeError("path insert failed")

    def refresh(self, item):
        return None

    def rollback(self):
        self.rollback_count += 1


@pytest.mark.asyncio
async def test_create_badge_commits_badge_and_default_path_together(monkeypatch):
    monkeypatch.setattr(learning_service, "_require_org_admin", lambda *_args: None)
    session = _BadgeCreateSession()

    result = await create_badge(
        _request(),
        LearningBadgeCreate(org_id=1, collection_id=7, name="Demo badge"),
        object(),
        session,
    )

    badge = next(item for item in session.added if isinstance(item, LearningBadge))
    path = next(item for item in session.added if isinstance(item, LearningPath))
    assert session.commit_count == 1
    assert path.badge_id == badge.id == 42
    assert result.id == 42


@pytest.mark.asyncio
async def test_create_badge_rolls_back_when_default_path_cannot_be_committed(monkeypatch):
    monkeypatch.setattr(learning_service, "_require_org_admin", lambda *_args: None)
    session = _BadgeCreateSession(fail_commit=True)

    with pytest.raises(RuntimeError, match="path insert failed"):
        await create_badge(
            _request(),
            LearningBadgeCreate(org_id=1, collection_id=7, name="Demo badge"),
            object(),
            session,
        )

    assert session.commit_count == 1
    assert session.rollback_count == 1


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
        status=LearningBadgeStatus.PUBLISHED,
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


def test_launch_ready_activity_set_excludes_theme_customization():
    assert "theme" not in LAUNCH_READY_ACTIVITY_UUIDS
    assert "/images/launch-ready/theme.png" not in LAUNCH_READY_DEFAULT_IMAGES.values()
    assert list(LAUNCH_READY_ACTIVITY_UUIDS) == [
        "identity",
        "profile",
        "journey",
        "work",
        "traits",
        "links",
        "badges",
        "launch",
    ]


def _standard_page(page_uuid: str, question: dict | None = None, **overrides) -> LearningPage:
    blocks = list(overrides.pop("blocks", []))
    if question:
        blocks.append(question)
    return LearningPage(
        id=overrides.pop("id", 1),
        activity_id=1,
        badge_id=10,
        org_id=1,
        page_uuid=page_uuid,
        page_type=LearningPageType.STANDARD,
        title=overrides.pop("title", "Page"),
        content={"version": 2, "blocks": blocks},
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
        **overrides,
    )


def _mcq(options: list[dict] | None = None, block_id: str = "blk_q") -> dict:
    return question_block("multiple_choice", {"options": options or []}, block_id=block_id)


def _text_question(inputs: list[dict] | None = None, block_id: str = "blk_q") -> dict:
    return question_block("text_input", {"inputs": inputs or []}, block_id=block_id)


def _image_question(block_id: str = "blk_q") -> dict:
    return question_block("image_upload", {"label": "Upload image"}, block_id=block_id)


def test_multiple_choice_grading_uses_correct_option_ids():
    page = _standard_page(
        "learning_page_123",
        question=_mcq(),
        scoring={"correct_option_ids": ["b"]},
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"option_id": "b"})

    assert is_correct is True
    assert score == 1.0
    assert feedback_key == "b"
    assert result["page_uuid"] == "learning_page_123"


def test_multiple_choice_grading_requires_exact_multi_select_match():
    page = _standard_page(
        "learning_page_multi",
        question=_mcq([{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}]),
        completion={"min_selections": 2, "max_selections": 2},
        scoring={"mode": "points", "points": 5, "correct_option_ids": ["a", "c"], "score_policy": "exact_match"},
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"option_ids": ["c", "a"]})

    assert is_correct is True
    assert score == 5
    assert feedback_key == "correct"
    assert result["option_ids"] == ["c", "a"]


def test_multiple_choice_grading_rejects_too_few_selections():
    page = _standard_page(
        "learning_page_multi",
        question=_mcq([{"id": "a", "text": "A"}, {"id": "b", "text": "B"}]),
        completion={"min_selections": 2, "max_selections": 2},
        scoring={"mode": "points", "points": 1, "correct_option_ids": ["a", "b"]},
    )

    try:
        _grade_answer(page, {"option_ids": ["a"]})
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected invalid selection count")


def test_grading_page_without_question_block_returns_neutral_result():
    page = _standard_page("learning_page_plain", blocks=[text_block(paragraph_node("Just info"))])

    is_correct, score, feedback_key, result = _grade_answer(page, {"option_id": "a"})

    assert is_correct is None
    assert score is None
    assert feedback_key is None
    assert result == {"page_uuid": "learning_page_plain"}


def test_text_input_grading_keeps_history_ready_result_payload():
    page = _standard_page(
        "learning_page_456",
        question=_text_question(),
        scoring={"accepted_answers": ["empathy"]},
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"text": " Empathy "})

    assert is_correct is True
    assert score == 1.0
    assert feedback_key == "correct"
    assert result["text"] == "Empathy"


def test_text_input_completion_mode_awards_points_when_limits_pass():
    page = _standard_page(
        "learning_page_text",
        question=_text_question([{"id": "summary", "label": "Summary"}]),
        completion={"inputs": {"summary": {"required": True, "min_words": 2, "max_words": 4}}},
        scoring={"mode": "completion", "points": 3},
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"inputs": {"summary": {"text": "Good response"}}})

    assert is_correct is True
    assert score == 3
    assert feedback_key == "correct"
    assert result["inputs"]["summary"]["word_count"] == 2


def test_text_input_manual_mode_returns_pending_without_score():
    page = _standard_page(
        "learning_page_manual",
        question=_text_question([{"id": "reflection", "label": "Reflection"}]),
        completion={"inputs": {"reflection": {"required": True, "min_words": 1}}},
        scoring={"mode": "manual", "points": 10},
    )

    is_correct, score, feedback_key, result = _grade_answer(page, {"inputs": {"reflection": {"text": "Thoughtful"}}})

    assert is_correct is None
    assert score is None
    assert feedback_key == "pending"
    assert result["grading_status"] == "pending"


def test_text_input_rejects_word_limit_violation():
    page = _standard_page(
        "learning_page_text",
        question=_text_question([{"id": "summary", "label": "Summary"}]),
        completion={"inputs": {"summary": {"required": True, "min_words": 3}}},
        scoring={"mode": "completion", "points": 1},
    )

    try:
        _grade_answer(page, {"inputs": {"summary": {"text": "Too short"}}})
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected word limit validation")


def test_text_input_variables_extract_from_configured_inputs():
    page = _standard_page(
        "learning_page_variables",
        question=_text_question([{"id": "first_name"}, {"id": "goal"}]),
        completion={
            "variable_bindings": {
                "inputs": {
                    "first_name": {"target": "user.first_name"},
                    "goal": {"target": "user.details.variables.goal"},
                }
            }
        },
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
        {"target": "user.first_name", "value": "Ada", "source": {"page_uuid": "learning_page_variables", "block_id": "blk_q", "input_id": "first_name"}},
        {"target": "user.details.variables.goal", "value": "Build a portfolio", "source": {"page_uuid": "learning_page_variables", "block_id": "blk_q", "input_id": "goal"}},
    ]


def test_image_input_variables_extract_as_image_values():
    page = _standard_page(
        "learning_page_image_variables",
        question=_image_question(),
        completion={
            "required": True,
            "variable_bindings": {
                "image": {"target": "user.details.variables.portfolio_photo"},
            },
        },
    )

    variables = _extract_learning_variables(
        page,
        {
            "url": "/content/orgs/org_123/learning_responses/page/user/photo.png",
            "value_type": "image",
        },
    )

    assert variables == [
        {
            "target": "user.details.variables.portfolio_photo",
            "value": "/content/orgs/org_123/learning_responses/page/user/photo.png",
            "value_type": "image",
            "source": {"page_uuid": "learning_page_image_variables", "block_id": "blk_q"},
        }
    ]


def test_mcq_variables_extract_configured_option_values():
    page = _standard_page(
        "learning_page_goal",
        question=_mcq([{"id": "employment", "text": "Employment"}]),
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
    )

    variables = _extract_learning_variables(page, {"option_ids": ["employment"]})

    assert {item["target"] for item in variables} == {
        "user.profile.onboarding.next_step",
        "user.details.onboarding.next_step",
    }
    assert all(item["value"] == "employment" for item in variables)


def test_mcq_variables_extract_selected_option_text_as_list():
    page = _standard_page(
        "learning_page_interests",
        question=_mcq([
            {"id": "design", "text": "Design"},
            {"id": "code", "text": "Code"},
            {"id": "sales", "text": "Sales"},
        ]),
        completion={
            "variable_bindings": {
                "options_value_mode": "selected_text_list",
                "options": {
                    "design": [{"target": "user.details.variables.interests"}],
                    "code": [{"target": "user.details.variables.interests"}],
                    "sales": [{"target": "user.details.variables.interests"}],
                },
            }
        },
    )

    variables = _extract_learning_variables(page, {"option_ids": ["design", "code"]})

    assert variables == [
        {
            "target": "user.details.variables.interests",
            "value": ["Design", "Code"],
            "source": {"page_uuid": "learning_page_interests", "block_id": "blk_q", "option_ids": ["design", "code"]},
        }
    ]


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


def test_learning_variables_do_not_cross_image_and_text_targets():
    user = _user()
    user.details = {}
    session = _FakeSession()

    applied, skipped = _apply_learning_variables_to_user(
        session,
        user,
        [
            {"target": "user.avatar_image", "value": "/content/orgs/org_123/photo.png", "value_type": "image"},
            {"target": "user.first_name", "value": "/content/orgs/org_123/not_text.png", "value_type": "image"},
            {"target": "user.avatar_image", "value": "Grace", "value_type": "text"},
        ],
    )

    assert user.avatar_image == "/content/orgs/org_123/photo.png"
    assert user.first_name == "Ada"
    assert len(applied) == 1
    assert len(skipped) == 2


def test_page_validation_accepts_multiple_question_blocks():
    content = {"version": 2, "blocks": [_mcq(block_id="blk_1"), _text_question(block_id="blk_2")]}

    _validate_page_payload(LearningPageType.STANDARD, content)


def test_multi_question_page_grades_each_block():
    mcq = _mcq([{"id": "a", "text": "A"}, {"id": "b", "text": "B"}], block_id="blk_mcq")
    mcq["scoring"] = {"mode": "points", "points": 2, "correct_option_ids": ["b"]}
    mcq["completion"] = {"min_selections": 1, "max_selections": 1}
    text = _text_question([{"id": "summary", "label": "Summary"}], block_id="blk_text")
    text["scoring"] = {"mode": "completion", "points": 3}
    text["completion"] = {"inputs": {"summary": {"required": True, "min_words": 1}}}
    page = _standard_page("learning_page_multi_q", blocks=[mcq, text])

    is_correct, score, feedback_key, result = _grade_answer(page, {
        "questions": {
            "blk_mcq": {"option_ids": ["b"]},
            "blk_text": {"inputs": {"summary": {"text": "Looks good"}}},
        },
    })

    assert is_correct is True
    assert score == 5
    assert feedback_key == "correct"
    assert result["max_score"] == 5
    assert result["questions"]["blk_mcq"]["is_correct"] is True
    assert result["questions"]["blk_text"]["inputs"]["summary"]["text"] == "Looks good"


def test_multi_question_page_pends_when_any_block_is_manual():
    mcq = _mcq([{"id": "a", "text": "A"}, {"id": "b", "text": "B"}], block_id="blk_mcq")
    mcq["scoring"] = {"mode": "points", "points": 2, "correct_option_ids": ["b"]}
    mcq["completion"] = {"min_selections": 1, "max_selections": 1}
    text = _text_question([{"id": "reflection", "label": "Reflection"}], block_id="blk_text")
    text["scoring"] = {"mode": "manual", "points": 10}
    text["completion"] = {"inputs": {"reflection": {"required": True, "min_words": 1}}}
    page = _standard_page("learning_page_multi_manual", blocks=[mcq, text])

    is_correct, score, feedback_key, result = _grade_answer(page, {
        "questions": {
            "blk_mcq": {"option_ids": ["b"]},
            "blk_text": {"inputs": {"reflection": {"text": "Thoughtful"}}},
        },
    })

    assert is_correct is None
    assert score is None
    assert feedback_key == "pending"
    assert result["grading_status"] == "pending"


def test_multi_question_variables_extract_per_block_bindings():
    mcq = _mcq([{"id": "visual", "text": "Visual"}], block_id="blk_mcq")
    mcq["completion"] = {
        "min_selections": 1,
        "max_selections": 1,
        "variable_bindings": {"options": {"visual": [{"target": "user.details.variables.learning_style", "value": "visual"}]}},
    }
    text = _text_question([{"id": "goal"}], block_id="blk_text")
    text["scoring"] = {"mode": "completion", "points": 1}
    text["completion"] = {
        "inputs": {"goal": {"required": True, "min_words": 1}},
        "variable_bindings": {"inputs": {"goal": {"target": "user.details.variables.goal"}}},
    }
    page = _standard_page("learning_page_multi_vars", blocks=[mcq, text])

    _is_correct, _score, _feedback, result = _grade_answer(page, {
        "questions": {
            "blk_mcq": {"option_ids": ["visual"]},
            "blk_text": {"inputs": {"goal": {"text": "Build things"}}},
        },
    })
    variables = _extract_learning_variables(page, result)

    assert {item["target"]: item["value"] for item in variables} == {
        "user.details.variables.learning_style": "visual",
        "user.details.variables.goal": "Build things",
    }


def test_page_validation_rejects_variants_with_question_block():
    content = {
        "version": 2,
        "blocks": [_mcq()],
        "variants": {
            "source": {"page_uuid": "learning_page_src"},
            "overrides": {"option_a": {"blocks": []}},
        },
    }

    try:
        _validate_page_payload(LearningPageType.STANDARD, content)
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected variants/question mutual exclusion")


def test_page_validation_rejects_variants_without_source():
    content = {
        "version": 2,
        "blocks": [text_block(paragraph_node("Default"))],
        "variants": {"overrides": {"option_a": {"blocks": []}}},
    }

    try:
        _validate_page_payload(LearningPageType.STANDARD, content)
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected variants source requirement")


def test_page_validation_rejects_duplicate_block_ids():
    content = {"version": 2, "blocks": [text_block(paragraph_node("a"), block_id="blk_dup"), text_block(paragraph_node("b"), block_id="blk_dup")]}

    try:
        _validate_page_payload(LearningPageType.STANDARD, content)
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected unique block id validation")


def test_page_validation_rejects_duplicate_block_ids_across_variants():
    content = {
        "version": 2,
        "blocks": [text_block(paragraph_node("Default"), block_id="blk_dup")],
        "variants": {
            "source": {"page_uuid": "learning_page_src", "block_id": "blk_q"},
            "overrides": {
                "option_a": {"blocks": [text_block(paragraph_node("Variant"), block_id="blk_dup")]},
            },
        },
    }

    try:
        _validate_page_payload(LearningPageType.STANDARD, content)
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected page-wide unique block id validation")


def test_page_validation_accepts_valid_variants_page():
    content = {
        "version": 2,
        "blocks": [text_block(paragraph_node("Default"))],
        "variants": {
            "source": {"page_uuid": "learning_page_src", "block_id": "blk_q"},
            "overrides": {
                "option_a": {"blocks": [text_block(paragraph_node("A path"))]},
                "correct": {"blocks": [text_block(paragraph_node("Nice!"))]},
            },
        },
    }

    _validate_page_payload(LearningPageType.STANDARD, content)


def test_variable_key_validation_normalizes_and_rejects_bad_segments():
    assert _validate_variable_key("Personality.Traits.Learning_Style") == "personality.traits.learning_style"

    for bad_key in ["", "personality..traits", "user.password", "1leading", "has-dash"]:
        try:
            _validate_variable_key(bad_key)
        except HTTPException as error:
            assert error.status_code == 422
        else:
            raise AssertionError(f"Expected key rejection for {bad_key!r}")


def test_convert_legacy_mcq_page_builds_question_block():
    page_type, content = convert_legacy_page(
        "multiple_choice",
        {
            "rich_text": {
                "type": "doc",
                "content": [
                    {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Which fruit?"}]},
                    {"type": "learningQuestion", "attrs": {"locked": True}},
                ],
            },
            "options": [{"id": "a", "text": "Apples"}, {"id": "b", "text": "Bananas"}],
        },
    )

    assert page_type == "standard"
    assert content["version"] == 2
    assert [block["type"] for block in content["blocks"]] == ["text", "question"]
    question = find_question_block(content)
    assert question["kind"] == "multiple_choice"
    assert [option["id"] for option in question["content"]["options"]] == ["a", "b"]


def test_convert_legacy_uppercase_sqlalchemy_enum_name():
    page_type, content = convert_legacy_page(
        "INFO",
        {"heading": "Hello", "body": "Legacy enum storage"},
    )

    assert page_type == "standard"
    assert content["version"] == 2
    assert [block["type"] for block in content["blocks"]] == ["text", "text"]


def test_convert_legacy_question_response_builds_variants():
    page_type, content = convert_legacy_page(
        "question_response",
        {
            "linked_page_uuid": "learning_page_src",
            "rich_text": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Default response"}]}]},
            "response_variants": {
                "option_a": {"enabled": True, "rich_text": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Chose A"}]}]}},
                "option_b": {"enabled": False, "rich_text": {"type": "doc", "content": [{"type": "paragraph"}]}},
                "correct": {"enabled": True, "rich_text": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Well done"}]}]}},
            },
        },
    )

    assert page_type == "standard"
    assert content["variants"]["source"]["page_uuid"] == "learning_page_src"
    assert set(content["variants"]["overrides"].keys()) == {"option_a", "correct"}

    pages = [
        {"page_uuid": "learning_page_src", "content": {"version": 2, "blocks": [_mcq(block_id="blk_src_q")]}},
        {"page_uuid": "learning_page_resp", "content": content},
    ]
    link_variant_sources_to_question_blocks(pages)
    assert content["variants"]["source"]["block_id"] == "blk_src_q"


def test_convert_video_page_passes_through():
    page_type, content = convert_legacy_page("video", {"video_url": "https://youtu.be/x", "allow_scrubbing": True})

    assert page_type == "video"
    assert content == {"video_url": "https://youtu.be/x", "allow_scrubbing": True}


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


def test_standard_page_accepts_bound_image_and_internal_page_button():
    _validate_page_payload(LearningPageType.STANDARD, {"version": 2, "blocks": [
        {"id": "image", "type": "image", "content": {"binding": {"source": "answer", "path": "learning_page_photo.answer.questions.photo.url"}}},
        {"id": "button", "type": "button", "content": {"label": "Change details", "destination_page_uuid": "learning_page_details"}},
        {"id": "preview", "type": "portfolio_preview", "content": {"variant": "journey_card", "bindings": {"title": {"source": "answer", "path": "learning_page_details.answer.questions.details.inputs.title.text"}}}},
    ]})


def test_standard_page_rejects_unsafe_display_binding_path():
    with pytest.raises(HTTPException, match="unsupported source or path"):
        _validate_page_payload(LearningPageType.STANDARD, {"version": 2, "blocks": [
            {"id": "image", "type": "image", "content": {"binding": {"source": "answer", "path": "../../private"}}},
        ]})

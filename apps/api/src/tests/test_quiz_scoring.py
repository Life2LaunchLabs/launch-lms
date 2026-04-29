import pytest

from src.services.courses.activities.quiz.scoring import compute_scores, match_result_option
from src.services.courses.activities.quiz.attempts import _get_active_scoring_vectors


def test_compute_scores_applies_slider_multiplier_per_vector() -> None:
    answers = [
        {
            "question_uuid": "question_1",
            "answer_json": {
                "type": "slider",
                "values": {
                    "slider_1": 0.5,
                },
            },
        }
    ]
    option_scores = {
        "slider_1": {
            "energy": 0.6,
            "focus": 0.9,
            "calm": 0.3,
        }
    }
    vectors = [
        {"key": "energy"},
        {"key": "focus"},
        {"key": "calm"},
    ]

    scores = compute_scores(answers, option_scores, text_scores={}, vectors=vectors)

    assert scores == {
        "energy": 0.3,
        "focus": 0.45,
        "calm": 0.15,
    }


def test_get_active_scoring_vectors_prefers_graded_vectors_for_graded_quizzes() -> None:
    details = {
        "quiz_mode": "graded",
        "scoring_vectors": [{"key": "legacy"}],
        "graded_scoring_vectors": [{"key": "correct"}],
    }

    assert _get_active_scoring_vectors(details, "graded") == [{"key": "correct"}]


def test_get_active_scoring_vectors_prefers_category_vectors_for_category_quizzes() -> None:
    details = {
        "quiz_mode": "categories",
        "scoring_vectors": [{"key": "legacy"}],
        "category_scoring_vectors": [{"key": "personality"}],
    }

    assert _get_active_scoring_vectors(details, "categories") == [{"key": "personality"}]


def test_compute_scores_applies_sort_assignments_per_card_category() -> None:
    answers = [
        {
            "question_uuid": "question_sort",
            "answer_json": {
                "type": "sort",
                "assignments": {
                    "card_1": "left",
                    "card_2": "right",
                },
            },
        }
    ]
    option_scores = {
        "card_1::left": {"correct": 1, "confidence": 0.4},
        "card_2::right": {"correct": 0, "confidence": 0.8},
    }
    vectors = [
        {"key": "correct"},
        {"key": "confidence"},
    ]

    scores = compute_scores(answers, option_scores, text_scores={}, vectors=vectors)

    assert scores == {
        "correct": 0.5,
        "confidence": pytest.approx(0.6),
    }


def test_match_result_option_prefers_low_target_for_zero_score() -> None:
    result = match_result_option(
        {"energy": 0.0},
        [
            {"uuid": "high", "scores": {"energy": 1.0}},
            {"uuid": "low", "scores": {"energy": 0.0}},
        ],
    )

    assert result is not None
    assert result["uuid"] == "low"


def test_match_result_option_prefers_false_binary_target_for_zero_score() -> None:
    result = match_result_option(
        {"correct": 0.0},
        [
            {"uuid": "true", "scores": {"correct": 1.0}},
            {"uuid": "false", "scores": {"correct": 0.0}},
        ],
    )

    assert result is not None
    assert result["uuid"] == "false"

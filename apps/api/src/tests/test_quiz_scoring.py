from src.services.courses.activities.quiz.scoring import compute_scores


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

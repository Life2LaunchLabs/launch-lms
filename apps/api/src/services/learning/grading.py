"""Grading answers and activity scoring."""

from sqlmodel import Session, select
from src.db.learning import (
    LearningActivity,
    LearningPage,
    LearningPageProgress,
    LearningRun,
)
from src.services.learning import answer_validation, lookups, run_navigation


def _normalize_question_answers(questions: list[dict], answer: dict) -> dict[str, dict]:
    """Split a page answer into per-question-block answers.

    New payloads carry `answer.questions[block_id]`; legacy payloads are the
    single question's answer at the top level.
    """
    raw = (answer or {}).get("questions")
    if isinstance(raw, dict):
        return {
            str(block_id): value if isinstance(value, dict) else {}
            for block_id, value in raw.items()
        }
    if len(questions) == 1:
        return {str(questions[0].get("id") or ""): answer or {}}
    return {}


def _grade_mcq_block(page: LearningPage, question: dict, answer: dict) -> dict:
    content = question.get("content") or {}
    selected = answer_validation._normalize_mcq_answer(answer or {})
    answer_validation._validate_mcq_answer(content, run_navigation._block_completion(page, question), selected, answer)
    scoring = run_navigation._block_scoring(page, question)
    correct_options = {
        str(value)
        for value in scoring.get("correct_option_ids") or []
    }
    if scoring.get("mode") == "completion":
        # Counts when answered: no right answer.
        is_correct = True
        score_fraction = 1.0
    elif not correct_options:
        is_correct = None
        score_fraction = None
    else:
        selected_options = set(selected)
        true_positives = len(selected_options & correct_options)
        false_positives = len(selected_options - correct_options)
        is_correct = selected_options == correct_options
        if scoring.get("partial_credit") is False:
            score_fraction = 1.0 if is_correct else 0.0
        else:
            # Select-all-that-apply partial credit: omitted correct answers earn
            # nothing, while incorrect selections cancel an earned correct choice.
            score_fraction = max(
                0.0, min(1.0, (true_positives - false_positives) / len(correct_options))
            )
    points = answer_validation._as_float(scoring.get("points"), 1.0)
    score = points * score_fraction if score_fraction is not None else None
    labels = {str(option.get("id")): str(option.get("text") or option.get("label") or option.get("id")) for option in content.get("options") or [] if isinstance(option, dict)}
    return {
        "kind": "multiple_choice",
        "selected": selected,
        "option_ids": selected,
        # What they picked, in words, so later pages can show it.
        "selected_labels": [labels.get(str(option_id), str(option_id)) for option_id in selected],
        "correct_option_ids": sorted(correct_options),
        "score_policy": "select_all",
        "is_correct": is_correct,
        "score": score,
        "points": points,
        "max_score": points,
        "grading_status": "graded",
        **_feedback(scoring, is_correct),
    }


def _feedback(scoring: dict, is_correct: bool | None) -> dict:
    """The author's message for a right or wrong answer, shown to the learner after they answer."""
    feedback = scoring.get("feedback")
    if not isinstance(feedback, dict) or is_correct is None:
        return {}
    message = str(feedback.get("correct" if is_correct else "incorrect") or "").strip()
    return {"feedback_message": message} if message else {}


def _grade_text_block(page: LearningPage, question: dict, answer: dict) -> dict:
    content = question.get("content") or {}
    completion = run_navigation._block_completion(page, question)
    inputs = answer_validation._validate_text_answer(
        content, completion, answer_validation._normalize_text_answer(content, answer or {})
    )
    scoring = run_navigation._block_scoring(page, question)
    mode = scoring.get("mode") or (
        "accepted_answers" if scoring.get("accepted_answers") else "off"
    )
    completion_inputs = completion.get("inputs") or {}
    per_input_points = [
        answer_validation._as_float((completion_inputs.get(input_id) or {}).get("points"), 0.0)
        for input_id in inputs.keys()
        if (completion_inputs.get(input_id) or {}).get("points") is not None
    ]
    points = (
        sum(per_input_points)
        if per_input_points
        else answer_validation._as_float(scoring.get("points"), 1.0)
    )
    first_text = next((item.get("text", "") for item in inputs.values()), "")
    base = {
        "kind": "text_input",
        "inputs": inputs,
        "text": first_text,
        "points": points,
        "max_score": points,
    }

    if mode == "manual":
        return {**base, "is_correct": None, "score": None, "grading_status": "pending"}
    if mode == "completion":
        return {**base, "is_correct": True, "score": points, "grading_status": "graded"}

    expected = [
        str(value).strip().lower() for value in scoring.get("accepted_answers", [])
    ]
    if mode == "accepted_answers" and expected:
        typed = first_text.strip().lower()
        # ``match: contains`` is right when the answer includes any of the words.
        is_correct = any(word and word in typed for word in expected) if scoring.get("match") == "contains" else typed in expected
        return {
            **base,
            "is_correct": is_correct,
            "score": points if is_correct else 0.0,
            "grading_status": "graded",
            **_feedback(scoring, is_correct),
        }

    return {**base, "is_correct": None, "score": None, "grading_status": "not_required"}


def _grade_image_block(page: LearningPage, question: dict, answer: dict) -> dict:
    completion = run_navigation._block_completion(page, question)
    image = answer_validation._validate_image_answer(completion, answer or {})
    scoring = run_navigation._block_scoring(page, question)
    mode = scoring.get("mode") or "manual"
    points = answer_validation._as_float(scoring.get("points"), 1.0)
    base = {
        "kind": "image_upload",
        **image,
        "points": points,
        "max_score": points,
    }
    if mode == "manual":
        return {**base, "is_correct": None, "score": None, "grading_status": "pending"}
    if mode == "completion":
        return {**base, "is_correct": True, "score": points, "grading_status": "graded"}
    return {**base, "is_correct": None, "score": None, "grading_status": "not_required"}


def _grade_answer(
    page: LearningPage, answer: dict
) -> tuple[bool | None, float | None, str | None, dict]:
    questions = run_navigation._question_blocks(page)
    if not questions:
        return None, None, None, {"page_uuid": page.page_uuid}

    answers = _normalize_question_answers(questions, answer)
    sub_results: dict[str, dict] = {}
    for question in questions:
        block_id = str(question.get("id") or "")
        sub_answer = answers.get(block_id) or {}
        if question.get("kind") in {"multiple_choice", "categorized_multi_select"}:
            sub_results[block_id] = _grade_mcq_block(page, question, sub_answer)
        elif question.get("kind") == "text_input":
            sub_results[block_id] = _grade_text_block(page, question, sub_answer)
        elif question.get("kind") == "image_upload":
            sub_results[block_id] = _grade_image_block(page, question, sub_answer)

    subs = list(sub_results.values())
    if not subs:
        return None, None, None, {"page_uuid": page.page_uuid}

    total_points = sum(answer_validation._as_float(sub.get("points"), 0.0) for sub in subs)
    pending = any(sub.get("grading_status") == "pending" for sub in subs)
    correctness = [
        sub.get("is_correct") for sub in subs if sub.get("is_correct") is not None
    ]
    is_correct = None if pending or not correctness else all(correctness)
    scores = [sub.get("score") for sub in subs]
    score = (
        None
        if pending or all(value is None for value in scores)
        else sum(answer_validation._as_float(value, 0.0) for value in scores if value is not None)
    )
    grading_status = (
        "pending"
        if pending
        else (
            "graded"
            if any(sub.get("grading_status") == "graded" for sub in subs)
            else "not_required"
        )
    )

    result: dict = {
        "page_uuid": page.page_uuid,
        "questions": sub_results,
        "points": total_points,
        "max_score": total_points,
        "grading_status": grading_status,
    }

    if len(subs) == 1:
        only = subs[0]
        result = {
            **{
                key: value
                for key, value in only.items()
                if key not in ("kind", "is_correct", "score")
            },
            **result,
        }
        if pending:
            feedback_key = "pending"
        elif only.get("kind") in {"multiple_choice", "categorized_multi_select"}:
            selected = only.get("option_ids") or []
            feedback_key = (
                selected[0]
                if len(selected) == 1
                else ("correct" if is_correct else "incorrect")
            )
        else:
            feedback_key = (
                "correct"
                if is_correct is True
                else "incorrect"
                if is_correct is False
                else "complete"
            )
        return is_correct, score, feedback_key, result

    feedback_key = (
        "pending"
        if pending
        else "correct"
        if is_correct is True
        else "incorrect"
        if is_correct is False
        else "complete"
    )
    return is_correct, score, feedback_key, result


def _activity_grading_settings(activity: LearningActivity) -> dict:
    settings = activity.settings or {}
    grading = settings.get("grading") or {}
    if not isinstance(grading, dict):
        grading = {}
    return {
        "minimum_score_percent": max(
            0.0, min(100.0, answer_validation._as_float(grading.get("minimum_score_percent"), 70.0))
        ),
        "success_message": str(grading.get("success_message") or "Activity passed."),
        "failure_message": str(
            grading.get("failure_message")
            or "You need a higher score to complete this activity."
        ),
        # ``complete``: done once answered; ``pass``: the pass mark counts (when there are points).
        "finish": "complete" if grading.get("finish") == "complete" else "pass",
        "if_not_passed": grading.get("if_not_passed") if grading.get("if_not_passed") in IF_NOT_PASSED else "try_again",
        "show_score": grading.get("show_score") is not False,
    }


IF_NOT_PASSED = ("try_again", "redo_missed", "staff_decide")


def _activity_score_summary(
    db_session: Session, run: LearningRun, activity: LearningActivity
) -> dict:
    pages = db_session.exec(
        select(LearningPage).where(LearningPage.activity_id == activity.id)
    ).all()
    latest_attempts = lookups._latest_attempts(db_session, run.id or 0)
    earned = 0.0
    possible = 0.0
    pending_manual_grades = 0

    for page in pages:
        questions = run_navigation._question_blocks(page)
        if not questions:
            continue
        attempt = latest_attempts.get(page.id or 0)
        configured_points = sum(
            _question_block_points(page, question) for question in questions
        )
        if configured_points <= 0:
            continue
        possible += configured_points
        if not attempt:
            continue
        if (attempt.result or {}).get("grading_status") == "pending":
            pending_manual_grades += 1
            continue
        earned += answer_validation._as_float(attempt.score, 0.0)

    percent = round((earned / possible) * 100, 1) if possible > 0 else 100.0
    return {
        "score": earned,
        "max_score": possible,
        "score_percent": percent,
        "pending_manual_grades": pending_manual_grades,
    }


def _question_block_points(page: LearningPage, question: dict) -> float:
    scoring = run_navigation._block_scoring(page, question)
    if scoring.get("mode") == "off":
        return 0.0
    points = answer_validation._as_float(scoring.get("points"), 1.0)
    configured = bool(
        scoring.get("mode")
        or scoring.get("points") is not None
        or scoring.get("correct_option_ids")
        or scoring.get("accepted_answers")
    )
    if question.get("kind") == "text_input":
        completion_inputs = run_navigation._block_completion(page, question).get("inputs") or {}
        input_points = [
            answer_validation._as_float((rules or {}).get("points"), 0.0)
            for rules in completion_inputs.values()
            if isinstance(rules, dict) and (rules or {}).get("points") is not None
        ]
        if input_points:
            points = sum(input_points)
            configured = True
    if not configured:
        return 0.0
    return max(0.0, points)


def _activity_meets_completion_rules(
    db_session: Session, run: LearningRun, activity: LearningActivity
) -> tuple[bool, dict]:
    summary = _activity_score_summary(db_session, run, activity)
    settings = _activity_grading_settings(activity)
    grading = {
        **settings,
        "mode": "pass_fail" if summary["max_score"] > 0 and settings["finish"] == "pass" else "completion",
    }
    if summary["pending_manual_grades"] > 0:
        return False, {
            **summary,
            "grading": grading,
            "passed": False,
            "reason": "pending_manual_grades",
        }
    if grading["mode"] == "completion":
        return True, {**summary, "grading": grading, "passed": True}
    passed = summary["score_percent"] >= grading["minimum_score_percent"]
    if passed:
        return True, {**summary, "grading": grading, "passed": True}
    if (run.data or {}).get("staff_decision") == "passed":
        return True, {**summary, "grading": grading, "passed": True, "passed_by_staff": True}
    policy = grading["if_not_passed"]
    return False, {
        **summary,
        "grading": grading,
        "passed": False,
        "if_not_passed": policy,
        "missed_page_uuids": _missed_page_uuids(db_session, run, activity),
        **({"awaiting_staff_decision": True} if policy == "staff_decide" else {}),
    }


def _missed_page_uuids(db_session: Session, run: LearningRun, activity: LearningActivity) -> list[str]:
    """Pages whose latest answer earned less than full marks, in page order."""
    pages = db_session.exec(
        select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)  # type: ignore[arg-type]
    ).all()
    latest = lookups._latest_attempts(db_session, run.id or 0)
    missed = []
    for page in pages:
        possible = sum(_question_block_points(page, question) for question in run_navigation._question_blocks(page))
        attempt = latest.get(page.id or 0)
        if possible > 0 and attempt and answer_validation._as_float(attempt.score, 0.0) < possible:
            missed.append(page.page_uuid)
    return missed


def _has_pending_required_manual_grades(db_session: Session, run: LearningRun) -> bool:
    required_pages = db_session.exec(select(LearningPage).where(
        LearningPage.activity_id == run.activity_id, LearningPage.required == True,  # noqa: E712
    )).all()
    manual_pages = [
        page
        for page in required_pages
        if any(
            question.get("kind") in ("text_input", "image_upload")
            and run_navigation._block_scoring(page, question).get("mode") == "manual"
            for question in run_navigation._question_blocks(page)
        )
    ]
    if not manual_pages:
        return False

    latest_attempts_by_page_id = lookups._latest_attempts(db_session, run.id or 0)
    for page in manual_pages:
        progress = db_session.exec(
            select(LearningPageProgress).where(
                LearningPageProgress.run_id == run.id,
                LearningPageProgress.page_id == page.id,
                LearningPageProgress.complete == True,
            )
        ).first()
        if not progress:
            continue
        attempt = latest_attempts_by_page_id.get(page.id or 0)
        if not attempt or (attempt.result or {}).get("grading_status") != "graded":
            return True
    return False

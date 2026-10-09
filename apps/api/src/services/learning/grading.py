"""Grading answers, activity scoring and award issuing."""

from copy import deepcopy
from datetime import datetime
from uuid import uuid4
from fastapi import Request
from sqlmodel import Session, select
from src.db.learning import (
    BadgeIssuerLearnerLink,
    BadgeIssuerLearnerLinkStatus,
    LearningActivity,
    LearningActivityRun,
    LearningAwardSource,
    LearningBadge,
    LearningBadgeAward,
    LearningPage,
    LearningPageProgress,
    LearningRun,
    LearningRunStatus,
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
    if not correct_options:
        is_correct = None
        score_fraction = None
    else:
        selected_options = set(selected)
        true_positives = len(selected_options & correct_options)
        false_positives = len(selected_options - correct_options)
        is_correct = selected_options == correct_options
        # Select-all-that-apply partial credit: omitted correct answers earn
        # nothing, while incorrect selections cancel an earned correct choice.
        score_fraction = max(
            0.0, min(1.0, (true_positives - false_positives) / len(correct_options))
        )
    points = answer_validation._as_float(scoring.get("points"), 1.0)
    score = points * score_fraction if score_fraction is not None else None
    return {
        "kind": "multiple_choice",
        "selected": selected,
        "option_ids": selected,
        "correct_option_ids": sorted(correct_options),
        "score_policy": "select_all",
        "is_correct": is_correct,
        "score": score,
        "points": points,
        "max_score": points,
        "grading_status": "graded",
    }


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
        is_correct = first_text.lower() in expected
        return {
            **base,
            "is_correct": is_correct,
            "score": points if is_correct else 0.0,
            "grading_status": "graded",
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


def _ensure_activity_run(
    db_session: Session, run: LearningRun, activity_id: int
) -> LearningActivityRun:
    activity_run = db_session.exec(
        select(LearningActivityRun).where(
            LearningActivityRun.run_id == run.id,
            LearningActivityRun.activity_id == activity_id,
        )
    ).first()
    if activity_run:
        return activity_run
    activity = db_session.get(LearningActivity, activity_id)
    settings = deepcopy(activity.settings or {}) if activity else {}
    activity_run = LearningActivityRun(
        run_id=run.id or 0,
        activity_id=activity_id,
        status=LearningRunStatus.IN_PROGRESS,
        data={
            "definition": {
                "version": 1,
                "flow": settings.get("flow"),
                "outcomes": settings.get("outcomes"),
            }
        },
    )
    db_session.add(activity_run)
    db_session.commit()
    db_session.refresh(activity_run)
    return activity_run


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
    }


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
    grading = {
        **_activity_grading_settings(activity),
        "mode": "pass_fail" if summary["max_score"] > 0 else "completion",
    }
    if summary["pending_manual_grades"] > 0:
        return False, {
            **summary,
            "grading": grading,
            "passed": False,
            "reason": "pending_manual_grades",
        }
    if summary["max_score"] <= 0:
        return True, {**summary, "grading": grading, "passed": True}
    passed = summary["score_percent"] >= grading["minimum_score_percent"]
    return passed, {**summary, "grading": grading, "passed": passed}


def _has_pending_required_manual_grades(db_session: Session, run: LearningRun) -> bool:
    required_pages = db_session.exec(
        select(LearningPage).where(
            LearningPage.badge_id == run.badge_id,
            LearningPage.version_id == run.badge_version_id,
            LearningPage.required == True,
        )
    ).all()
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


def _issue_award_if_complete(
    request: Request, db_session: Session, run: LearningRun
) -> LearningBadgeAward | None:
    if run.user_id is None:
        return None
    badge = db_session.get(LearningBadge, run.badge_id)
    if badge and (badge.badge_metadata or {}).get("award_strategy") == "portfolio_checklist":
        return None
    required_activities = db_session.exec(
        select(LearningActivity).where(
            LearningActivity.path_id == run.path_id,
            LearningActivity.required == True,
        )
    ).all()
    if not required_activities:
        return None
    completed_activity_ids = {
        item.activity_id
        for item in db_session.exec(
            select(LearningActivityRun).where(
                LearningActivityRun.run_id == run.id,
                LearningActivityRun.status == LearningRunStatus.COMPLETED,
            )
        ).all()
    }
    if not all(
        (activity.id or 0) in completed_activity_ids for activity in required_activities
    ):
        return None
    if _has_pending_required_manual_grades(db_session, run):
        return None

    version = lookups._version_for_content(db_session, run.badge_version_id)
    major_version = int((version.semantic_version if version else "1.0.0").split(".")[0])
    award = db_session.exec(
        select(LearningBadgeAward).where(
            LearningBadgeAward.badge_id == run.badge_id,
            LearningBadgeAward.user_id == run.user_id,
            LearningBadgeAward.major_version == major_version,
        )
    ).first()
    if award:
        return award

    now = datetime.utcnow()
    award = LearningBadgeAward(
        award_uuid=f"award_{uuid4()}",
        badge_id=run.badge_id,
        badge_version_id=run.badge_version_id,
        major_version=major_version,
        run_id=run.id,
        org_id=run.org_id,
        issuing_org_id=run.issuing_org_id,
        user_id=run.user_id,
        source=LearningAwardSource.PATH_COMPLETION,
        issued_at=now,
        evidence={"run_uuid": run.run_uuid},
        creation_date=str(now),
        update_date=str(now),
    )
    run.status = LearningRunStatus.COMPLETED
    run.completed_at = now
    run.update_date = str(now)
    links = db_session.exec(select(BadgeIssuerLearnerLink).where(
        BadgeIssuerLearnerLink.badge_id == run.badge_id,
        BadgeIssuerLearnerLink.user_id == run.user_id,
        BadgeIssuerLearnerLink.status == BadgeIssuerLearnerLinkStatus.ACCEPTED,
    )).all()
    for link in links:
        link.status = BadgeIssuerLearnerLinkStatus.COMPLETED
        link.end_reason = "badge_completed"
        link.ended_at = now
        link.update_date = str(now)
        db_session.add(link)
    db_session.add(run)
    db_session.add(award)
    db_session.commit()
    db_session.refresh(award)
    return award

"""Activity responses belonging to an already-authorized learner plan objective."""

from sqlmodel import Session, select

from src.db.learning import LearningPage, LearningResponseAttempt, LearningRun
from src.services.learning_page_convert import iter_block_stacks


def _urls(value) -> list[str]:
    if isinstance(value, list):
        return [url for item in value for url in _urls(item)]
    if isinstance(value, dict):
        return [str(value["url"])] if value.get("url") else [url for item in value.values() for url in _urls(item)]
    return []


def activity_evidence(db: Session, objective, learner_id: int) -> list[dict]:
    if not objective.activity_id:
        return []
    runs = db.exec(select(LearningRun).where(
        LearningRun.plan_objective_id == objective.id, LearningRun.plan_id == objective.plan_id,
        LearningRun.user_id == learner_id,
    ).order_by(LearningRun.id)).all()
    rows = []
    for run in runs:
        attempts = db.exec(select(LearningResponseAttempt, LearningPage).join(
            LearningPage, LearningPage.id == LearningResponseAttempt.page_id,
        ).where(
            LearningResponseAttempt.run_id == run.id, LearningResponseAttempt.user_id == learner_id,
            LearningPage.activity_id == run.activity_id,
        ).order_by(LearningResponseAttempt.submitted_at, LearningResponseAttempt.id)).all()
        latest = {page.id: attempt.id for attempt, page in attempts}
        for attempt, page in attempts:
            questions = {str(block.get("id")): block for blocks in iter_block_stacks(page.content)
                         for block in blocks if block.get("type") == "question"}
            answers = (attempt.answer or {}).get("questions")
            if not isinstance(answers, dict):
                answers = {next(iter(questions), "response"): attempt.answer or {}}
            result = attempt.result or {}
            for key, answer in answers.items():
                question = questions.get(str(key), {})
                prompt = (question.get("content") or {}).get("prompt") or question.get("title") or key
                rows.append({
                    "Evidence field": f"{page.title} · {prompt}", "Evidence type": "Activity response",
                    "Evidence text": answer, "Evidence URL": "\n".join(dict.fromkeys(_urls(answer))),
                    "Evidence availability": "Recorded", "Activity run UUID": run.run_uuid,
                    "Activity attempt UUID": attempt.attempt_uuid,
                    "Current activity attempt": "Yes" if latest[page.id] == attempt.id else "No",
                    "Submitted at (UTC)": attempt.submitted_at.isoformat(),
                    "Activity grading status": result.get("grading_status", ""),
                    "Activity score": attempt.score, "Activity maximum score": result.get("max_score"),
                    "Activity graded by": (result.get("graded_by") or {}).get("staff_name", ""),
                    "Activity graded by user ID": result.get("graded_by_user_id"),
                    "Activity graded at (UTC)": attempt.graded_at.isoformat() if attempt.graded_at else "",
                    "Activity feedback": result.get("feedback", ""),
                })
    return rows

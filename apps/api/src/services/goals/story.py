"""A finished goal's story: what the learner did, told back as a short activity.

The writer turns the goal's steps, stages, decisions and words into slides (``GoalStory.slides``),
and the story is served as a generated activity built from those slides with the stat, quote,
chart and medal blocks. It is written the first time it is asked for after the goal finishes,
and again only when the goal changed since (a reopened goal finished again gets a new version).
Without a model, the opening and closing lines use fixed wording; the rest is the learner's own.

``goal_stats`` also feeds ``goal.stats.*`` to any activity run inside a goal.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
from dataclasses import replace
from datetime import date, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import DONE_STEP_STATUSES, Goal, GoalStage, GoalStatus, GoalStep, GoalStory, StepProgress
from src.db.users import PublicUser
from src.services.goals import access

logger = logging.getLogger(__name__)

CHART_WEEKS = 12
STORY_WRITER_INSTRUCTIONS = """You write two short lines for the story shown to a learner who just finished a goal.
The input is JSON: the goal, why it mattered to them, and what they did. Return only JSON:
{"open": "...", "close": "..."}
"open" (at most 90 characters) sets the scene, looking back at where they started.
"close" (at most 140 characters) is a warm send-off that names something real they did.
Speak to the learner as "you". No invented facts."""


def _value(item) -> str:
    return str(getattr(item, "value", item))


def _started(goal: Goal) -> date:
    if goal.start_date:
        return goal.start_date
    try:
        return datetime.fromisoformat(str(goal.creation_date)).date()
    except ValueError:
        return (goal.finished_at or datetime.utcnow()).date()


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def _done_steps(db: Session, goal: Goal) -> list[tuple[GoalStep, StepProgress]]:
    rows = db.exec(select(GoalStep, StepProgress).join(StepProgress, StepProgress.step_id == GoalStep.id).where(GoalStep.goal_id == goal.id)).all()  # type: ignore[arg-type]
    return [(step, progress) for step, progress in rows if _value(progress.status) in DONE_STEP_STATUSES]


def goal_stats(db: Session, goal: Goal, today: date | None = None) -> dict:
    """Numbers about a goal so far: steps done, weeks, decisions, stages and steps done each week."""
    start = _started(goal)
    end = goal.finished_at.date() if goal.finished_at else (today or date.today())
    weeks = max(1, math.ceil(((end - start).days + 1) / 7))
    done = _done_steps(db, goal)
    shown = min(weeks, CHART_WEEKS)
    first_week = start + timedelta(weeks=weeks - shown)
    weekly = [0] * shown
    for _step, progress in done:
        if progress.completed_at:
            index = (progress.completed_at.date() - first_week).days // 7
            if 0 <= index < shown:
                weekly[index] += 1
    stage_ids = {int(stage.id) for stage in db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id)).all()}  # type: ignore[arg-type]
    steps_by_stage: dict[int, int] = {}
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
        if step.stage_id in stage_ids:
            steps_by_stage[int(step.stage_id)] = steps_by_stage.get(int(step.stage_id), 0) + 1  # type: ignore[arg-type]
    done_by_stage: dict[int, int] = {}
    for step, _progress in done:
        if step.stage_id in stage_ids:
            done_by_stage[int(step.stage_id)] = done_by_stage.get(int(step.stage_id), 0) + 1  # type: ignore[arg-type]
    return {
        "steps_done": len(done),
        "weeks": weeks,
        "decisions": sum(1 for step, _progress in done if step.type == "decision"),
        "stages_done": sum(1 for stage_id, total in steps_by_stage.items() if total and done_by_stage.get(stage_id) == total),
        "weekly": weekly,
        "weekly_labels": [f"{day:%b} {day.day}" for day in (first_week + timedelta(weeks=index) for index in range(shown))],
    }


def goal_variables(db: Session, goal: Goal) -> dict:
    """Read-only ``goal.*`` values for activities run inside the goal."""
    stats = goal_stats(db, goal)
    return {
        "goal.title": goal.title, "goal.why": goal.description or "",
        **{f"goal.stats.{key}": value for key, value in stats.items() if key != "weekly_labels"},
    }


# Writing the story ------------------------------------------------------------------------

def _decisions(done: list[tuple[GoalStep, StepProgress]]) -> list[dict]:
    items = []
    for step, progress in done:
        if step.type != "decision":
            continue
        labels = {option.get("key"): option.get("label") for option in (step.config or {}).get("options") or [] if isinstance(option, dict)}
        submission = progress.submission or {}
        chosen = [str(labels.get(key) or key) for key in submission.get("choices") or []]
        other = str(submission.get("other") or "").strip()
        choice = ", ".join(chosen + ([other] if other else []))
        if choice:
            items.append({"question": (step.config or {}).get("question") or step.title, "choice": choice})
    return items[:3]


def _milestones(db: Session, goal: Goal) -> list[str]:
    stages = db.exec(select(GoalStage).where(GoalStage.goal_id == goal.id).order_by(GoalStage.position)).all()  # type: ignore[arg-type]
    return [stage.milestone or stage.title for stage in stages if (stage.milestone or stage.title) and stage.title != "Getting started"][:4]


def write_slides(db: Session, goal: Goal, words: dict | None = None) -> list[dict]:
    """The story as slides: data only, worded by ``words`` ({open, close}) or fixed lines."""
    from src.services.goals.badges import badge_summary

    words = words or {}
    stats = goal_stats(db, goal)
    done = _done_steps(db, goal)
    finish = goal.finish or {}
    weeks = _plural(stats["weeks"], "week")
    slides: list[dict] = [{"kind": "open", "title": goal.title, "line": words.get("open") or (f"{weeks} ago, you set out to do this." if stats["weeks"] > 1 else "Not long ago, you set out to do this.")}]
    numbers = [{"value": stats["steps_done"], "label": "steps done" if stats["steps_done"] != 1 else "step done"}, {"value": stats["weeks"], "label": "weeks" if stats["weeks"] != 1 else "week"}]
    if stats["decisions"]:
        numbers.append({"value": stats["decisions"], "label": "decisions made" if stats["decisions"] != 1 else "decision made"})
    elif stats["stages_done"]:
        numbers.append({"value": stats["stages_done"], "label": "stages finished" if stats["stages_done"] != 1 else "stage finished"})
    if stats["steps_done"]:
        slides.append({"kind": "stats", "title": "What you did", "items": numbers})
    if len(stats["weekly"]) > 1 and sum(stats["weekly"]) > 0:
        slides.append({"kind": "chart", "title": "Week by week", "values": stats["weekly"], "labels": stats["weekly_labels"]})
    milestones = _milestones(db, goal)
    if milestones:
        slides.append({"kind": "milestones", "title": "Along the way", "items": milestones})
    decisions = _decisions(done)
    if decisions:
        slides.append({"kind": "decisions", "title": "What you decided", "items": decisions})
    what_happened = str(finish.get("what_happened") or "").strip()
    if what_happened:
        slides.append({"kind": "quote", "text": what_happened[:600], "attribution": "What happened, in your words"})
    elif (goal.description or "").strip():
        slides.append({"kind": "quote", "text": goal.description.strip()[:600], "attribution": "Why you started"})
    badge = badge_summary(db, goal.badge_id)
    slides.append({
        "kind": "medal", "title": (badge or {}).get("name") or goal.title, "subtitle": "Badge earned" if badge else "Goal complete",
        "image": (badge or {}).get("thumbnail_image") or "",
        "line": words.get("close") or (f"You finished {_plural(stats['steps_done'], 'step')} over {weeks}. That was all you." if stats["steps_done"] else "You set out to do this, and you saw it through."),
    })
    return slides


def _inputs_hash(db: Session, goal: Goal) -> str:
    stats = goal_stats(db, goal)
    data = {"title": goal.title, "why": goal.description, "finish": goal.finish, "finished_at": str(goal.finished_at), "stats": stats, "milestones": _milestones(db, goal)}
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:32]


def story_provider(db: Session):
    """Coach's model for the story's opening and closing lines, or None (fixed lines)."""
    from src.services.coach.policy import runtime
    from src.services.coach.providers import provider_for
    from src.services.hub_advisor import _ui_test_provider

    try:
        if _ui_test_provider(memory=True):
            return None
        policy = runtime(db)
        if not policy.enabled or not policy.can("finish_story"):
            return None
        model = policy.model(policy.tier_for("goal_finished"))
    except Exception:
        return None
    return provider_for(
        replace(model, settings={**model.settings, "max_output_tokens": 300}),
        instructions=policy.instructions("goal_finished", contract=STORY_WRITER_INSTRUCTIONS), allow_actions=False,
    )


async def _model_words(provider, db: Session, goal: Goal, slides: list[dict], safety_identifier: str) -> tuple[dict, str]:
    from src.services.hub_advisor import AdvisorMessage, _json_object

    facts = {"goal": goal.title, "why": (goal.description or "")[:600], "slides": [slide for slide in slides if slide["kind"] not in ("open", "medal")]}
    result = await provider.respond([AdvisorMessage(role="user", content=json.dumps(facts, ensure_ascii=False))], safety_identifier)
    data = _json_object(result.text)
    words = {key: " ".join(str(data.get(key) or "").split())[:limit] for key, limit in (("open", 120), ("close", 180))}
    return {key: value for key, value in words.items() if value}, result.model or ""


def ensure_story(db: Session, goal: Goal, provider=None) -> GoalStory:
    """The goal's current story, written now if it has none or the goal changed since the last one."""
    from src.services.hub_advisor import advisor_safety_identifier

    current = db.exec(select(GoalStory).where(GoalStory.goal_id == goal.id).order_by(GoalStory.version.desc())).first()  # type: ignore[attr-defined]
    inputs = _inputs_hash(db, goal)
    if current and current.inputs_hash == inputs and current.slides:
        return current
    words, model, status = {}, "", "fallback"
    if provider is not None:
        try:
            words, model = asyncio.run(_model_words(provider, db, goal, write_slides(db, goal), advisor_safety_identifier(int(goal.subject_user_id or goal.owner_user_id))))
            status = "ready" if words else "fallback"
        except Exception:
            logger.warning("Goal story wording failed; using fixed lines", exc_info=True)
    now = datetime.now().isoformat()
    story = GoalStory(
        story_uuid=f"goal_story_{uuid4()}", goal_id=int(goal.id), version=(current.version + 1) if current else 1,  # type: ignore[arg-type]
        status=status, slides=write_slides(db, goal, words), inputs_hash=inputs, model=model, creation_date=now, update_date=now,
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return story


# Serving it as an activity ----------------------------------------------------------------

def _text(block_id: str, text: str, heading: int | None = None) -> dict:
    node = {"type": "heading", "attrs": {"level": heading, "textAlign": "center"}} if heading else {"type": "paragraph", "attrs": {"textAlign": "center"}}
    return {"id": block_id, "type": "text", "content": {"nodes": [{**node, "content": [{"type": "text", "text": text}]}]}}


def _blocks(slide: dict, index: int) -> list[dict]:
    key = f"blk_story_{index}"
    kind = slide["kind"]
    if kind == "open":
        return [_text(f"{key}_kicker", "Your story"), _text(f"{key}_title", slide["title"], 1), _text(f"{key}_line", slide["line"])]
    if kind == "stats":
        return [_text(f"{key}_title", slide["title"], 2), {"id": f"{key}_stats", "type": "stat", "content": {"items": slide["items"]}}]
    if kind == "chart":
        return [_text(f"{key}_title", slide["title"], 2), {"id": f"{key}_chart", "type": "chart", "content": {"kind": "bars", "title": "Steps done each week", "values": slide["values"], "labels": slide["labels"]}}]
    if kind == "milestones":
        items = [{"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": item}]}]} for item in slide["items"]]
        return [_text(f"{key}_title", slide["title"], 2), {"id": f"{key}_list", "type": "text", "content": {"nodes": [{"type": "bulletList", "content": items}]}}]
    if kind == "decisions":
        blocks = [_text(f"{key}_title", slide["title"], 2)]
        for number, item in enumerate(slide["items"]):
            blocks.append({"id": f"{key}_d{number}", "type": "quote", "content": {"text": item["choice"], "attribution": item["question"]}})
        return blocks
    if kind == "quote":
        return [{"id": f"{key}_quote", "type": "quote", "content": {"text": slide["text"], "attribution": slide["attribution"]}}]
    return [
        {"id": f"{key}_medal", "type": "medal", "content": {"title": slide["title"], "subtitle": slide["subtitle"], "image": slide.get("image") or ""}},
        _text(f"{key}_line", slide["line"]),
    ]


STORY_SECONDS = {"open": 5000, "stats": 6000, "chart": 6000, "milestones": 7000, "decisions": 8000, "quote": 8000}


def story_document(goal: Goal, story: GoalStory) -> dict:
    """The story as an Activity Document: one page per slide, timed, ending on the medal."""
    pages = []
    for index, slide in enumerate(story.slides):
        last = index == len(story.slides) - 1
        design: dict = {"celebrate": True} if last else {"auto_advance_ms": STORY_SECONDS.get(slide["kind"], 6000)}
        pages.append({
            "page_uuid": f"{story.story_uuid}_{index}", "page_type": "standard", "title": slide.get("title") or slide["kind"].title(),
            "required": last, "design": design, "content": {"version": 2, "blocks": _blocks(slide, index), **({"action_label": "Done"} if last else {})},
        })
    return {
        "format": "launch-lms.activity", "format_version": 1,
        "activity": {
            "title": f"{goal.title}: your story", "description": "",
            "settings": {"design": {"background": {"color": "#0b1026", "gradient_to": "#3b0764", "scene": "starfield", "intensity": "medium"}, "progress": "segments", "exit": {"label": "Close"}}},
        },
        "pages": pages,
    }


def view(db: Session, current_user: PublicUser, goal_uuid: str) -> dict:
    """{goal, story, activity} for the story player. Only a finished goal has a story."""
    goal = access.goal_or_404(db, goal_uuid)
    access.require(db, goal, current_user.id, "view_plan")
    if _value(goal.status) != GoalStatus.FINISHED.value:
        raise HTTPException(status_code=409, detail="This goal's story is written when it's finished")
    story = ensure_story(db, goal, story_provider(db))
    document = story_document(goal, story)
    return {
        "goal": {"goal_uuid": goal.goal_uuid, "title": goal.title},
        "story": {"story_uuid": story.story_uuid, "version": story.version, "status": story.status},
        "activity": {"activity_uuid": story.story_uuid, **document["activity"], "pages": document["pages"]},
    }

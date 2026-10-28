"""Where an assignment's learners are, step by step, and what needs staff.

Every learner's step sits in one of five places, in time order:

- ``done``: completed or excused.
- ``review``: handed in (or activity answers to grade), waiting on staff.
- ``behind``: not handed in and its close date has passed (its own due date, else its stage's end),
  or the assignment has ended.
- ``open``: the learner can work on it now.
- ``locked``: not open yet (its stage hasn't started, it opens on a date, it waits on another step,
  or staff hold it).

Counts roll up per step (with who is in each place), per stage, per learner and for the whole
assignment. What needs staff: unread questions from learners about the plan, work to review
(until it's reviewed), and learners behind.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlmodel import Session, col, select

from src.db.conversations import Conversation, ConversationMember, ConversationMessage, ConversationMessageRef
from src.db.goals import (
    DONE_STEP_STATUSES,
    AssignmentStatus,
    Goal,
    GoalAssignment,
    GoalStage,
    GoalStep,
    GoalTemplateVersion,
    StepProgress,
    StepStatus,
)
from src.services.goals import schedule
from src.services.goals.activity_reviews import activity_reviews
from src.services.goals.availability import availability
from src.services.goals.document import iter_steps

CATEGORIES = ("done", "review", "behind", "open", "locked")


def _value(item) -> str:
    return getattr(item, "value", item)


def zero() -> dict[str, int]:
    return {name: 0 for name in CATEGORIES}


def cell(step: GoalStep, status: str, lock: dict, closes: date | None, to_grade: bool, ended: bool, today: date) -> str:
    """One learner's step: done, review, behind, open or locked."""
    if status in DONE_STEP_STATUSES:
        return "done"
    if status == StepStatus.SUBMITTED.value or to_grade:
        return "review"
    if ended or (lock.get("reason") or {}).get("kind") == "closed" or (closes and closes < today and not step.held):
        return "behind"
    if lock.get("locked"):
        return "locked"
    return "open"


@dataclass
class Learner:
    goal: Goal
    cells: dict[str, str] = field(default_factory=dict)
    questions: dict[str | None, int] = field(default_factory=dict)
    # Each template step's own step on the learner's goal, and when it closes for them.
    steps: dict[str, GoalStep] = field(default_factory=dict)
    closes: dict[str, date | None] = field(default_factory=dict)

    @property
    def counts(self) -> dict[str, int]:
        result = zero()
        for name in self.cells.values():
            result[name] += 1
        return result

    @property
    def question_count(self) -> int:
        return sum(self.questions.values())


@dataclass
class Board:
    """An assignment's learners by template step, with the questions waiting on the viewer."""

    assignment: GoalAssignment
    document: dict
    learners: list[Learner]
    # Questions in the whole-group chat, by template step key (None: about the plan).
    group_questions: dict[str | None, int] = field(default_factory=dict)

    def step_keys(self) -> list[str]:
        return [spec["key"] for _, spec in iter_steps(self.document)]

    def step(self, key: str) -> dict:
        counts, who = zero(), {name: [] for name in CATEGORIES}
        for learner in self.learners:
            name = learner.cells.get(key)
            if name:
                counts[name] += 1
                if learner.goal.subject_user_id:
                    who[name].append(int(learner.goal.subject_user_id))
        questions = sum(learner.questions.get(key, 0) for learner in self.learners) + self.group_questions.get(key, 0)
        return {"counts": counts, "who": who, "questions": questions}

    def stage(self, keys: list[str]) -> dict[str, int]:
        counts = zero()
        for learner in self.learners:
            for key in keys:
                if key in learner.cells:
                    counts[learner.cells[key]] += 1
        return counts

    def counts(self) -> dict[str, int]:
        counts = zero()
        for learner in self.learners:
            for name, count in learner.counts.items():
                counts[name] += count
        return counts

    def needs(self) -> dict[str, int]:
        """What needs staff: questions waiting, steps to review, and learners behind."""
        return {
            "questions": sum(learner.question_count for learner in self.learners) + sum(self.group_questions.values()),
            "review": sum(learner.counts["review"] for learner in self.learners),
            "behind": sum(1 for learner in self.learners if learner.counts["behind"]),
        }


def _unread(db: Session, viewer_id: int, conversation_ids: set[int]) -> dict[int, str | None]:
    """When the viewer last read each conversation they're in ("" when never)."""
    if not conversation_ids:
        return {}
    rows = db.exec(select(ConversationMember).where(col(ConversationMember.conversation_id).in_(conversation_ids), ConversationMember.user_id == viewer_id)).all()
    return {int(row.conversation_id): row.last_read_at or "" for row in rows}


def _learner_questions(db: Session, viewer_id: int, goals: list[Goal], keys: dict[str, str]) -> dict[int, dict[str | None, int]]:
    """Per goal: the learner's unread messages about it, by template step key (None: about the plan)."""
    by_id = {int(goal.id): goal for goal in goals if goal.subject_user_id}  # type: ignore[arg-type]
    if not by_id:
        return {}
    rows = db.exec(
        select(ConversationMessageRef.goal_id, ConversationMessageRef.step_uuid, ConversationMessage)
        .join(ConversationMessage, ConversationMessage.id == ConversationMessageRef.message_id)
        .where(col(ConversationMessageRef.goal_id).in_(list(by_id)), ConversationMessage.kind == "text")
    ).all()
    read = _unread(db, viewer_id, {int(message.conversation_id) for _, _, message in rows})
    found: dict[int, dict[str | None, int]] = {}
    seen: set[tuple[int, int]] = set()
    for goal_id, step_uuid, message in rows:
        goal = by_id[int(goal_id)]
        last = read.get(int(message.conversation_id))
        if message.sender_user_id != goal.subject_user_id or last is None or message.creation_date <= last or (int(goal_id), int(message.id)) in seen:
            continue
        seen.add((int(goal_id), int(message.id)))
        key = keys.get(step_uuid) if step_uuid else None
        found.setdefault(int(goal_id), {})
        found[int(goal_id)][key] = found[int(goal_id)].get(key, 0) + 1
    return found


def _group_questions(db: Session, viewer_id: int, assignment: GoalAssignment, learner_ids: set[int]) -> dict[str | None, int]:
    """Unread messages from learners in the assignment's group chats, by template step key."""
    conversations = {int(row.id): row for row in db.exec(select(Conversation).where(Conversation.assignment_id == assignment.id)).all()}  # type: ignore[arg-type]
    read = _unread(db, viewer_id, set(conversations))
    found: dict[str | None, int] = {}
    for conversation_id, last in read.items():
        messages = db.exec(select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation_id, ConversationMessage.kind == "text",
            ConversationMessage.creation_date > last, col(ConversationMessage.sender_user_id).in_(learner_ids or {-1}),
        )).all()
        refs: dict[int, str | None] = {}
        if messages:
            for ref in db.exec(select(ConversationMessageRef).where(col(ConversationMessageRef.message_id).in_([message.id for message in messages]))).all():
                refs.setdefault(int(ref.message_id), ref.step_uuid)
        for message in messages:
            key = refs.get(int(message.id))  # type: ignore[arg-type]
            found[key] = found.get(key, 0) + 1
    return found


def board(db: Session, assignment: GoalAssignment, viewer_id: int, today: date | None = None) -> Board:
    """Every learner's place on every template step of the assignment, and the viewer's unread questions."""
    today = today or date.today()
    version = db.get(GoalTemplateVersion, assignment.version_id)
    document = (version.document if version else None) or {}
    goals = list(db.exec(select(Goal).where(Goal.assignment_id == assignment.id).order_by(col(Goal.id))).all())
    goal_ids = [int(goal.id) for goal in goals]  # type: ignore[arg-type]
    steps: dict[int, list[GoalStep]] = {}
    for step in db.exec(select(GoalStep).where(col(GoalStep.goal_id).in_(goal_ids))).all() if goal_ids else []:
        steps.setdefault(int(step.goal_id), []).append(step)
    stages: dict[int, list[GoalStage]] = {}
    for stage in db.exec(select(GoalStage).where(col(GoalStage.goal_id).in_(goal_ids))).all() if goal_ids else []:
        stages.setdefault(int(stage.goal_id), []).append(stage)
    step_ids = [int(step.id) for rows in steps.values() for step in rows]  # type: ignore[arg-type]
    progress = {int(row.step_id): _value(row.status) for row in db.exec(select(StepProgress).where(col(StepProgress.step_id).in_(step_ids))).all()} if step_ids else {}
    grading = {review["step_uuid"] for review in activity_reviews(db, goals)}
    keys = {step.step_uuid: step.template_key for rows in steps.values() for step in rows if step.template_key}
    template_keys = {spec["key"] for _, spec in iter_steps(document)}
    ended = _value(assignment.status) == AssignmentStatus.ENDED.value
    questions = _learner_questions(db, viewer_id, goals, keys)  # type: ignore[arg-type]
    learners = []
    for goal in goals:
        goal_steps, goal_stages = steps.get(int(goal.id), []), stages.get(int(goal.id), [])  # type: ignore[arg-type]
        statuses = {int(step.id): progress.get(int(step.id), StepStatus.NOT_STARTED.value) for step in goal_steps}  # type: ignore[arg-type]
        locks = availability(goal, goal_stages, goal_steps, statuses, today)
        ends = schedule.stage_ends(goal, goal_stages)
        learner = Learner(goal=goal, questions=questions.get(int(goal.id), {}))  # type: ignore[arg-type]
        for step in goal_steps:
            if step.template_key in template_keys and step.template_key not in learner.cells:
                closes = step.due_date or (ends.get(int(step.stage_id)) if step.stage_id else goal.target_date)
                learner.steps[step.template_key], learner.closes[step.template_key] = step, closes  # type: ignore[index]
                learner.cells[step.template_key] = cell(step, statuses[int(step.id)], locks[int(step.id)], closes,  # type: ignore[index, arg-type]
                                                        step.step_uuid in grading, ended, today)
        learners.append(learner)
    learner_ids = {int(goal.subject_user_id) for goal in goals if goal.subject_user_id}
    return Board(assignment=assignment, document=document, learners=learners, group_questions=_group_questions(db, viewer_id, assignment, learner_ids))
